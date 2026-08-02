/**
 * models/SalesReportBc.js
 *
 * Live-BC data source for the /reports page (ReportsPage.vue). Replaces the
 * app-local orders/invoices summaries with direct BC SQL, aggregated across all
 * companies (FCL/CM/FLM/RMK).
 *
 *   source = 'orders'   → BC Sales Header (Document Type = Order), unposted
 *                         (includes Execute). Date = [Order Date].
 *   source = 'invoices' → posted Sales Invoices (+) UNION posted Sales
 *                         Cr.Memos (−, net of returns). Date = [Posting Date].
 *
 * Group-by dimensions: CustomerNo, CustomerName, SalespersonCode, RouteCode,
 * SectorCode, PostingGroup, OrderDate. The PostingGroup dimension honours the
 * dbo.SalesPostingGroupConfig include-volume / include-value / report-under
 * settings (same as the /bc-reports posting-group report).
 */
import { bcDb, bcSql as sql } from '../db/bcPool.js';
import { db as appDb } from '../db/pool.js';
import { bcTable, extCol, resolveCompanies } from '../services/bcTables.js';
import logger from '../services/logger.js';

const sectorCol    = extCol('Sector');
const routeCodeCol = extCol('Route Code');

// ── Source blocks ─────────────────────────────────────────────────────────────
// Each block is one header/line pair with a sign and a date column.
function sourceBlocks(source) {
  if (source === 'invoices') {
    return [
      { h: 'Sales Invoice Header', l: 'Sales Invoice Line', sign: '+', dateCol: '[Posting Date]', label: 'Invoice',     orderScope: false },
      { h: 'Sales Cr_Memo Header', l: 'Sales Cr_Memo Line', sign: '-', dateCol: '[Posting Date]', label: 'Credit Memo', orderScope: false },
    ];
  }
  // orders
  return [
    { h: 'Sales Header', l: 'Sales Line', sign: '+', dateCol: '[Order Date]', label: 'Order', orderScope: true },
  ];
}

// ── Dimension → SELECT expression + required joins ───────────────────────────
// Joins reference: cx = customer ext, sp = salesperson, ste = ship-to ext.
function dimSpec(groupBy, block) {
  switch (groupBy) {
    case 'CustomerNo':
      return { expr: `ISNULL(NULLIF(h.[Sell-to Customer No_], ''), '(Blank)')`, joins: [] };
    case 'CustomerName':
      return { expr: `ISNULL(NULLIF(h.[Sell-to Customer Name], ''), '(Blank)')`, joins: [] };
    case 'SalespersonCode':
      return {
        expr: `ISNULL(NULLIF(sp.[Name], ''), ISNULL(NULLIF(h.[Salesperson Code], ''), '(Blank)'))`,
        joins: ['sp'],
      };
    case 'RouteCode':
      return { expr: `ISNULL(NULLIF(ste.${routeCodeCol}, ''), '(Blank)')`, joins: ['ste'] };
    case 'SectorCode':
      return { expr: `ISNULL(NULLIF(cx.${sectorCol}, ''), '(Blank)')`, joins: ['cx'] };
    case 'OrderDate':
      return { expr: `CONVERT(varchar(10), h.${block.dateCol}, 23)`, joins: [] };
    case 'PostingGroup':
    default:
      return { expr: postingGroupStripExpr('l'), joins: [] };
  }
}

function postingGroupStripExpr(alias = 'l') {
  return `ISNULL(NULLIF(LTRIM(RTRIM(
    CASE WHEN CHARINDEX('-', ${alias}.[Posting Group]) > 0
         THEN SUBSTRING(${alias}.[Posting Group],
                CHARINDEX('-', ${alias}.[Posting Group]) + 1,
                LEN(${alias}.[Posting Group]))
         ELSE NULLIF(${alias}.[Posting Group], '')
    END)), ''), '(Blank)')`;
}

// Currency-normalise a line amount column (doc currency → LCY).
function amountExprCol(col = '[Amount]') {
  return `CASE WHEN ISNULL(h.[Currency Factor], 0) <> 0
               THEN l.${col} / h.[Currency Factor]
               ELSE l.${col} END`;
}
const amountExpr = () => amountExprCol('[Amount]');

function joinSql(joins, tables) {
  const out = [];
  if (joins.includes('sp')) out.push(`LEFT JOIN ${tables.salesperson} sp ON sp.[Code] = h.[Salesperson Code]`);
  if (joins.includes('cx')) out.push(`LEFT JOIN ${tables.customerExt} cx ON cx.[No_] = h.[Sell-to Customer No_]`);
  if (joins.includes('ste')) out.push(
    `LEFT JOIN ${tables.shipToAddressExt} ste ON ste.[Customer No_] = h.[Sell-to Customer No_] AND ste.[Code] = h.[Ship-to Code]`
  );
  return out.join('\n      ');
}

