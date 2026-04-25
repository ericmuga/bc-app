/**
 * controllers/mgmtController.js
 * Management Accounts — template/line/formula/measure CRUD + report execution.
 */
import * as MgmtReport from '../models/MgmtReport.js';
import { db } from '../db/pool.js';
import { bcDb, bcSql } from '../db/bcPool.js';
import { bcTable, resolveCompanies, ALL_COMPANIES } from '../services/bcTables.js';
import logger from '../services/logger.js';
import { getOrSet, clearNamespace } from '../services/reportCache.js';

const p = () => db.getPool();

// ── Templates ─────────────────────────────────────────────────────────────────
export async function listTemplates(_req, res) {
  try {
    return res.json(await MgmtReport.listTemplates(await p()));
  } catch (err) {
    logger.error('mgmt/templates GET error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function saveTemplate(req, res) {
  try {
    const pool     = await p();
    const template = { ...req.body, templateId: req.params.templateId || null };
    const result   = await MgmtReport.saveTemplate(pool, template);
    clearNamespace('mgmt-report');
    return res.json(result);
  } catch (err) {
    logger.error('mgmt/templates SAVE error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteTemplate(req, res) {
  try {
    await MgmtReport.deleteTemplate(await p(), req.params.templateId);
    clearNamespace('mgmt-report');
    return res.json({ message: 'Deleted' });
  } catch (err) {
    logger.error('mgmt/templates DELETE error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

// ── Lines ─────────────────────────────────────────────────────────────────────
export async function listLines(req, res) {
  try {
    return res.json(await MgmtReport.listLines(await p(), req.params.templateId));
  } catch (err) {
    logger.error('mgmt/lines GET error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function saveLine(req, res) {
  try {
    const pool   = await p();
    const line   = { ...req.body, lineId: req.params.lineId || null, templateId: req.params.templateId };
    const result = await MgmtReport.saveLine(pool, line);
    clearNamespace('mgmt-report');
    return res.json(result);
  } catch (err) {
    logger.error('mgmt/lines SAVE error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteLine(req, res) {
  try {
    await MgmtReport.deleteLine(await p(), req.params.lineId);
    clearNamespace('mgmt-report');
    return res.json({ message: 'Deleted' });
  } catch (err) {
    logger.error('mgmt/lines DELETE error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

// ── Formulas ──────────────────────────────────────────────────────────────────
export async function listFormulas(req, res) {
  try {
    return res.json(await MgmtReport.listFormulas(await p(), req.params.lineId));
  } catch (err) {
    logger.error('mgmt/formulas GET error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function saveFormula(req, res) {
  try {
    const pool    = await p();
    const formula = { ...req.body, formulaId: req.params.formulaId || null, lineId: req.params.lineId };
    const result  = await MgmtReport.saveFormula(pool, formula);
    clearNamespace('mgmt-report');
    return res.json(result);
  } catch (err) {
    logger.error('mgmt/formulas SAVE error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteFormula(req, res) {
  try {
    await MgmtReport.deleteFormula(await p(), req.params.formulaId);
    clearNamespace('mgmt-report');
    return res.json({ message: 'Deleted' });
  } catch (err) {
    logger.error('mgmt/formulas DELETE error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

// ── Measures ──────────────────────────────────────────────────────────────────
export async function listMeasures(req, res) {
  try {
    return res.json(await MgmtReport.listMeasures(await p(), req.params.templateId));
  } catch (err) {
    logger.error('mgmt/measures GET error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function saveMeasure(req, res) {
  try {
    const pool    = await p();
    const measure = { ...req.body, measureId: req.params.measureId || null, templateId: req.params.templateId };
    const result  = await MgmtReport.saveMeasure(pool, measure);
    clearNamespace('mgmt-report');
    return res.json(result);
  } catch (err) {
    logger.error('mgmt/measures SAVE error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteMeasure(req, res) {
  try {
    await MgmtReport.deleteMeasure(await p(), req.params.measureId);
    clearNamespace('mgmt-report');
    return res.json({ message: 'Deleted' });
  } catch (err) {
    logger.error('mgmt/measures DELETE error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

// ── Dimension Values lookup ───────────────────────────────────────────────────
/**
 * GET /api/mgmt/dimension-values?dimensionCode=DEPARTMENT
 * Returns distinct dimension value codes+names across all companies.
 */
export async function listDimensionValues(req, res) {
  try {
    const { dimensionCode } = req.query;
    if (!dimensionCode) return res.status(400).json({ error: 'dimensionCode is required' });

    const bcPool = await bcDb.getPool();
    const blocks = ALL_COMPANIES.map(c => {
      const tbl = bcTable(c, 'Dimension Value');
      return `SELECT RTRIM([Code]) AS Code, RTRIM(ISNULL([Name],'')) AS Name
              FROM ${tbl}
              WHERE RTRIM([Dimension Code]) = @dimCode AND [Blocked] = 0`;
    });

    const r = await bcPool.request()
      .input('dimCode', bcSql.NVarChar(20), dimensionCode.toUpperCase())
      .query(`
        SELECT [Code], MAX([Name]) AS Name
        FROM (${blocks.join('\nUNION ALL\n')}) t
        GROUP BY [Code]
        ORDER BY [Code]
      `);

    return res.json(r.recordset);
  } catch (err) {
    logger.error('mgmt/dimension-values error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

// ── GL Accounts lookup (from BC DB) ──────────────────────────────────────────
/** GET /api/mgmt/accounts?company=FCL
 *  Returns posting GL accounts for the given company (or all companies if omitted).
 *  Used to populate account dropdowns in the formula builder.
 */
export async function listGlAccounts(req, res) {
  try {
    const { company } = req.query;
    const companies   = resolveCompanies(company ? [company] : []);
    const bcPool      = await bcDb.getPool();

    const blocks = companies.map(c => {
      const acct = bcTable(c, 'G_L Account');
      return `
        SELECT '${c}' AS Company, [No_] AS AccountNo, RTRIM([Name]) AS AccountName
        FROM ${acct}
        WHERE [Account Type] = 0 AND [Blocked] = 0
      `;
    });

    const r = await bcPool.request().query(
      blocks.join('\nUNION ALL\n') + '\nORDER BY AccountNo'
    );
    return res.json(r.recordset);
  } catch (err) {
    logger.error('mgmt/accounts GET error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

// ── Report execution ──────────────────────────────────────────────────────────
/** GET /api/mgmt/run?templateId=...&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&dim1Code=&dim2Code=&refresh=1 */
export async function runReport(req, res) {
  try {
    const { templateId, dateFrom, dateTo, refresh } = req.query;
    if (!templateId) return res.status(400).json({ error: 'templateId is required' });
    if (!dateFrom)   return res.status(400).json({ error: 'dateFrom is required' });
    if (!dateTo)     return res.status(400).json({ error: 'dateTo is required' });

    const dim1Code      = req.query.dim1Code || '';
    const dim2Code      = req.query.dim2Code || '';
    const shouldRefresh = ['1', 'true'].includes(String(refresh || '').toLowerCase());
    const pool          = await p();

    const { value, cached } = await getOrSet(
      'mgmt-report',
      { templateId, dateFrom, dateTo, dim1Code, dim2Code },
      () => MgmtReport.runMgmtReport(pool, { templateId, dateFrom, dateTo, dim1Code, dim2Code }),
      { ttlMs: 10 * 60_000, refresh: shouldRefresh }
    );

    res.set('X-Report-Cache', cached ? 'HIT' : 'MISS');
    return res.json(value);
  } catch (err) {
    logger.error('mgmt/run error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/mgmt/line-detail?templateId=&lineCode=&dateFrom=&dateTo=&dim1Code=&dim2Code= */
export async function getLineDetail(req, res) {
  try {
    const { templateId, lineCode, dateFrom, dateTo } = req.query;
    if (!templateId || !lineCode || !dateFrom || !dateTo)
      return res.status(400).json({ error: 'templateId, lineCode, dateFrom and dateTo are required' });
    const dim1Code = req.query.dim1Code || '';
    const dim2Code = req.query.dim2Code || '';
    const pool     = await p();
    const result   = await MgmtReport.getLineDetail(pool, { templateId, lineCode, dateFrom, dateTo, dim1Code, dim2Code });
    return res.json(result);
  } catch (err) {
    logger.error('mgmt/line-detail error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}
