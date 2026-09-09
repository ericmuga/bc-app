/**
 * models/WarehouseInventoryModel.js
 * Inventory-movement analytics over the materialised item-ledger fact
 * dbo.fact_ILE_MV (FCLWHS). Flexible group-by (location / item / posting group /
 * entry type / company) with an optional date spread (day / week / month / year),
 * reporting Quantity, Cost and Sales amounts.
 *
 * All group-by / granularity choices come from fixed whitelists; every filter
 * value is parameterised — no user string reaches the SQL text.
 */
import { whsDb, whsSql as sql } from '../db/whsPool.js';

async function pool() { return whsDb.getPool(); }

// BC Item Ledger Entry Type → label.
export const ENTRY_TYPES = {
  0: 'Purchase', 1: 'Sale', 2: 'Positive Adjmt', 3: 'Negative Adjmt',
  4: 'Transfer', 5: 'Consumption', 6: 'Output',
};

// Group-by dimension key → { column, label }. Whitelist — nothing else is allowed.
const DIMENSIONS = {
  company:      { col: 'f.[Company]',               label: 'Company' },
  location:     { col: 'f.[LocationCode]',          label: 'Location' },
  item:         { col: 'f.[ItemNo]',                label: 'Item' },
  postingGroup: { col: 'f.[InventoryPostingGroup]', label: 'Inventory Posting Group' },
  entryType:    { col: 'f.[EntryType]',             label: 'Entry Type' },
};

// Date-spread granularity → a SQL bucket expression (start-of-period date).
const GRAINS = {
  none:  null,
  day:   'CAST(f.[PostingDate] AS date)',
  week:  'DATEADD(week, DATEDIFF(week, 0, f.[PostingDate]), 0)',
  month: 'DATEFROMPARTS(YEAR(f.[PostingDate]), MONTH(f.[PostingDate]), 1)',
  year:  'DATEFROMPARTS(YEAR(f.[PostingDate]), 1, 1)',
};

/** Distinct filter values for the report UI (from the fact). */
export async function dimensions() {
  const p = await pool();
  const [co, loc, ipg] = await Promise.all([
    p.request().query('SELECT DISTINCT [Company] AS v FROM dbo.fact_ILE_MV ORDER BY v'),
    p.request().query(`
      SELECT DISTINCT f.[LocationCode] AS code, l.[Name] AS name
      FROM dbo.fact_ILE_MV f
      LEFT JOIN (SELECT [Code], MAX([Name]) AS [Name] FROM dbo.dim_ALLLOCATIONS_MV
                 WHERE [Name] IS NOT NULL AND [Name] <> '' GROUP BY [Code]) l ON l.[Code] = f.[LocationCode]
      WHERE f.[LocationCode] <> '' ORDER BY code`),
    p.request().query("SELECT DISTINCT [InventoryPostingGroup] AS v FROM dbo.fact_ILE_MV WHERE [InventoryPostingGroup] <> '' ORDER BY v"),
  ]);
  return {
    companies:     co.recordset.map((x) => x.v),
    locations:     loc.recordset.map((x) => ({ code: x.code, name: x.name || '', label: `${x.code}${x.name ? ' — ' + x.name : ''}` })),
    postingGroups: ipg.recordset.map((x) => x.v),
    entryTypes:    Object.entries(ENTRY_TYPES).map(([code, name]) => ({ code: Number(code), name })),
  };
}

/**
 * Stock card BY LOCATION: for each item at the given location(s), the opening
 * balance as at dateFrom, the movements dateFrom..dateTo broken out per entry
 * type (signed qty + cost), and the closing balance as at dateTo. Reconciles:
 * opening + Σ(entry-type movements) = closing, in both qty and cost.
 */