function blockWhere(block) {
  // Item lines only; orders also constrain Document Type = Order (1).
  const clauses = ['l.[Type] = 2'];
  if (block.orderScope) clauses.push('h.[Document Type] = 1');
  return clauses.map((c) => `AND ${c}`).join('\n        ');
}

function lineJoinOn(block) {
  return block.orderScope
    ? 'l.[Document No_] = h.[No_] AND l.[Document Type] = h.[Document Type]'
    : 'l.[Document No_] = h.[No_]';
}

// ── Posting-group config (mirrors BcReport.loadSalesPgConfig) ─────────────────
async function loadPgConfig() {
  const map = new Map();
  try {
    const pool = await appDb.getPool();
    const res = await pool.request().query(`
      SELECT [GroupCode], [GlobalCode], [IncludeVolume], [IncludeValue]
      FROM [dbo].[SalesPostingGroupConfig]
    `);
    for (const r of res.recordset) {
      map.set(String(r.GroupCode).trim().toUpperCase(), {
        globalCode: r.GlobalCode ? String(r.GlobalCode).trim() : null,
        includeVolume: r.IncludeVolume !== false && r.IncludeVolume !== 0,
        includeValue: r.IncludeValue !== false && r.IncludeValue !== 0,
      });
    }
  } catch (e) {
    logger.warn('SalesReportBc: posting-group config unavailable', { error: e.message });
  }
  return map;
}

/** Apply posting-group config to summary rows (remap + zero vol/val + drop). */
function applyPgConfigToSummary(rows, cfg) {
  if (!cfg || !cfg.size) return rows;
  const agg = new Map();
  for (const row of rows) {
    const key = String(row.GroupKey ?? '').trim().toUpperCase();
    const c = cfg.get(key);
    const groupKey = c?.globalCode || row.GroupKey;
    const volMul = c && !c.includeVolume ? 0 : 1;
    const valMul = c && !c.includeValue ? 0 : 1;
    const qty     = (Number(row.TotalQuantity)     || 0) * volMul;
    const qtyBase = (Number(row.TotalQuantityBase) || 0) * volMul;
    const amount  = (Number(row.TotalLineAmount)   || 0) * valMul;
    if (qty === 0 && qtyBase === 0 && amount === 0) continue;
    const cur = agg.get(groupKey);
    if (cur) {
      cur.DocumentCount += Number(row.DocumentCount) || 0;
      cur.TotalQuantity += qty;
      cur.TotalQuantityBase += qtyBase;
      cur.TotalLineAmount += amount;
    } else {
      agg.set(groupKey, {
        GroupKey: groupKey,
        DocumentCount: Number(row.DocumentCount) || 0,
        TotalQuantity: qty, TotalQuantityBase: qtyBase, TotalLineAmount: amount,
      });
    }
  }
  return Array.from(agg.values());
}

