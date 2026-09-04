/**
 * models/LegacyReportModel.js
 * Read-only, parameterized queries over the LEGACY BC databases described in
 * services/legacyReports.js. SELECT ONLY — never writes to the legacy DBs.
 *
 * Safety model:
 *   - source + dataset are resolved from the registry (a whitelist); unknown
 *     keys are rejected before any SQL is built.
 *   - table + column names come from the registry, never from the request.
 *   - every filter VALUE is bound as a parameter (no string interpolation).
 *   - pagination uses OFFSET/FETCH; downloads are hard-capped.
 *   - sessions run READ UNCOMMITTED so reports never lock the live OLTP tables.
 */
import { getLegacyPool, legacySql as sql } from '../db/legacyPool.js';
import { getSource, getDataset, legacyTable } from '../services/legacyReports.js';
import logger from '../services/logger.js';

export const MAX_PAGE_SIZE = 500;
export const DEFAULT_PAGE_SIZE = 50;
// Hard cap on a single download so a mis-set filter can't try to stream millions
// of rows off the live box. Overridable via env.
export const MAX_DOWNLOAD_ROWS = parseInt(process.env.LEGACY_MAX_DOWNLOAD_ROWS) || 100000;

/** Resolve {source, dataset} or throw a 400-style error. */
function resolve(sourceKey, datasetKey) {
  const source = getSource(sourceKey);
  if (!source) throw new Error(`Unknown source: ${sourceKey}`);
  const dataset = getDataset(source, datasetKey);
  if (!dataset) throw new Error(`Unknown dataset: ${datasetKey}`);
  return { source, dataset };
}

function parseDateOnly(value) {
  if (!value) return null;
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Build the shared FROM + WHERE for a dataset and register its parameters on the
 * mssql request. Returns { from, where }.
 */
function buildFromWhere(req, source, dataset, filters) {
  const h = legacyTable(source.prefix, dataset.header);
  let from = `${h} AS h WITH (NOLOCK)`;
  if (dataset.line) {
    const l = legacyTable(source.prefix, dataset.line);
    const on = dataset.lineJoin || 'l.[Document No_] = h.[No_]';
    from += ` JOIN ${l} AS l WITH (NOLOCK) ON ${on}`;
  }

  const clauses = [];

  // Posting-date range (optional both ends).
  const from_ = parseDateOnly(filters.dateFrom);
  const to_   = parseDateOnly(filters.dateTo);
  if (from_) { req.input('DateFrom', sql.Date, from_); clauses.push(`${dataset.dateColumn} >= @DateFrom`); }
  if (to_)   { req.input('DateTo',   sql.Date, to_);   clauses.push(`${dataset.dateColumn} <= @DateTo`); }

  // Dataset-specific equality filters (only keys declared in the registry).
  let i = 0;
  for (const [key, meta] of Object.entries(dataset.filters || {})) {
    const raw = filters[key];
    if (raw == null || String(raw).trim() === '') continue;
    const pName = `F${i++}`;
    req.input(pName, sql.NVarChar(250), String(raw).trim());
    clauses.push(`${meta.col} = @${pName}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join('\n        AND ')}` : '';
  return { from, where };
}

function selectList(dataset) {
  return dataset.columns.map((c) => `${c.col} AS [${c.as}]`).join(',\n         ');
}

/** Column metadata for the client (order + friendly labels from the registry). */
export function columnsFor(sourceKey, datasetKey) {
  const { dataset } = resolve(sourceKey, datasetKey);
  return dataset.columns.map((c) => c.as);
}

/**
 * Paginated preview.
 * @returns { rows, total, page, pageSize, columns }
 */
export async function runDataset({ sourceKey, datasetKey, filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE }) {
  const { source, dataset } = resolve(sourceKey, datasetKey);
  const pool = await getLegacyPool(source.database);

  const safePageSize = Math.min(Math.max(parseInt(pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const safePage = Math.max(parseInt(page) || 1, 1);
  const offset = (safePage - 1) * safePageSize;

  // ── total count ──
  const countReq = pool.request();
  const { from, where } = buildFromWhere(countReq, source, dataset, filters);
  const countSql = `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\nSELECT COUNT_BIG(*) AS Total\n  FROM ${from}\n  ${where};`;
  const countRes = await countReq.query(countSql);
  const total = Number(countRes.recordset[0]?.Total || 0);

  // ── page of rows ──
  const rowsReq = pool.request();
  const fw = buildFromWhere(rowsReq, source, dataset, filters);
  rowsReq.input('Offset', sql.Int, offset);
  rowsReq.input('PageSize', sql.Int, safePageSize);
  const rowsSql =
    `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\n` +
    `SELECT ${selectList(dataset)}\n` +
    `  FROM ${fw.from}\n  ${fw.where}\n` +
    `  ORDER BY ${dataset.order}\n` +
    `  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;`;

  logger.info('legacy-report run', { source: sourceKey, dataset: datasetKey, page: safePage, pageSize: safePageSize, filters });
  const rowsRes = await rowsReq.query(rowsSql);

  return {
    rows: rowsRes.recordset,
    total,
    page: safePage,
    pageSize: safePageSize,
    columns: dataset.columns.map((c) => c.as),
  };
}

/**
 * Fetch the full filtered result set for a download, hard-capped.
 * @returns { rows, columns, total, truncated, cap }
 */
export async function fetchForDownload({ sourceKey, datasetKey, filters = {} }) {
  const { source, dataset } = resolve(sourceKey, datasetKey);
  const pool = await getLegacyPool(source.database);

  // total (so we can report truncation honestly)
  const countReq = pool.request();
  const cw = buildFromWhere(countReq, source, dataset, filters);
  const countRes = await countReq.query(
    `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\nSELECT COUNT_BIG(*) AS Total FROM ${cw.from}\n  ${cw.where};`
  );
  const total = Number(countRes.recordset[0]?.Total || 0);

  const rowsReq = pool.request();
  const fw = buildFromWhere(rowsReq, source, dataset, filters);
  rowsReq.input('Cap', sql.Int, MAX_DOWNLOAD_ROWS);
  const rowsSql =
    `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\n` +
    `SELECT TOP (@Cap) ${selectList(dataset)}\n` +
    `  FROM ${fw.from}\n  ${fw.where}\n` +
    `  ORDER BY ${dataset.order};`;

  const truncated = total > MAX_DOWNLOAD_ROWS;
  if (truncated) {
    logger.warn('legacy-report download truncated', { source: sourceKey, dataset: datasetKey, total, cap: MAX_DOWNLOAD_ROWS });
  }
  logger.info('legacy-report download', { source: sourceKey, dataset: datasetKey, total, filters });
  const rowsRes = await rowsReq.query(rowsSql);

  return {
    rows: rowsRes.recordset,
    columns: dataset.columns.map((c) => c.as),
    total,
    truncated,
    cap: MAX_DOWNLOAD_ROWS,
  };
}
