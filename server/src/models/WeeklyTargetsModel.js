/**
 * models/WeeklyTargetsModel.js
 * Upload + read [FCLWHS].[dbo].[FACT_WEEKLYTARGETS] on FC-AZ-BCDB01 (172.16.10.9).
 * WatermarkLoadedAt is stamped server-side; never taken from the sheet.
 */
import { whsDb, whsSql as sql } from '../db/whsPool.js';
import { bcDb } from '../db/bcPool.js';
import { bcTable } from '../services/bcTables.js';

const TABLE = '[dbo].[FACT_WEEKLYTARGETS]';

// Export is identified by the customer's BC Customer Posting Group, per company.
const EXPORT_PG = { FCL: 'EXPORT', CM: 'BEXPORT' };
const round9 = (n) => Math.round((Number(n) || 0) * 1e9) / 1e9;

const str = (v, max) => { const s = v == null ? null : String(v).trim(); return s ? s.slice(0, max) : null; };
const dec = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; };

// Only these keys are accepted from a caller; WatermarkLoadedAt is set here.
function pick(raw = {}) {
  return {
    CustomerNo:      str(raw.CustomerNo, 20),
    ShipToCode:      str(raw.ShipToCode, 10),
    ItemNo:          str(raw.ItemNo, 20),
    VolTargetKgs:    dec(raw.VolTargetKgs),
    ValTarget:       dec(raw.ValTarget),
    Company:         str(raw.Company, 10),
    Outlet:          str(raw.Outlet, 20),
    MonthNameSorted: str(raw.MonthNameSorted, 7),
  };
}

// Batched multi-row INSERT. 8 params/row + inline WatermarkLoadedAt; chunked to
// stay well under SQL Server's 2100-parameter statement limit.
const CHUNK = 200;

/** Insert already-normalised rows. Returns { inserted }. */
export async function bulkInsert(rows) {
  const clean = (Array.isArray(rows) ? rows : []).map(pick).filter((r) => r.CustomerNo || r.ItemNo);
  if (!clean.length) return { inserted: 0 };
  const pool = await whsDb.getPool();
  let inserted = 0;
  for (let i = 0; i < clean.length; i += CHUNK) {
    const batch = clean.slice(i, i + CHUNK);
    const req = pool.request();
    const tuples = batch.map((r, j) => {
      req.input(`c${j}`,   sql.VarChar(20),   r.CustomerNo);
      req.input(`s${j}`,   sql.VarChar(10),   r.ShipToCode);
      req.input(`i${j}`,   sql.VarChar(20),   r.ItemNo);
      req.input(`v${j}`,   sql.Decimal(18, 9), r.VolTargetKgs);
      req.input(`val${j}`, sql.Decimal(18, 9), r.ValTarget);
      req.input(`co${j}`,  sql.VarChar(10),   r.Company);
      req.input(`o${j}`,   sql.VarChar(20),   r.Outlet);
      req.input(`m${j}`,   sql.Char(7),       r.MonthNameSorted);
      return `(@c${j},@s${j},@i${j},@v${j},@val${j},@co${j},@o${j},@m${j},SYSUTCDATETIME())`;
    });
    await req.query(`
      INSERT INTO ${TABLE}
        ([CustomerNo],[ShipToCode],[ItemNo],[VolTargetKgs],[ValTarget],[Company],[Outlet],[MonthNameSorted],[WatermarkLoadedAt])
      VALUES ${tuples.join(',')}
    `);
    inserted += batch.length;
  }
  return { inserted };
}

/** Delete all rows for the given MonthNameSorted values. Returns rows deleted. */
export async function deleteMonths(months) {
  const list = [...new Set((Array.isArray(months) ? months : []).map((m) => str(m, 7)).filter(Boolean))];
  if (!list.length) return 0;
  const pool = await whsDb.getPool();
  const r = pool.request();
  list.forEach((m, i) => r.input(`m${i}`, sql.Char(7), m));
  const res = await r.query(`DELETE FROM ${TABLE} WHERE [MonthNameSorted] IN (${list.map((_, i) => `@m${i}`).join(', ')})`);
  return res.rowsAffected[0] || 0;
}

/** Distinct months (newest first). */
export async function listMonths() {
  const pool = await whsDb.getPool();
  const res = await pool.request().query(
    `SELECT DISTINCT [MonthNameSorted] FROM ${TABLE} ORDER BY [MonthNameSorted] DESC`
  );
  return res.recordset.map((x) => x.MonthNameSorted?.trim()).filter(Boolean);
}