// ── Summary ───────────────────────────────────────────────────────────────────
export async function summary({ source = 'orders', groupBy = 'CustomerNo', dateFrom, dateTo, companies }) {
  const cos = resolveCompanies(companies);
  const blocks = sourceBlocks(source);
  if (!cos.length) return [];

  const segments = [];
  for (const companyId of cos) {
    const tables = makeTables(companyId);
    for (const block of blocks) {
      const dim = dimSpec(groupBy, block);
      segments.push(`
        SELECT ${dim.expr} AS GroupKey,
               COUNT(DISTINCT h.[No_]) AS DocumentCount,
               ${block.sign}SUM(CAST(l.[Quantity] AS decimal(38,20))) AS TotalQuantity,
               ${block.sign}SUM(CAST(l.[Quantity (Base)] AS decimal(38,20))) AS TotalQuantityBase,
               ${block.sign}SUM(${amountExpr()}) AS TotalLineAmount
        FROM ${tables[block.h]} h
        JOIN ${tables[block.l]} l ON ${lineJoinOn(block)}
        ${joinSql(dim.joins, tables)}
        WHERE h.${block.dateCol} BETWEEN @DateFrom AND @DateTo
          ${blockWhere(block)}
        GROUP BY ${dim.expr}
      `);
    }
  }

  const querySql = `
    SELECT GroupKey,
           SUM(DocumentCount)     AS DocumentCount,
           SUM(TotalQuantity)     AS TotalQuantity,
           SUM(TotalQuantityBase) AS TotalQuantityBase,
           SUM(TotalLineAmount)   AS TotalLineAmount
    FROM (${segments.join('\nUNION ALL\n')}) s
    GROUP BY GroupKey
    HAVING ABS(SUM(TotalQuantityBase)) + ABS(SUM(TotalLineAmount)) > 0
    ORDER BY SUM(TotalLineAmount) DESC
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('DateFrom', sql.Date, parseDate(dateFrom));
  req.input('DateTo', sql.Date, parseDate(dateTo));
  const result = await req.query(querySql);
  let rows = result.recordset;
  if (groupBy === 'PostingGroup') rows = applyPgConfigToSummary(rows, await loadPgConfig());
  return rows;
}

// ── Drill-down: documents in a group ─────────────────────────────────────────
export async function documents({ source = 'orders', groupBy = 'CustomerNo', groupKey, dateFrom, dateTo, companies }) {
  const cos = resolveCompanies(companies);
  const blocks = sourceBlocks(source);
  if (!cos.length || groupKey == null) return [];

  // For PostingGroup, expand the requested (possibly remapped) global code back
  // to the set of source group codes that roll up into it.
  let pgCodes = null;
  if (groupBy === 'PostingGroup') {
    const cfg = await loadPgConfig();
    pgCodes = new Set([String(groupKey).trim().toUpperCase()]);
    for (const [code, c] of cfg.entries()) {
      if (c.globalCode && c.globalCode.toUpperCase() === String(groupKey).trim().toUpperCase()) pgCodes.add(code);
    }
  }

  const segments = [];
  for (const companyId of cos) {
    const tables = makeTables(companyId);
    for (const block of blocks) {
      const dim = dimSpec(groupBy, block);
      const match = groupBy === 'PostingGroup'
        ? `UPPER(${dim.expr}) IN (${[...pgCodes].map((_, i) => `@pg${i}`).join(', ')})`
        : `${dim.expr} = @GroupKey`;
      segments.push(`
        SELECT '${companyId}' AS Company,
               h.[No_] AS DocNo,
               ISNULL(h.[Sell-to Customer Name], '') AS CustomerName,
               h.${block.dateCol} AS OrderDate,
               '${block.label}' AS Status,
               '${source}' AS Source
        FROM ${tables[block.h]} h
        JOIN ${tables[block.l]} l ON ${lineJoinOn(block)}
        ${joinSql(dim.joins, tables)}
        WHERE h.${block.dateCol} BETWEEN @DateFrom AND @DateTo
          ${blockWhere(block)}
          AND ${match}
        GROUP BY h.[No_], h.[Sell-to Customer Name], h.${block.dateCol}
      `);
    }
  }

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('DateFrom', sql.Date, parseDate(dateFrom));
  req.input('DateTo', sql.Date, parseDate(dateTo));
  if (groupBy === 'PostingGroup') [...pgCodes].forEach((c, i) => req.input(`pg${i}`, sql.NVarChar(120), c));
  else req.input('GroupKey', sql.NVarChar(200), String(groupKey));

  const result = await req.query(`
    ${segments.join('\nUNION ALL\n')}
    ORDER BY OrderDate DESC, DocNo
  `);
  return result.recordset;
}

// ── Drill-down: lines of one document ────────────────────────────────────────
export async function lines({ source = 'orders', docNo, company }) {
  if (!docNo) return [];
  const cos = company ? [company].filter((c) => resolveCompanies([c]).length) : resolveCompanies();
  const blocks = sourceBlocks(source);
  const segments = [];
  for (const companyId of cos) {
    const tables = makeTables(companyId);
    for (const block of blocks) {
      segments.push(`
        SELECT '${companyId}' AS Company, '${block.label}' AS DocType,
               l.[Line No_] AS LineNo,
               l.[No_] AS ItemNo, l.[Description] AS Description,
               l.[Unit of Measure Code] AS UnitOfMeasure,
               l.[Posting Group] AS PostingGroup,
               l.[Quantity] AS Quantity, l.[Unit Price] AS UnitPrice,
               ${block.sign}CAST(l.[Quantity (Base)] AS decimal(38,20)) AS QuantityBase,
               ${block.sign}(${amountExprCol('[Amount]')}) AS LineAmount,
               ${block.sign}(${amountExprCol('[Amount Including VAT]')}) AS LineAmountInclVat
        FROM ${tables[block.h]} h
        JOIN ${tables[block.l]} l ON ${lineJoinOn(block)}
        WHERE h.[No_] = @DocNo
          ${blockWhere(block)}
      `);
    }
  }
  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('DocNo', sql.NVarChar(40), String(docNo));
  const result = await req.query(`${segments.join('\nUNION ALL\n')} ORDER BY Company, ItemNo`);
  return result.recordset;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function parseDate(value) {
  if (!value) {
    // default window: last 30 days is unhelpful here; require caller to pass.
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function makeTables(companyId) {
  return {
    'Sales Invoice Header': bcTable(companyId, 'Sales Invoice Header'),
    'Sales Invoice Line':   bcTable(companyId, 'Sales Invoice Line'),
    'Sales Cr_Memo Header': bcTable(companyId, 'Sales Cr_Memo Header'),
    'Sales Cr_Memo Line':   bcTable(companyId, 'Sales Cr_Memo Line'),
    'Sales Header':         bcTable(companyId, 'Sales Header'),
    'Sales Line':           bcTable(companyId, 'Sales Line'),
    customerExt:            bcTable(companyId, 'Customer', { coreExt: true }),
    salesperson:            bcTable(companyId, 'Salesperson_Purchaser'),
    shipToAddressExt:       bcTable(companyId, 'Ship-to Address', { coreExt: true }),
  };
}
