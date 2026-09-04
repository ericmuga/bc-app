/**
 * controllers/legacyReportController.js
 * Handlers for the "Reporting → Legacy Downloads" endpoints (/reporting/legacy/*).
 * All routes require admin or data-analyst (enforced in routes/index.js).
 * READ-ONLY: delegates to LegacyReportModel, which only ever issues SELECTs.
 */
// xlsx-js-style is a drop-in community fork of SheetJS that CAN write cell
// styles. Imported here ONLY for the Legacy Downloads export so the header row
// can be bold + shaded. Other pages keep using plain `xlsx` (unstyled).
import XLSX from 'xlsx-js-style';   // CJS module — default export holds .utils/.write
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
      mode: req.query.mode,
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

// Header/title-row style (xlsx-js-style): bold white text on a solid blue fill,
// matching the app's --bc-primary accent, with a thin border for sharp contrast.
const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 11 },
  fill: { patternType: 'solid', fgColor: { rgb: 'FF1D4ED8' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: {
    top:    { style: 'thin', color: { rgb: 'FF1E40AF' } },
    bottom: { style: 'thin', color: { rgb: 'FF1E40AF' } },
    left:   { style: 'thin', color: { rgb: 'FF1E40AF' } },
    right:  { style: 'thin', color: { rgb: 'FF1E40AF' } },
  },
};

function sendXlsx(res, filename, columns, rows) {
  const aoa = [columns, ...rows.map((r) => columns.map((c) => {
    const v = r[c];
    return v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? '');
  }))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Style the header row (row 0) — bold + shaded fill for high contrast.
  for (let c = 0; c < columns.length; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[ref]) ws[ref].s = HEADER_STYLE;
  }
  // Sensible column widths so the bold header is readable.
  ws['!cols'] = columns.map((col) => ({ wch: Math.min(Math.max(String(col).length + 2, 12), 40) }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

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

    const { rows, columns, total, truncated, cap, mode } = await Legacy.fetchForDownload({
      sourceKey: source,
      datasetKey: dataset,
      filters: parseFilters(req.query),
      mode: req.query.mode,
    });

    // Surface truncation to the client via a header (the file itself stays clean).
    res.setHeader('X-Row-Count', String(rows.length));
    res.setHeader('X-Total-Count', String(total));
    if (truncated) res.setHeader('X-Truncated', `true; cap=${cap}`);

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `legacy-${source}-${dataset}-${mode}-${stamp}`.replace(/[^a-z0-9\-]/gi, '-');

    return format === 'xlsx'
      ? sendXlsx(res, filename, columns, rows)
      : sendCsv(res, filename, columns, rows);
  } catch (err) {
    logger.error('reporting/legacy/download error', { error: err.message });
    const status = /^Unknown (source|dataset)/.test(err.message) ? 400 : 500;
    return res.status(status).json({ error: err.message });
  }
}
