/**
 * controllers/financeController.js
 * Handlers for finance reporting endpoints: Trial Balance, P&L, Balance Sheet.
 */
import * as FinanceReport from '../models/FinanceReport.js';
import * as ArRecon from '../models/ArRecon.js';
import { db } from '../db/pool.js';
import logger from '../services/logger.js';
import { getOrSet, clearNamespace } from '../services/reportCache.js';
import { getPlDefinition, savePlDefinition } from '../services/financePl.js';

const VALID_REPORT_TYPES = ['trialBalance', 'profitLoss', 'balanceSheet'];

/**
 * GET /api/finance/run
 * Query params:
 *   type      trialBalance | profitLoss | balanceSheet
 *   companies comma-separated (optional, default=all)
 *   dateFrom  YYYY-MM-DD  (period start; also closing balance start for TB)
 *   dateTo    YYYY-MM-DD  (period end)
 *   ytdFrom   YYYY-MM-DD  (YTD start, for profitLoss, default Apr 1 of fiscal year)
 *   refresh   1 | true
 */
export async function runFinanceReport(req, res) {
  try {
    const { type, dateFrom, dateTo } = req.query;

    if (!type || !VALID_REPORT_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_REPORT_TYPES.join(', ')}` });
    }
    if (!dateTo) {
      return res.status(400).json({ error: 'dateTo is required' });
    }
    if (type !== 'balanceSheet' && !dateFrom) {
      return res.status(400).json({ error: 'dateFrom is required' });
    }

    const splitCSV = (v) => v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
    const companies = splitCSV(req.query.companies);
    const refresh   = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase());

    // Default ytdFrom: April 1 of the fiscal year containing dateTo
    let ytdFrom = req.query.ytdFrom;
    if (!ytdFrom && type === 'profitLoss') {
      const to    = new Date(dateTo);
      const fiscalYear = to.getMonth() < 3 ? to.getFullYear() - 1 : to.getFullYear();
      ytdFrom = `${fiscalYear}-04-01`;
    }

    const cacheQuery = { type, companies: companies.join(','), dateFrom, dateTo, ytdFrom };
    const key = { query: cacheQuery, userId: req.user?.userId };

    const { value, cached } = await getOrSet('finance-report', key, async () => {
      if (type === 'trialBalance') {
        // Fast path: read pre-aggregated balances from FCLWHS.FACT_GL_MONTHLY
        // (refreshed every 2h) when every requested company has been built.
        // Otherwise fall back to the live G/L Entry query.
        if (await FinanceReport.isGlMonthlyBuilt(companies)) {
          return FinanceReport.getTrialBalanceFast({ companies, dateFrom, dateTo });
        }
        return FinanceReport.getTrialBalance({ companies, dateFrom, dateTo });
      }
      if (type === 'profitLoss') {
        return FinanceReport.getProfitLoss({ companies, dateFrom, dateTo, ytdFrom });
      }
      if (type === 'balanceSheet') {
        return FinanceReport.getBalanceSheet({ companies, dateTo });
      }
    }, { ttlMs: 10 * 60_000, refresh });

    res.set('X-Report-Cache', cached ? 'HIT' : 'MISS');
    // Surface the warehouse "as of" instant for the Trial Balance fast path so
    // the UI can show how fresh the pre-aggregated data is.
    if (type === 'trialBalance') {
      try {
        const asOf = await FinanceReport.getGlMonthlyAsOf(companies);
        if (asOf) res.set('X-Report-AsOf', new Date(asOf).toISOString());
      } catch { /* non-fatal */ }
    }
    return res.json(value);
  } catch (err) {
    logger.error('finance/run error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export function clearFinanceCache(_req, res) {
  clearNamespace('finance-report');
  clearNamespace('finance-gl-mappings');
  clearNamespace('finance-pl');
  return res.json({ message: 'Finance report cache cleared' });
}

// ── Configurable P&L statement ────────────────────────────────────────────────
/** GET /api/finance/pl?company=FCL&dateFrom=&dateTo=&refresh= */
export async function runPlStatement(req, res) {
  try {
    const company = String(req.query.company || 'FCL').toUpperCase();
    const { dateFrom, dateTo, ytdFrom } = req.query;
    if (!dateFrom || !dateTo) return res.status(400).json({ error: 'dateFrom and dateTo are required' });
    const refresh = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase());
    const { value, cached } = await getOrSet('finance-pl', { query: { company, dateFrom, dateTo, ytdFrom, version: 3 } },
      () => FinanceReport.computePlStatement({ company, dateFrom, dateTo, ytdFrom }), { ttlMs: 10 * 60_000, refresh });
    res.set('X-Report-Cache', cached ? 'HIT' : 'MISS');
    return res.json(value);
  } catch (err) {
    logger.error('finance/pl error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/finance/pl/definition?company=FCL — the editable line/account mapping. */
export async function getPlDef(req, res) {
  try { return res.json(await getPlDefinition(req.query.company || 'FCL')); }
  catch (err) { return res.status(500).json({ error: err.message }); }
}

/** PUT /api/finance/pl/definition (admin) — save/override a company's mapping. */
export async function savePlDef(req, res) {
  try {
    const company = String(req.body?.company || '').toUpperCase();
    const def = await savePlDefinition(company, req.body?.definition);
    clearNamespace('finance-pl');
    return res.json(def);
  } catch (err) { return res.status(400).json({ error: err.message }); }
}

/** GET /api/finance/gl-mappings */
export async function listGlMappings(_req, res) {
  try {
    const { value } = await getOrSet('finance-gl-mappings', 'all', async () => {
      const pool = await db.getPool();
      return FinanceReport.listGlMappings(pool);
    }, { ttlMs: 60 * 60_000 });
    return res.json(value);
  } catch (err) {
    logger.error('finance/gl-mappings GET error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/** POST/PATCH /api/finance/gl-mappings[/:mapId] */
export async function saveGlMapping(req, res) {
  try {
    const pool = await db.getPool();
    const mapping = { ...req.body, mapId: req.params.mapId || null };
    const result = await FinanceReport.saveGlMapping(pool, mapping);
    clearNamespace('finance-gl-mappings');
    return res.json(result);
  } catch (err) {
    logger.error('finance/gl-mappings SAVE error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/** DELETE /api/finance/gl-mappings/:mapId */
export async function deleteGlMapping(req, res) {
  try {
    const pool = await db.getPool();
    await FinanceReport.deleteGlMapping(pool, req.params.mapId);
    clearNamespace('finance-gl-mappings');
    return res.json({ message: 'Deleted' });
  } catch (err) {
    logger.error('finance/gl-mappings DELETE error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

// ── Receivables reconciliation (sub-ledger vs G/L control accounts) ──────────
const isoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && Number.isFinite(Date.parse(v));

function arReconArgs(req) {
  const company  = String(req.query.company || 'FCL').toUpperCase();
  const { dateFrom, dateTo } = req.query;
  if (!isoDate(dateFrom) || !isoDate(dateTo)) throw Object.assign(new Error('dateFrom and dateTo (YYYY-MM-DD) are required'), { status: 400 });
  if (dateFrom > dateTo) throw Object.assign(new Error('dateFrom must not be after dateTo'), { status: 400 });
  const refresh = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase());
  return { company, dateFrom, dateTo, refresh };
}

/** GET /api/finance/ar-recon/summary?company&dateFrom&dateTo */
export async function arReconSummary(req, res) {
  try {
    const { refresh, ...args } = arReconArgs(req);
    const { value, cached } = await getOrSet('finance-ar-recon', { fn: 'summary', ...args },
      () => ArRecon.summary(args), { ttlMs: 10 * 60_000, refresh });
    res.set('X-Report-Cache', cached ? 'HIT' : 'MISS');
    return res.json(value);
  } catch (err) {
    logger.error('finance/ar-recon/summary error', { error: err.message });
    return res.status(err.status || 500).json({ error: err.message });
  }
}

/** GET /api/finance/ar-recon/detail?company&account&dateFrom&dateTo&scope=period|all */
export async function arReconDetail(req, res) {
  try {
    const { refresh, ...args } = arReconArgs(req);
    const account = String(req.query.account || '').trim();
    if (!account) return res.status(400).json({ error: 'account is required' });
    const scope = req.query.scope === 'all' ? 'all' : 'period';
    const { value, cached } = await getOrSet('finance-ar-recon', { fn: 'detail', ...args, account, scope },
      () => ArRecon.detail({ ...args, account, scope }), { ttlMs: 10 * 60_000, refresh });
    res.set('X-Report-Cache', cached ? 'HIT' : 'MISS');
    return res.json(value);
  } catch (err) {
    logger.error('finance/ar-recon/detail error', { error: err.message });
    return res.status(err.status || (/not a receivables account|Unknown company/.test(err.message) ? 400 : 500)).json({ error: err.message });
  }
}
