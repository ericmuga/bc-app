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
 * Round every numeric cell in a result set to 2 decimal places, in place.
 * Only JS numbers are touched — document numbers are strings and dates are Date
 * objects, so both are left untouched (and integer keys like line/entry numbers
 * are unchanged by a 2dp round). Done in the model layer so the preview, CSV and
 * Excel outputs always agree.
 */
function round2(v) {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.round((v + Number.EPSILON) * 100) / 100
    : v;
}
function roundRows(rows) {
  for (const row of rows) {
    for (const k in row) row[k] = round2(row[k]);
  }
  return rows;
}

/**
 * Build the shared FROM + WHERE for a dataset and register its parameters on the
 * mssql request. Returns { from, where }.
 *
 * `extraJoins` (optional) appends further WHITELISTED joins from the registry
 * (e.g. a summary's LEFT JOIN to a master table). Each is { table, alias, on,
 * type } where `table` is resolved through legacyTable() — never user input.
 */
function buildFromWhere(req, source, dataset, filters, extraJoins = []) {
  const h = legacyTable(source.prefix, dataset.header);
  let from = `${h} AS h WITH (NOLOCK)`;
  if (dataset.line) {
    const l = legacyTable(source.prefix, dataset.line);
    const on = dataset.lineJoin || 'l.[Document No_] = h.[No_]';
    from += ` JOIN ${l} AS l WITH (NOLOCK) ON ${on}`;
  }
  for (const j of extraJoins) {
    const jt = legacyTable(source.prefix, j.table);
    const type = (j.type || 'INNER').toUpperCase() === 'LEFT' ? 'LEFT JOIN' : 'JOIN';
    from += ` ${type} ${jt} AS ${j.alias} WITH (NOLOCK) ON ${j.on}`;
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

/**
 * Normalise a requested mode against what the dataset declares. Returns a plan:
 *   { mode:'detail',  columns, order, extraJoins:[], selectSql, groupBySql:null }
 *   { mode:'summary', columns, order, extraJoins,    selectSql, groupBySql }
 * Unknown / unsupported modes fall back to 'detail'. The SELECT / GROUP BY / ORDER
 * fragments are built entirely from the registry (whitelist) — never the request.
 */
function planFor(dataset, mode) {
  const wantSummary = String(mode || 'detail').toLowerCase() === 'summary';
  if (wantSummary && dataset.summary) {
    const s = dataset.summary;
    const selectCols = [
      ...s.groupBy.map((c) => `${c.col} AS [${c.as}]`),
      ...s.aggregates.map((a) => `${a.expr} AS [${a.as}]`),
    ];
    return {
      mode: 'summary',
      columns: [...s.groupBy.map((c) => c.as), ...s.aggregates.map((a) => a.as)],
      order: s.order || s.groupBy.map((c) => c.col).join(', '),
      extraJoins: s.joins || [],
      selectSql: selectCols.join(',\n         '),
      groupBySql: s.groupBy.map((c) => c.col).join(', '),
    };
  }
  return {
    mode: 'detail',
    columns: dataset.columns.map((c) => c.as),
    order: dataset.order,
    extraJoins: [],
    selectSql: selectList(dataset),
    groupBySql: null,
  };
}

/** Column metadata for the client (order + friendly labels from the registry). */
export function columnsFor(sourceKey, datasetKey, mode = 'detail') {
  const { dataset } = resolve(sourceKey, datasetKey);
  return planFor(dataset, mode).columns;
}

/**
 * Paginated preview.
 * @param {'detail'|'summary'} mode  detail rows, or the dataset's roll-up
 * @returns { rows, total, page, pageSize, columns, mode }
 */
export async function runDataset({ sourceKey, datasetKey, filters = {}, page = 1, pageSize = DEFAULT_PAGE_SIZE, mode = 'detail' }) {
  const { source, dataset } = resolve(sourceKey, datasetKey);
  const plan = planFor(dataset, mode);
  const pool = await getLegacyPool(source.database);

  const safePageSize = Math.min(Math.max(parseInt(pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const safePage = Math.max(parseInt(page) || 1, 1);
  const offset = (safePage - 1) * safePageSize;

  // ── total count ── (a summary counts groups, not rows)
  const countReq = pool.request();
  const cw = buildFromWhere(countReq, source, dataset, filters, plan.extraJoins);
  const countSql = plan.groupBySql
    ? `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\n` +
      `SELECT COUNT_BIG(*) AS Total FROM (\n` +
      `  SELECT 1 AS _n FROM ${cw.from}\n  ${cw.where}\n  GROUP BY ${plan.groupBySql}\n` +
      `) AS g;`
    : `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\nSELECT COUNT_BIG(*) AS Total\n  FROM ${cw.from}\n  ${cw.where};`;
  const countRes = await countReq.query(countSql);
  const total = Number(countRes.recordset[0]?.Total || 0);

  // ── page of rows ──
  const rowsReq = pool.request();
  const fw = buildFromWhere(rowsReq, source, dataset, filters, plan.extraJoins);
  rowsReq.input('Offset', sql.Int, offset);
  rowsReq.input('PageSize', sql.Int, safePageSize);
  const rowsSql =
    `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\n` +
    `SELECT ${plan.selectSql}\n` +
    `  FROM ${fw.from}\n  ${fw.where}\n` +
    (plan.groupBySql ? `  GROUP BY ${plan.groupBySql}\n` : '') +
    `  ORDER BY ${plan.order}\n` +
    `  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;`;

  logger.info('legacy-report run', { source: sourceKey, dataset: datasetKey, mode: plan.mode, page: safePage, pageSize: safePageSize, filters });
  const rowsRes = await rowsReq.query(rowsSql);

  return {
    rows: roundRows(rowsRes.recordset),
    total,
    page: safePage,
    pageSize: safePageSize,
    columns: plan.columns,
    mode: plan.mode,
  };
}

/**
 * Fetch the full filtered result set for a download, hard-capped.
 * @param {'detail'|'summary'} mode  detail rows, or the dataset's roll-up
 * @returns { rows, columns, total, truncated, cap, mode }
 */
export async function fetchForDownload({ sourceKey, datasetKey, filters = {}, mode = 'detail' }) {
  const { source, dataset } = resolve(sourceKey, datasetKey);
  const plan = planFor(dataset, mode);
  const pool = await getLegacyPool(source.database);

  // total (so we can report truncation honestly) — a summary counts groups
  const countReq = pool.request();
  const cw = buildFromWhere(countReq, source, dataset, filters, plan.extraJoins);
  const countSql = plan.groupBySql
    ? `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\n` +
      `SELECT COUNT_BIG(*) AS Total FROM (\n` +
      `  SELECT 1 AS _n FROM ${cw.from}\n  ${cw.where}\n  GROUP BY ${plan.groupBySql}\n` +
      `) AS g;`
    : `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\nSELECT COUNT_BIG(*) AS Total FROM ${cw.from}\n  ${cw.where};`;
  const countRes = await countReq.query(countSql);
  const total = Number(countRes.recordset[0]?.Total || 0);

  const rowsReq = pool.request();
  const fw = buildFromWhere(rowsReq, source, dataset, filters, plan.extraJoins);
  rowsReq.input('Cap', sql.Int, MAX_DOWNLOAD_ROWS);
  const rowsSql =
    `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\n` +
    `SELECT TOP (@Cap) ${plan.selectSql}\n` +
    `  FROM ${fw.from}\n  ${fw.where}\n` +
    (plan.groupBySql ? `  GROUP BY ${plan.groupBySql}\n` : '') +
    `  ORDER BY ${plan.order};`;

  const truncated = total > MAX_DOWNLOAD_ROWS;
  if (truncated) {
    logger.warn('legacy-report download truncated', { source: sourceKey, dataset: datasetKey, mode: plan.mode, total, cap: MAX_DOWNLOAD_ROWS });
  }
  logger.info('legacy-report download', { source: sourceKey, dataset: datasetKey, mode: plan.mode, total, filters });
  const rowsRes = await rowsReq.query(rowsSql);

  return {
    rows: roundRows(rowsRes.recordset),
    columns: plan.columns,
    total,
    truncated,
    cap: MAX_DOWNLOAD_ROWS,
    mode: plan.mode,
  };
}