export async function stockCard({ locations, dateFrom, dateTo, companies, postingGroups, items } = {}) {
  const p = await pool();
  const req = p.request();
  const to   = dateTo   || new Date().toISOString().slice(0, 10);
  const from = dateFrom || (() => { const d = new Date(to); d.setDate(1); return d.toISOString().slice(0, 10); })();
  req.input('from', sql.Date, from);
  req.input('to',   sql.Date, to);

  const where = ['f.[PostingDate] <= @to'];
  const lc = inClause(req, locations,     'lc', sql.NVarChar(20));
  const co = inClause(req, companies,     'co', sql.NVarChar(20));
  const pg = inClause(req, postingGroups, 'pg', sql.NVarChar(40));
  const it = inClause(req, items,         'it', sql.NVarChar(40));
  if (!lc) throw new Error('Pick at least one location for the stock-position report.');
  where.push(`f.[LocationCode] IN (${lc})`);
  if (co) where.push(`f.[Company] IN (${co})`);
  if (pg) where.push(`f.[InventoryPostingGroup] IN (${pg})`);
  if (it) where.push(`f.[ItemNo] IN (${it})`);

  const etCols = Object.keys(ENTRY_TYPES).map((k) =>
    `SUM(CASE WHEN f.[PostingDate] >= @from AND f.[EntryType]=${k} THEN f.[Quantity]         ELSE 0 END) AS q${k},
     SUM(CASE WHEN f.[PostingDate] >= @from AND f.[EntryType]=${k} THEN f.[CostAmountActual] ELSE 0 END) AS c${k}`).join(',');

  const q = `
    SELECT f.[LocationCode] AS location, f.[ItemNo] AS item, MIN(i.[Description]) AS itemName,
      SUM(CASE WHEN f.[PostingDate] < @from THEN f.[Quantity]         ELSE 0 END) AS openQty,
      SUM(CASE WHEN f.[PostingDate] < @from THEN f.[CostAmountActual] ELSE 0 END) AS openCost,
      ${etCols},
      SUM(f.[Quantity])         AS closeQty,
      SUM(f.[CostAmountActual]) AS closeCost
    FROM dbo.fact_ILE_MV f
    LEFT JOIN (SELECT [No_], MAX([Description]) AS [Description] FROM dbo.dim_ALLITEMS_MV GROUP BY [No_]) i ON i.[No_] = f.[ItemNo]
    WHERE ${where.join(' AND ')}
    GROUP BY f.[LocationCode], f.[ItemNo]
    HAVING SUM(CASE WHEN f.[PostingDate] <  @from THEN f.[Quantity]      ELSE 0 END) <> 0
        OR SUM(CASE WHEN f.[PostingDate] >= @from THEN ABS(f.[Quantity]) ELSE 0 END) <> 0
    ORDER BY f.[LocationCode], f.[ItemNo]`;

  const r = await req.query(q);
  const etCodes = Object.keys(ENTRY_TYPES).map(Number);
  const present = new Set();
  const rows = r.recordset.map((x) => {
    const mov = {};
    for (const k of etCodes) {
      const qty = Number(x[`q${k}`] || 0), cost = Number(x[`c${k}`] || 0);
      if (qty !== 0 || cost !== 0) present.add(k);
      mov[k] = { qty, cost };
    }
    return {
      location: x.location, item: x.item, itemName: x.itemName || '',
      openQty: Number(x.openQty || 0), openCost: Number(x.openCost || 0),
      mov, closeQty: Number(x.closeQty || 0), closeCost: Number(x.closeCost || 0),
    };
  });

  const totals = { openQty: 0, openCost: 0, closeQty: 0, closeCost: 0, mov: {} };
  for (const k of etCodes) totals.mov[k] = { qty: 0, cost: 0 };
  for (const row of rows) {
    totals.openQty += row.openQty; totals.openCost += row.openCost;
    totals.closeQty += row.closeQty; totals.closeCost += row.closeCost;
    for (const k of etCodes) { totals.mov[k].qty += row.mov[k].qty; totals.mov[k].cost += row.mov[k].cost; }
  }

  const entryTypesPresent = etCodes.filter((k) => present.has(k)).map((code) => ({ code, name: ENTRY_TYPES[code] }));
  return { dateFrom: from, dateTo: to, entryTypesPresent, rowCount: rows.length, rows, totals };
}

/** Item picker options from the item dimension, narrowed to the given companies. */
export async function items({ companies } = {}) {
  const p = await pool();
  const req = p.request();
  const co = inClause(req, companies, 'ic', sql.NVarChar(20));
  const r = await req.query(`
    SELECT [No_] AS [no], MAX([Description]) AS [name]
    FROM dbo.dim_ALLITEMS_MV
    ${co ? `WHERE [COMPANY] IN (${co})` : ''}
    GROUP BY [No_]
    ORDER BY [No_]`);
  return r.recordset.map((x) => ({ no: x.no, name: x.name || '', label: `${x.no}${x.name ? ' — ' + x.name : ''}` }));
}

function inClause(req, values, prefix, type) {
  const vals = [...new Set((values || []).map((v) => String(v)).filter((v) => v !== ''))];
  if (!vals.length) return null;
  const names = vals.map((v, i) => {
    const n = `${prefix}${i}`;
    req.input(n, type, type === sql.Int ? Number(v) : v);
    return `@${n}`;
  });
  return names.join(',');
}