/** List rows with optional filters. */
export async function listTargets(filter = {}) {
  const pool = await whsDb.getPool();
  const r = pool.request();
  const where = [];
  if (filter.month)      { r.input('month', sql.Char(7), String(filter.month).slice(0, 7)); where.push('[MonthNameSorted]=@month'); }
  if (filter.company)    { r.input('company', sql.VarChar(10), filter.company); where.push('[Company]=@company'); }
  if (filter.customerNo) { r.input('cust', sql.VarChar(20), filter.customerNo); where.push('[CustomerNo]=@cust'); }
  if (filter.q) {
    r.input('q', sql.VarChar(50), `%${filter.q}%`);
    where.push('([CustomerNo] LIKE @q OR [ItemNo] LIKE @q OR [Outlet] LIKE @q OR [ShipToCode] LIKE @q)');
  }
  const limit = Math.min(Math.max(parseInt(filter.limit, 10) || 1000, 1), 20000);
  const res = await r.query(`
    SELECT TOP (${limit}) [CustomerNo],[ShipToCode],[ItemNo],[VolTargetKgs],[ValTarget],
           [Company],[Outlet],[MonthNameSorted],[WatermarkLoadedAt]
    FROM ${TABLE}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY [MonthNameSorted] DESC, [CustomerNo], [ItemNo]
  `);
  return res.recordset;
}

export const TARGET_COLUMNS = ['CustomerNo', 'ShipToCode', 'ItemNo', 'VolTargetKgs', 'ValTarget', 'Company', 'Outlet', 'MonthNameSorted'];

// ── Bulk split engine ────────────────────────────────────────────────────────
/** company → Map(customerNo → posting group), read from BC Customer tables. */
async function loadPostingGroups(companies) {
  const bcPool = await bcDb.getPool();
  const map = {};
  for (const c of companies) {
    map[c] = new Map();
    try {
      const r = await bcPool.request().query(
        `SELECT [No_] AS no, [Customer Posting Group] AS pg FROM ${bcTable(c, 'Customer')}`
      );
      r.recordset.forEach((x) => map[c].set(String(x.no).trim(), String(x.pg || '').trim().toUpperCase()));
    } catch { /* company table may not exist */ }
  }
  return map;
}

/**
 * Export base = export customers' ACTUAL BC sales over the last N months,
 * aggregated by Customer · Ship-to · Item (Quantity Base = Kg, Amount = value).
 * Export customers are those whose BC posting group = EXPORT_PG[company].
 */
async function exportBaseFromBcSales(companies, months) {
  const bcPool = await bcDb.getPool();
  const n = Math.max(1, Math.min(parseInt(months, 10) || 3, 24));
  const out = [];
  for (const c of companies) {
    const pg = EXPORT_PG[String(c).toUpperCase()];
    if (!pg) continue;
    const sih = bcTable(c, 'Sales Invoice Header');
    const sil = bcTable(c, 'Sales Invoice Line');
    const cust = bcTable(c, 'Customer');
    try {
      const r = await bcPool.request().input('pg', sql.VarChar(20), pg).query(`
        SELECT h.[Sell-to Customer No_] AS CustomerNo, h.[Ship-to Code] AS ShipToCode,
               l.[No_] AS ItemNo, SUM(l.[Quantity (Base)]) AS Vol, SUM(l.[Amount Including VAT]) AS Val
        FROM ${sih} h
        JOIN ${sil} l ON l.[Document No_] = h.[No_]
        JOIN ${cust} cu ON cu.[No_] = h.[Sell-to Customer No_]
        WHERE l.[Type] = 2
          AND UPPER(LTRIM(RTRIM(cu.[Customer Posting Group]))) = @pg
          AND h.[Posting Date] >= DATEADD(month, -${n}, CAST(GETDATE() AS date))
        GROUP BY h.[Sell-to Customer No_], h.[Ship-to Code], l.[No_]
        HAVING SUM(l.[Quantity (Base)]) > 0
      `);
      r.recordset.forEach((x) => out.push({
        CustomerNo: String(x.CustomerNo || '').trim(),
        ShipToCode: String(x.ShipToCode || '').trim(),
        ItemNo: String(x.ItemNo || '').trim(),
        Vol: Number(x.Vol || 0), Val: Number(x.Val || 0), Company: String(c).toUpperCase(),
      }));
    } catch { /* company may lack export data */ }
  }
  return out;
}

