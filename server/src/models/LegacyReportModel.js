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
// Hard cap on a single (buffered) download so a mis-set filter can't try to
// stream millions of rows off the live box. Overridable via env.
export const MAX_DOWNLOAD_ROWS = parseInt(process.env.LEGACY_MAX_DOWNLOAD_ROWS) || 100000;

// ── Download caps by format ──────────────────────────────────────────────────
// CSV is STREAMED page-by-page (flat memory) so its cap can be very high — it is
// only a runaway-safety limit. Excel (xlsx-js-style) builds the whole workbook
// in memory, so it keeps a much LOWER cap; bigger extracts should use CSV.
export const MAX_CSV_DOWNLOAD_ROWS  = parseInt(process.env.LEGACY_MAX_CSV_ROWS)  || 5000000;
export const MAX_XLSX_DOWNLOAD_ROWS = parseInt(process.env.LEGACY_MAX_XLSX_ROWS) || 50000;
// Rows fetched per round-trip while streaming a CSV (keeps memory bounded).
export const DOWNLOAD_CHUNK_SIZE    = parseInt(process.env.LEGACY_DOWNLOAD_CHUNK) || 5000;

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
/** Split a multi-value filter (array, or comma-separated string) into trimmed
 *  non-empty tokens. Used for enum (IN-list) filters. */
function splitMulti(raw) {
  if (raw == null) return [];
  const parts = Array.isArray(raw) ? raw : String(raw).split(',');
  return parts.map((v) => String(v).trim()).filter((v) => v !== '');
}

