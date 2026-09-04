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
    // Item Ledger / document line / slaughter filters
    itemNo:      query.itemNo || null,
    sourceNo:    query.sourceNo || null,
    inventoryPostingGroup: query.inventoryPostingGroup || null,
    // Enum multi-selects arrive as comma-separated codes (e.g. "0,1,4").
    entryTypes:  query.entryTypes || null,
    statuses:    query.statuses || null,
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

// Single-cell CSV escaping (RFC-4180): quote when the value contains a comma,
// quote, or newline; double any embedded quotes.
function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

/**
 * Stream a CSV export page-by-page so Node memory stays flat regardless of how
 * many rows match. Headers are written up front; each DB page is res.write()n
 * and the socket is res.end()ed at the finish.
 */
async function streamCsvDownload(req, res, source, dataset, filename, mode) {
  const handle = await Legacy.prepareDownload({
    sourceKey: source,
    datasetKey: dataset,
    filters: parseFilters(req.query),
    mode,
    cap: Legacy.MAX_CSV_DOWNLOAD_ROWS,
  });
  const { columns, total, cap } = handle;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.setHeader('X-Total-Count', String(total));
  if (total > cap) res.setHeader('X-Truncated', `true; cap=${cap}`);

  res.write(`${columns.join(',')}\r\n`);
  let written = 0;
  for await (const rows of Legacy.streamDownloadRows(handle)) {
    let buf = '';
    for (const r of rows) buf += columns.map((c) => csvCell(r[c])).join(',') + '\r\n';
    // Respect backpressure so a slow client can't balloon the send buffer.
    if (!res.write(buf)) await new Promise((r) => res.once('drain', r));
    written += rows.length;
  }
  res.setHeader?.('X-Row-Count', String(written)); // best-effort (may be after flush)
  res.end();
  logger.info('legacy-report csv streamed', { source, dataset, mode, total, written });
}

/** GET /api/reporting/legacy/download?format=csv|xlsx → full filtered export. */
export async function download(req, res) {
  const { source, dataset } = req.query;
  const format = String(req.query.format || 'csv').toLowerCase();
  const mode = req.query.mode;
  try {
    if (!source || !dataset) {
      return res.status(400).json({ error: 'source and dataset are required' });
    }
    if (!['csv', 'xlsx'].includes(format)) {
      return res.status(400).json({ error: "format must be 'csv' or 'xlsx'" });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `legacy-${source}-${dataset}-${mode || 'detail'}-${stamp}`.replace(/[^a-z0-9\-]/gi, '-');

    // ── CSV → streamed (flat memory, high cap). ──
    if (format === 'csv') {
      return await streamCsvDownload(req, res, source, dataset, filename, mode);
    }

    // ── XLSX → buffered workbook (kept, but with a LOWER enforced cap). ──
    const { rows, columns, total, truncated, cap } = await Legacy.fetchForDownload({
      sourceKey: source,
      datasetKey: dataset,
      filters: parseFilters(req.query),
      mode,
      cap: Legacy.MAX_XLSX_DOWNLOAD_ROWS,
    });
    res.setHeader('X-Row-Count', String(rows.length));
    res.setHeader('X-Total-Count', String(total));
    if (truncated) res.setHeader('X-Truncated', `true; cap=${cap}; use CSV for larger extracts`);
    return sendXlsx(res, filename, columns, rows);
  } catch (err) {
    logger.error('reporting/legacy/download error', { source, dataset, format, error: err.message });
    // If we already started streaming, headers are sent — just end the socket so
    // the failure never crashes the process (client sees a truncated download).
    if (res.headersSent) {
      try { res.end(); } catch { /* ignore */ }
      return;
    }
    const status = /^Unknown (source|dataset)/.test(err.message) ? 400 : 500;
    return res.status(status).json({ error: err.message });
  }
}
