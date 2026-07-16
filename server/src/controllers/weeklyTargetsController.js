/**
 * controllers/weeklyTargetsController.js
 * Upload + read weekly domestic sales targets (FCLWHS.FACT_WEEKLYTARGETS).
 */
import * as Targets from '../models/WeeklyTargetsModel.js';
import logger from '../services/logger.js';

const ok  = (res, data) => res.json(data);
const err = (res, e, code = 500) => {
  logger.error('weekly targets error', { error: e.message });
  res.status(code).json({ error: e.message });
};
const splitCSV = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

export async function list(req, res) {
  try {
    ok(res, await Targets.listTargets({
      months: splitCSV(req.query.months), companies: splitCSV(req.query.companies),
      q: req.query.q, limit: req.query.limit,
    }));
  } catch (e) { err(res, e); }
}

/** GET /weekly-targets/summary — correct totals + drill-down subtotals (server aggregate). */
export async function summary(req, res) {
  try {
    ok(res, await Targets.summarize(
      { months: splitCSV(req.query.months), companies: splitCSV(req.query.companies), q: req.query.q },
      req.query.groupBy || 'none',
    ));
  } catch (e) { err(res, e); }
}

export async function months(_req, res) {
  try { ok(res, await Targets.listMonths()); }
  catch (e) { err(res, e); }
}

export function columns(_req, res) { ok(res, Targets.TARGET_COLUMNS); }

/**
 * POST /weekly-targets/upload  body: { rows:[...], mode:'append'|'replace' }
 * replace = delete every existing row for the month(s) present, then insert.
 */
export async function upload(req, res) {
  try {
    const rows = req.body?.rows;
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'rows array required' });
    const mode = req.body?.mode === 'replace' ? 'replace' : 'append';
    let deleted = 0;
    if (mode === 'replace') {
      // Client may pass the FULL month list (chunked uploads) so every target
      // month is cleared on the first chunk; else fall back to months in the rows.
      const monthsPresent = (Array.isArray(req.body?.replaceMonths) && req.body.replaceMonths.length)
        ? req.body.replaceMonths
        : [...new Set(rows.map((r) => r.MonthNameSorted).filter(Boolean))];
      if (!monthsPresent.length) return res.status(400).json({ error: 'Replace mode needs a MonthNameSorted on the rows' });
      deleted = await Targets.deleteMonths(monthsPresent);
    }
    const { inserted } = await Targets.bulkInsert(rows);
    ok(res, { inserted, deleted, mode });
  } catch (e) { err(res, e, 400); }
}

/** POST /weekly-targets/split — preview (commit=false) or write (commit=true). */
export async function split(req, res) {
  try {
    const { baseMonth, targetMonth, domesticVol, exportVol, exportSalesMonths, commit } = req.body || {};
    const p = { baseMonth, targetMonth, domesticVol, exportVol, exportSalesMonths };
    if (commit) return ok(res, await Targets.commitSplit(p));
    const { rows, summary } = await Targets.generateSplit(p);
    ok(res, { summary, sample: rows.slice(0, 100) });
  } catch (e) { err(res, e, 400); }
}
