/**
 * controllers/financeController.js
 * Handlers for finance reporting endpoints: Trial Balance, P&L, Balance Sheet.
 */
import * as FinanceReport from '../models/FinanceReport.js';
import { db } from '../db/pool.js';
import logger from '../services/logger.js';
import { getOrSet, clearNamespace } from '../services/reportCache.js';

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
    return res.json(value);
  } catch (err) {
    logger.error('finance/run error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export function clearFinanceCache(_req, res) {
  clearNamespace('finance-report');
  clearNamespace('finance-gl-mappings');
  return res.json({ message: 'Finance report cache cleared' });
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