/**
 * Split bulk volume totals into the FACT detail. DOMESTIC proportions come from
 * a base month's mix; EXPORT proportions come from export customers' actual BC
 * sales (last `exportSalesMonths` months). Value = volume × base price-per-kg.
 * @param {object} p { baseMonth, targetMonth, domesticVol, exportVol, exportSalesMonths }
 */
export async function generateSplit({ baseMonth, targetMonth, domesticVol, exportVol, exportSalesMonths = 3 }) {
  const bm = String(baseMonth || '').slice(0, 7);
  const tm = String(targetMonth || '').slice(0, 7);
  if (!bm || !tm) throw new Error('baseMonth and targetMonth are required (YYYY-MM)');
  const domTotal = Number(domesticVol) || 0;
  const expTotal = Number(exportVol) || 0;

  const pool = await whsDb.getPool();
  const base = (await pool.request().input('m', sql.Char(7), bm).query(`
    SELECT [CustomerNo],[ShipToCode],[ItemNo],[VolTargetKgs],[ValTarget],[Company],[Outlet]
    FROM ${TABLE} WHERE [MonthNameSorted]=@m
  `)).recordset;
  if (!base.length) throw new Error(`No base-month data for ${bm}`);

  const companies = [...new Set(base.map((r) => String(r.Company || '').trim().toUpperCase()))];
  const pgMap = await loadPostingGroups(companies);
  const isExport = (r) => {
    const co = String(r.Company || '').trim().toUpperCase();
    const pg = pgMap[co]?.get(String(r.CustomerNo).trim()) || '';
    return EXPORT_PG[co] && pg === EXPORT_PG[co];
  };

  // Domestic base = non-export rows of the base month.
  const domBaseRows = base.filter((r) => !isExport(r));
  const domBase = domBaseRows.reduce((t, r) => t + Number(r.VolTargetKgs || 0), 0);

  // Export base = actual BC sales of export customers.
  const expRows = await exportBaseFromBcSales(companies, exportSalesMonths);
  const expBase = expRows.reduce((t, r) => t + r.Vol, 0);

  const rows = [];
  for (const r of domBaseRows) {
    const v = Number(r.VolTargetKgs || 0);
    const newVol = domBase > 0 ? (v / domBase) * domTotal : 0;
    const baseVol = v, baseVal = Number(r.ValTarget || 0);
    rows.push({
      CustomerNo: r.CustomerNo, ShipToCode: r.ShipToCode, ItemNo: r.ItemNo,
      VolTargetKgs: round9(newVol), ValTarget: round9(newVol * (baseVol > 0 ? baseVal / baseVol : 0)),
      Company: r.Company, Outlet: r.Outlet, MonthNameSorted: tm, _segment: 'domestic',
    });
  }
  for (const e of expRows) {
    const newVol = expBase > 0 ? (e.Vol / expBase) * expTotal : 0;
    rows.push({
      CustomerNo: e.CustomerNo, ShipToCode: e.ShipToCode, ItemNo: e.ItemNo,
      VolTargetKgs: round9(newVol), ValTarget: round9(newVol * (e.Vol > 0 ? e.Val / e.Vol : 0)),
      Company: e.Company, Outlet: `${e.CustomerNo}_${e.ShipToCode}_${e.Company}`,
      MonthNameSorted: tm, _segment: 'export',
    });
  }

  const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
  return {
    rows,
    summary: {
      baseMonth: bm, targetMonth: tm, exportSalesMonths: Math.max(1, parseInt(exportSalesMonths, 10) || 3),
      domesticBaseVol: round9(domBase), exportBaseVol: round9(expBase),
      domesticTargetVol: domTotal, exportTargetVol: expTotal,
      domesticRows: domBaseRows.length, exportRows: expRows.length,
      rowCount: rows.length,
      outVol: round9(sum(rows, (x) => x.VolTargetKgs)),
      outVal: round9(sum(rows, (x) => x.ValTarget)),
    },
  };
}

/** Generate the split and write it to the target month (replaces that month). */
export async function commitSplit(params) {
  const { rows, summary } = await generateSplit(params);
  const deleted = await deleteMonths([summary.targetMonth]);
  const { inserted } = await bulkInsert(rows.map(({ _segment, ...r }) => r));
  return { inserted, deleted, summary };
}