function buildFromWhere(req, source, dataset, filters, extraJoins = []) {
  const h = legacyTable(source.prefix, dataset.header);

  // Collect joins to apply: summary joins (extraJoins) + any join-scoped filter
  // that is actually supplied. Deduped by alias so the same master table is
  // never joined twice (e.g. summary Item join + inventory-posting-group filter).
  const joins = [...extraJoins];
  const clauses = [];

  // Posting-date range (optional both ends).
  const from_ = parseDateOnly(filters.dateFrom);
  const to_   = parseDateOnly(filters.dateTo);
  if (from_) { req.input('DateFrom', sql.Date, from_); clauses.push(`${dataset.dateColumn} >= @DateFrom`); }
  if (to_)   { req.input('DateTo',   sql.Date, to_);   clauses.push(`${dataset.dateColumn} <= @DateTo`); }

  // Dataset-specific filters (only keys declared in the registry — a whitelist).
  const defaults = dataset.defaultFilters || {};
  let i = 0;
  for (const [key, meta] of Object.entries(dataset.filters || {})) {
    // Fall back to a registry default when the request omits this filter, so
    // e.g. Slaughter Data pulls only settled rows unless overridden.
    let raw = filters[key];
    if ((raw == null || (typeof raw === 'string' && raw.trim() === '') || (Array.isArray(raw) && raw.length === 0))
        && defaults[key] != null) {
      raw = defaults[key];
    }

    // ── Enum multi-select → `col IN (@..)` with server-side validation. ──
    if (meta.type === 'enum') {
      const allowed = new Set((meta.options || []).map((o) => String(o.value)));
      const params = [];
      for (const token of splitMulti(raw)) {
        if (allowed.size && !allowed.has(token)) continue;   // drop unknown codes
        const pName = `F${i++}`;
        if (meta.numeric === false) req.input(pName, sql.NVarChar(250), token);
        else {
          const n = parseInt(token, 10);
          if (!Number.isFinite(n)) continue;
          req.input(pName, sql.Int, n);
        }
        params.push(`@${pName}`);
      }
      if (params.length) clauses.push(`${meta.col} IN (${params.join(', ')})`);
      continue;
    }

    // ── Text equality (optionally join-scoped). ──
    if (raw == null || String(raw).trim() === '') continue;
    if (meta.join) joins.push(meta.join);
    const pName = `F${i++}`;
    req.input(pName, sql.NVarChar(250), String(raw).trim());
    clauses.push(`${meta.col} = @${pName}`);
  }

  // Build FROM: header [+ line] + deduped joins.
  let from = `${h} AS h WITH (NOLOCK)`;
  if (dataset.line) {
    const l = legacyTable(source.prefix, dataset.line);
    const on = dataset.lineJoin || 'l.[Document No_] = h.[No_]';
    from += ` JOIN ${l} AS l WITH (NOLOCK) ON ${on}`;
  }
  const seenAlias = new Set();
  for (const j of joins) {
    if (seenAlias.has(j.alias)) continue;
    seenAlias.add(j.alias);
    const jt = legacyTable(source.prefix, j.table);
    const type = (j.type || 'INNER').toUpperCase() === 'LEFT' ? 'LEFT JOIN' : 'JOIN';
    from += ` ${type} ${jt} AS ${j.alias} WITH (NOLOCK) ON ${j.on}`;
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
export async function fetchForDownload({ sourceKey, datasetKey, filters = {}, mode = 'detail', cap = MAX_DOWNLOAD_ROWS }) {
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
  rowsReq.input('Cap', sql.Int, cap);
  const rowsSql =
    `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\n` +
    `SELECT TOP (@Cap) ${plan.selectSql}\n` +
    `  FROM ${fw.from}\n  ${fw.where}\n` +
    (plan.groupBySql ? `  GROUP BY ${plan.groupBySql}\n` : '') +
    `  ORDER BY ${plan.order};`;

  const truncated = total > cap;
  if (truncated) {
    logger.warn('legacy-report download truncated', { source: sourceKey, dataset: datasetKey, mode: plan.mode, total, cap });
  }
  logger.info('legacy-report download', { source: sourceKey, dataset: datasetKey, mode: plan.mode, total, filters });
  const rowsRes = await rowsReq.query(rowsSql);

  return {
    rows: roundRows(rowsRes.recordset),
    columns: plan.columns,
    total,
    truncated,
    cap,
    mode: plan.mode,
  };
}

/**
 * Prepare a STREAMING download: resolve the dataset, open the pool, and count the
 * matching rows up front (so the caller can set headers before streaming). The
 * returned handle is fed to streamDownloadRows(). Nothing is buffered here.
 * @returns { source, dataset, plan, pool, filters, total, columns, cap }
 */
export async function prepareDownload({ sourceKey, datasetKey, filters = {}, mode = 'detail', cap = MAX_CSV_DOWNLOAD_ROWS }) {
  const { source, dataset } = resolve(sourceKey, datasetKey);
  const plan = planFor(dataset, mode);
  const pool = await getLegacyPool(source.database);

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

  return { source, dataset, plan, pool, filters, total, columns: plan.columns, cap };
}

/**
 * Async generator that yields successive pages of rows for a download, using
 * ORDER BY + OFFSET/FETCH so server memory stays flat regardless of total rows.
 * Each yielded page is an array of already-2dp-rounded row objects. Stops at the
 * cap or when a short page is returned (end of set).
 */
export async function* streamDownloadRows(handle, chunkSize = DOWNLOAD_CHUNK_SIZE) {
  const { source, dataset, plan, pool, filters, cap = MAX_CSV_DOWNLOAD_ROWS } = handle;
  const size = Math.max(parseInt(chunkSize) || DOWNLOAD_CHUNK_SIZE, 1);
  let offset = 0;
  let emitted = 0;

  while (emitted < cap) {
    const take = Math.min(size, cap - emitted);
    const req = pool.request();
    const fw = buildFromWhere(req, source, dataset, filters, plan.extraJoins);
    req.input('Offset', sql.Int, offset);
    req.input('PageSize', sql.Int, take);
    const rowsSql =
      `SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\n` +
      `SELECT ${plan.selectSql}\n` +
      `  FROM ${fw.from}\n  ${fw.where}\n` +
      (plan.groupBySql ? `  GROUP BY ${plan.groupBySql}\n` : '') +
      `  ORDER BY ${plan.order}\n` +
      `  OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;`;
    const res = await req.query(rowsSql);
    const rows = res.recordset;
    if (!rows.length) break;
    yield roundRows(rows);
    emitted += rows.length;
    offset += rows.length;
    if (rows.length < take) break; // short page → end of result set
  }
}
