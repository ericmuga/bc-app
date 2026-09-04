/**
 * controllers/legacyReportController.js
 * Handlers for the "Reporting → Legacy Downloads" endpoints (/reporting/legacy/*).
 * All routes require admin or data-analyst (enforced in routes/index.js).
 * READ-ONLY: delegates to LegacyReportModel, which only ever issues SELECTs.
 */
import * as XLSX from 'xlsx';
import * as Legacy from '../models/LegacyReportModel.js';
import { catalogue } from '../services/legacyReports.js';
import logger from '../services/logger.js';

/** GET /api/reporting/legacy/sources → registry catalogue (sources + datasets). */
export function listSources(_req, res) {
  return res.json({ sources: catalogue() });
}

function parseFilters(query) {
  return {
    dateFrom:    query.dateFrom || null,
    dateTo:      query.dateTo || null,
    documentNo:  query.documentNo || null,
    vendorNo:    query.vendorNo || null,
    customerNo:  query.customerNo || null,
    glAccountNo: query.glAccountNo || null,
    sourceCode:  query.sourceCode || null,
  };
}

/** GET /api/reporting/legacy/run → paginated preview. */
export async function run(req, res) {
  try {
    const { source, dataset } = req.query;
    if (!source || !dataset) {
      return res.status(400).json({ error: 'source and dataset are required' });
    }
    const result = await Legacy.runDataset({
      sourceKey: source,
      datasetKey: dataset,
      filters: parseFilters(req.query),
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    return res.json(result);
  } catch (err) {
    logger.error('reporting/legacy/run error', { error: err.message });
    const status = /^Unknown (source|dataset)/.test(err.message) ? 400 : 500;
    return res.status(status).json({ error: err.message });
  }
}

function sendCsv(res, filename, columns, rows) {
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.join(',');
  const body = rows.map((r) => columns.map((c) => escape(r[c])).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  return res.send(`${header}\r\n${body}`);
}

function sendXlsx(res, filename, columns, rows) {
  const aoa = [columns, ...rows.map((r) => columns.map((c) => {
    const v = r[c];
    return v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? '');
  }))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  return res.send(buf);
}

/** GET /api/reporting/legacy/download?format=csv|xlsx → full filtered export. */
export async function download(req, res) {
  try {
    const { source, dataset } = req.query;
    const format = String(req.query.format || 'csv').toLowerCase();
    if (!source || !dataset) {
      return res.status(400).json({ error: 'source and dataset are required' });
    }
    if (!['csv', 'xlsx'].includes(format)) {
      return res.status(400).json({ error: "format must be 'csv' or 'xlsx'" });
    }

    const { rows, columns, total, truncated, cap } = await Legacy.fetchForDownload({
      sourceKey: source,
      datasetKey: dataset,
      filters: parseFilters(req.query),
    });

    // Surface truncation to the client via a header (the file itself stays clean).
    res.setHeader('X-Row-Count', String(rows.length));
    res.setHeader('X-Total-Count', String(total));
    if (truncated) res.setHeader('X-Truncated', `true; cap=${cap}`);

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `legacy-${source}-${dataset}-${stamp}`.replace(/[^a-z0-9\-]/gi, '-');

    return format === 'xlsx'
      ? sendXlsx(res, filename, columns, rows)
      : sendCsv(res, filename, columns, rows);
  } catch (err) {
    logger.error('reporting/legacy/download error', { error: err.message });
    const status = /^Unknown (source|dataset)/.test(err.message) ? 400 : 500;
    return res.status(status).json({ error: err.message });
  }
}