/**
 * Aggregated inventory statistics.
 * @param {object} o
 *  dateFrom, dateTo (YYYY-MM-DD; default last 90 days)
 *  companies[], locations[], postingGroups[], entryTypes[], items[]  (filters)
 *  groupBy[]  (subset of DIMENSIONS keys; default ['location'])
 *  granularity ('none'|'day'|'week'|'month'|'year'; default 'none')
 * @returns { columns, dims, granularity, rows, totals, generatedAt-less }
 */
export async function report(o = {}) {
  const p = await pool();
  const req = p.request();

  const dateTo   = o.dateTo   || new Date().toISOString().slice(0, 10);
  const dateFrom = o.dateFrom || (() => { const d = new Date(dateTo); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); })();
  req.input('from', sql.Date, dateFrom);
  req.input('to',   sql.Date, dateTo);

  // Group-by dimensions (whitelist; keep order, dedupe, default to location).
  let dims = (Array.isArray(o.groupBy) ? o.groupBy : ['location']).filter((d) => DIMENSIONS[d]);
  dims = [...new Set(dims)];
  if (!dims.length) dims = ['location'];

  const grain = GRAINS[o.granularity] !== undefined ? o.granularity : 'none';
  const bucketExpr = GRAINS[grain];

  // Filters
  const where = ['f.[PostingDate] >= @from', 'f.[PostingDate] <= @to'];
  const co  = inClause(req, o.companies,     'co',  sql.NVarChar(20));  if (co)  where.push(`f.[Company] IN (${co})`);
  const lc  = inClause(req, o.locations,     'lc',  sql.NVarChar(20));  if (lc)  where.push(`f.[LocationCode] IN (${lc})`);
  const pg  = inClause(req, o.postingGroups, 'pg',  sql.NVarChar(40));  if (pg)  where.push(`f.[InventoryPostingGroup] IN (${pg})`);
  const et  = inClause(req, o.entryTypes,    'et',  sql.Int);           if (et)  where.push(`f.[EntryType] IN (${et})`);
  const it  = inClause(req, o.items,         'it',  sql.NVarChar(40));  if (it)  where.push(`f.[ItemNo] IN (${it})`);

  const selDims = dims.map((d) => `${DIMENSIONS[d].col} AS [${d}]`);
  const grpCols = dims.map((d) => DIMENSIONS[d].col);
  const wantItem = dims.includes('item');
  const wantLoc  = dims.includes('location');
  if (bucketExpr) { selDims.push(`${bucketExpr} AS [bucket]`); grpCols.push(bucketExpr); }
  if (wantItem)   { selDims.push('MIN(i.[Description]) AS [itemName]'); }
  if (wantLoc)    { selDims.push('MIN(l.[Name]) AS [locationName]'); }

  // Deduped dimension joins (a code can appear per company in the dim, so collapse
  // to one name per code to avoid fanning out the aggregate).
  const itemJoin = wantItem
    ? 'LEFT JOIN (SELECT [No_], MAX([Description]) AS [Description] FROM dbo.dim_ALLITEMS_MV GROUP BY [No_]) i ON i.[No_] = f.[ItemNo]'
    : '';
  const locJoin = wantLoc
    ? "LEFT JOIN (SELECT [Code], MAX([Name]) AS [Name] FROM dbo.dim_ALLLOCATIONS_MV WHERE [Name] IS NOT NULL AND [Name] <> '' GROUP BY [Code]) l ON l.[Code] = f.[LocationCode]"
    : '';

  const q = `
    SELECT ${selDims.join(', ')},
      SUM(f.[Quantity])          AS [quantity],
      SUM(f.[InvoicedQuantity])  AS [invoicedQty],
      SUM(f.[CostAmountActual])  AS [cost],
      SUM(f.[SalesAmountActual]) AS [sales],
      COUNT(*)                   AS [entries]
    FROM dbo.fact_ILE_MV f
    ${itemJoin}
    ${locJoin}
    WHERE ${where.join(' AND ')}
    GROUP BY ${grpCols.join(', ')}
    ORDER BY ${grpCols.join(', ')}`;

  const r = await req.query(q);

  // Decorate entryType with its label; totals across the whole result.
  const rows = r.recordset.map((x) => {
    if ('entryType' in x) x.entryTypeName = ENTRY_TYPES[Number(x.entryType)] ?? String(x.entryType);
    if (x.bucket) x.bucket = new Date(x.bucket).toISOString().slice(0, 10);
    return x;
  });
  const totals = rows.reduce((a, x) => {
    a.quantity += Number(x.quantity || 0); a.cost += Number(x.cost || 0);
    a.sales += Number(x.sales || 0); a.entries += Number(x.entries || 0);
    return a;
  }, { quantity: 0, cost: 0, sales: 0, entries: 0 });

  return { dims, granularity: grain, dateFrom, dateTo, rowCount: rows.length, rows, totals };
}
