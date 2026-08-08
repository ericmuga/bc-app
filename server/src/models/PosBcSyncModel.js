/**
 * models/PosBcSyncModel.js
 * POS → Business Central sync (DB-to-DB). Maps paid POS orders to BC's
 * "Imported SalesAL" staging-table schema so they can be exported for review
 * and (later) inserted straight into
 *   [dbo].[{prefix}$Imported SalesAL$23dc970e-11e8-4d9b-8613-b7582aec86ba]
 * which BC's own AL then processes into sales documents.
 *
 * Phase 1 (this file): read-only mapping + export. The DB-to-DB writer will
 * reuse buildImportedSalesRows() once a writable BC connection is confirmed.
 */
import { db as appDb, sql } from '../db/pool.js';
import { bcDb, bcSql } from '../db/bcPool.js';
import { bcTable } from '../services/bcTables.js';
import { getStockRequest } from './PosStockModel.js';
import logger from '../services/logger.js';

const toSuom = (u) => (/^(KG|KGS|KGM|KILOGRAM|KILOGRAMME|KILO)$/.test(String(u || '').trim().toUpperCase()) ? 'KG' : 'PC');
const yyyymmdd = (d) => {
  const x = d ? new Date(d) : new Date();
  return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, '0')}${String(x.getDate()).padStart(2, '0')}`;
};

const num = (v) => (isNaN(Number(v)) ? 0 : Number(v));

// Which BC company a shop transacts for, + that company's BC customer no.
const COMPANY_CUSTOMER_FIELDS = [
  { company: 'FCL', field: 'FclCustomerNo' },
  { company: 'CM',  field: 'CmCustomerNo' },
  { company: 'RMK', field: 'RmkCustomerNo' },
  { company: 'FLM', field: 'FlmCustomerNo' },
];

/** Resolve a shop's BC company + customer no (from PosShop's per-company customer fields). */
export async function resolveShopCompany(shopCode) {
  const pool = await appDb.getPool();
  const r = await pool.request()
    .input('code', sql.NVarChar(50), String(shopCode || '').toUpperCase())
    .query(`SELECT [Code],[Name],[SalespersonCode],[FclCustomerNo],[CmCustomerNo],[RmkCustomerNo],[FlmCustomerNo],[WalkInCustomerNo]
            FROM [dbo].[PosShop] WHERE [Code]=@code`);
  const s = r.recordset[0];
  if (!s) throw new Error(`Shop ${shopCode} not found`);
  const hit = COMPANY_CUSTOMER_FIELDS.find((c) => s[c.field]);
  if (!hit) throw new Error(`Shop ${shopCode} has no BC customer number set for any company`);
  return {
    company: hit.company, customerNo: String(s[hit.field]).trim(),
    shopName: s.Name || '', salespersonCode: s.SalespersonCode || '',
  };
}

// The exact BC staging columns (order matters for the export sheet). The
// system/$ columns are BC-generated and deliberately omitted.
export const IMPORTED_SALES_COLUMNS = [
  'ExtDocNo', 'LineNo', 'CustNO', 'Date', 'SPCode', 'ShiptoCOde', 'ItemNo', 'Qty',
  'Location', 'SUOM', 'UnitPrice', 'ShiptoName', 'TotalHeaderAmount', 'LineAmount',
  'TotalHeaderQty', 'Type', 'Executed', 'Posted', 'ItemBlockedStatus', 'RevertFlag',
  'CUInvoiceNo', 'CUNo', 'SigningTime', 'BillTo', 'Expected Line Count', 'Error', 'Error Message',
];

/**
 * Build Imported-SalesAL rows from paid POS orders.
 * @param {object} f { shopCode, dateFrom, dateTo, lineType }
 *   lineType → the BC [Type] value to stamp (default 0; item lines).
 * @returns {Array<object>} one object per order line, keyed by IMPORTED_SALES_COLUMNS.
 */
export async function buildImportedSalesRows({ shopCode = null, dateFrom, dateTo, lineType = 0, orderNo = null } = {}) {
  const pool = await appDb.getPool();
  const req = pool.request();
  req.input('from', sql.DateTime2, dateFrom ? new Date(dateFrom) : new Date('2000-01-01'));
  req.input('to',   sql.DateTime2, dateTo ? new Date(dateTo + 'T23:59:59') : new Date());
  let shopFilter = '';
  if (shopCode) { req.input('shop', sql.NVarChar(50), String(shopCode).toUpperCase()); shopFilter = 'AND o.[ShopCode] = @shop'; }
  // Single-order targeting (used by the immediate per-sale push). When given, the
  // wide default date range still matches the order regardless of when it posted.
  let orderFilter = '';
  if (orderNo) { req.input('orderNo', sql.NVarChar(30), String(orderNo)); orderFilter = 'AND o.[OrderNo] = @orderNo'; }

  const r = await req.query(`
    SELECT o.[OrderNo], o.[ContactNo], o.[ContactName], o.[TotalAmount],
           CONVERT(varchar(10), DATEADD(HOUR, 3, o.[CreatedAt]), 23) AS OrderDate,  -- EAT calendar date, no time
           o.[EtimsInvoiceNo], o.[CuSerialNo], o.[SignedAt], o.[ShopCode],
           s.[SalespersonCode], s.[LocationCode],
           l.[ItemNo], l.[Quantity], l.[UnitPrice], l.[LineAmount], l.[SortOrder], l.[LineId],
           it.[UnitOfMeasure],
           hdr.TotalQty, hdr.LineCount
    FROM [dbo].[PosOrder] o
    JOIN [dbo].[PosOrderLine] l ON l.[OrderId] = o.[OrderId]
    LEFT JOIN [dbo].[PosShop] s ON s.[Code] = o.[ShopCode]
    LEFT JOIN [dbo].[PosItem] it ON it.[ItemNo] = l.[ItemNo]
    CROSS APPLY (
      SELECT SUM(l2.[Quantity]) AS TotalQty, COUNT(*) AS LineCount
      FROM [dbo].[PosOrderLine] l2 WHERE l2.[OrderId] = o.[OrderId]
    ) hdr
    WHERE o.[Status] NOT IN ('open', 'cancelled')
      AND o.[CreatedAt] BETWEEN @from AND @to
      ${shopFilter}
      ${orderFilter}
    ORDER BY o.[OrderNo], l.[SortOrder], l.[LineId]
  `);

  const rows = [];
  const lineNoByOrder = new Map();
  for (const x of r.recordset) {
    const seq = (lineNoByOrder.get(x.OrderNo) || 0) + 1;
    lineNoByOrder.set(x.OrderNo, seq);
    const cust = (x.ContactNo || '').slice(0, 10);
    rows.push({
      ExtDocNo:            (x.OrderNo || '').slice(0, 30),
      LineNo:              seq * 10000,
      CustNO:              cust,
      Date:                x.OrderDate,   // 'YYYY-MM-DD' → BC datetime midnight
      SPCode:              (x.SalespersonCode || '').slice(0, 10),
      ShiptoCOde:          '',
      ItemNo:              (x.ItemNo || '').slice(0, 10),
      Qty:                 num(x.Quantity),
      Location:            (x.LocationCode || '').slice(0, 10),
      // SUOM is PC or KG only — KG for weight units, PC for everything else
      // (incl. the placeholder 'U' and blanks). TODO: real per-item SUOM later.
      SUOM:                /^(KG|KGS|KGM|KILOGRAM|KILOGRAMME|KILO)$/.test(String(x.UnitOfMeasure || '').trim().toUpperCase()) ? 'KG' : 'PC',
      UnitPrice:           num(x.UnitPrice),
      ShiptoName:          (x.ContactName || '').slice(0, 100),
      TotalHeaderAmount:   num(x.TotalAmount),
      LineAmount:          num(x.LineAmount),
      TotalHeaderQty:      num(x.TotalQty),
      Type:                Number(lineType) || 0,
      Executed:            0,
      Posted:              0,
      ItemBlockedStatus:   0,
      RevertFlag:          0,
      CUInvoiceNo:         (x.EtimsInvoiceNo || '').slice(0, 100),
      CUNo:                (x.CuSerialNo || '').slice(0, 100),
      SigningTime:         (x.SignedAt || '').slice(0, 100),
      BillTo:              cust,
      'Expected Line Count': Number(x.LineCount) || 0,
      Error:               0,
      'Error Message':     '',
    });
  }
  return rows;
}

// Columns we write to the BC staging table (system/$ + Executed/Posted/Error use
// table defaults). Order-of-insert is not important — we name them explicitly.
const PUSH_COLUMNS = [
  'ExtDocNo', 'LineNo', 'CustNO', 'Date', 'SPCode', 'ShiptoCOde', 'ItemNo', 'Qty',
  'Location', 'SUOM', 'UnitPrice', 'ShiptoName', 'TotalHeaderAmount', 'LineAmount',
  'TotalHeaderQty', 'Type', 'CUInvoiceNo', 'CUNo', 'SigningTime', 'BillTo', 'Expected Line Count',
];
const PUSH_TYPES = {
  ExtDocNo: bcSql.NVarChar(30), LineNo: bcSql.Int, CustNO: bcSql.NVarChar(10),
  Date: bcSql.NVarChar(10), SPCode: bcSql.NVarChar(10), ShiptoCOde: bcSql.NVarChar(10),  // 'YYYY-MM-DD'; BC widens to datetime midnight
  ItemNo: bcSql.NVarChar(10), Qty: bcSql.Decimal(38, 4), Location: bcSql.NVarChar(10),
  SUOM: bcSql.NVarChar(10), UnitPrice: bcSql.Decimal(38, 4), ShiptoName: bcSql.NVarChar(100),
  TotalHeaderAmount: bcSql.Decimal(38, 4), LineAmount: bcSql.Decimal(38, 4),
  TotalHeaderQty: bcSql.Decimal(38, 4), Type: bcSql.Int, CUInvoiceNo: bcSql.NVarChar(100),
  CUNo: bcSql.NVarChar(100), SigningTime: bcSql.NVarChar(100), BillTo: bcSql.NVarChar(10),
  'Expected Line Count': bcSql.Int,
};

/**
 * DB-to-DB push: insert a shop's paid POS invoice lines into BC's per-company
 * [{prefix}$Imported SalesAL$...] staging table. Idempotent — skips any
 * (ExtDocNo, LineNo) already present (so re-running won't duplicate or clobber
 * rows BC has already executed/posted). Blank customer nos fall back to the
 * shop's BC customer.
 *
 * @returns { company, table, candidates, inserted, skipped, orders:[ExtDocNo…] }
 */
export async function pushImportedSales({ shopCode, dateFrom, dateTo, lineType = 0, orderNo = null } = {}) {
  if (!shopCode) throw new Error('shopCode is required');
  const { company, customerNo } = await resolveShopCompany(shopCode);
  const rows = await buildImportedSalesRows({ shopCode, dateFrom, dateTo, lineType, orderNo });
  if (!rows.length) return { company, table: null, candidates: 0, inserted: 0, skipped: 0, orders: [] };

  // CustNO & BillTo are always the shop's BC customer no (ignore the per-order
  // walk-in contact, e.g. LOCAL-MSEO).
  const shopCust = customerNo.slice(0, 10);
  for (const r of rows) { r.CustNO = shopCust; r.BillTo = shopCust; }

  const table = bcTable(company, 'Imported SalesAL', { ext: true });
  const pool = await bcDb.getPool();

  // Which (ExtDocNo, LineNo) already exist, so we never overwrite processed rows.
  const extDocs = [...new Set(rows.map((r) => r.ExtDocNo))];
  const chk = pool.request();
  extDocs.forEach((d, i) => chk.input(`d${i}`, bcSql.NVarChar(30), d));
  const existing = await chk.query(
    `SELECT [ExtDocNo],[LineNo] FROM ${table} WHERE [ExtDocNo] IN (${extDocs.map((_, i) => `@d${i}`).join(',')})`
  );
  const seen = new Set(existing.recordset.map((r) => `${r.ExtDocNo}|${r.LineNo}`));

  let inserted = 0, skipped = 0;
  for (const r of rows) {
    if (seen.has(`${r.ExtDocNo}|${r.LineNo}`)) { skipped++; continue; }
    const req = pool.request();
    for (const c of PUSH_COLUMNS) {
      let v = r[c];
      // Date → 'YYYYMMDD' (dateformat-independent; a dashed 'YYYY-MM-DD' string
      // is rejected on this server's dateformat). BC widens it to datetime midnight.
      if (c === 'Date') v = String(v || '').replace(/-/g, '');
      req.input(`c_${c.replace(/\W/g, '')}`, PUSH_TYPES[c], v ?? (typeof v === 'number' ? 0 : ''));
    }
    const cols = PUSH_COLUMNS.map((c) => `[${c}]`).join(', ');
    const vals = PUSH_COLUMNS.map((c) => `@c_${c.replace(/\W/g, '')}`).join(', ');
    await req.query(`INSERT INTO ${table} (${cols}) VALUES (${vals})`);
    inserted++;
  }

  logger.info('pushImportedSales', { shopCode, company, inserted, skipped, candidates: rows.length });
  return { company, table, candidates: rows.length, inserted, skipped, orders: extDocs };
}

// ── Stock request → BC Imported Orders (PDA transfer request) ─────────────────
const ORDER_PUSH_COLUMNS = [
  'External Document No_', 'Line No_', 'Sell-to Customer No_', 'Shipment Date',
  'Salesperson Code', 'Ship-to Code', 'Item No_', 'Quantity', 'Unit of Measure',
  'Ship-to Name', 'Status', 'Customer Specification', 'Company',
  'Expected Line Count', 'Error Message', 'PDA Order', 'External Order URL', 'Product Specification',
];
const ORDER_PUSH_TYPES = {
  'External Document No_': bcSql.NVarChar(30), 'Line No_': bcSql.Int,
  'Sell-to Customer No_': bcSql.NVarChar(20), 'Shipment Date': bcSql.NVarChar(10),  // 'YYYYMMDD'
  'Salesperson Code': bcSql.NVarChar(20), 'Ship-to Code': bcSql.NVarChar(20),
  'Item No_': bcSql.NVarChar(20), 'Quantity': bcSql.Decimal(38, 4), 'Unit of Measure': bcSql.NVarChar(10),
  'Ship-to Name': bcSql.NVarChar(100), 'Status': bcSql.Int, 'Customer Specification': bcSql.NVarChar(250),
  'Company': bcSql.NVarChar(30), 'Expected Line Count': bcSql.Int, 'Error Message': bcSql.NVarChar(250),
  'PDA Order': bcSql.TinyInt, 'External Order URL': bcSql.NVarChar(250), 'Product Specification': bcSql.NVarChar(250),
};

/**
 * DB-to-DB push of a confirmed stock request into BC's per-company
 * [{prefix}$Imported Orders$...] table, marked as a PDA order for BC to action.
 * Idempotent — skips (External Document No_, Line No_) already present.
 * @returns { company, table, candidates, inserted, skipped }
 */
export async function pushImportedOrder({ requestId }) {
  const reqOrder = await getStockRequest(requestId);
  if (!reqOrder) throw new Error('Stock request not found');
  const { company, customerNo, shopName, salespersonCode } = await resolveShopCompany(reqOrder.shopCode);
  const lines = (reqOrder.lines || []).filter((l) => l.itemNo && Number(l.quantityRequested) > 0);
  if (!lines.length) return { company, table: null, candidates: 0, inserted: 0, skipped: 0 };

  const table = bcTable(company, 'Imported Orders', { ext: true });
  const pool = await bcDb.getPool();
  const extDoc = reqOrder.requestNo;

  const chk = await pool.request()
    .input('x', bcSql.NVarChar(30), extDoc)
    .query(`SELECT [Line No_] FROM ${table} WHERE [External Document No_]=@x`);
  const seen = new Set(chk.recordset.map((r) => Number(r['Line No_'])));

  const shipDate = yyyymmdd(new Date());
  let inserted = 0, skipped = 0, seq = 0;
  for (const l of lines) {
    seq += 1;
    const lineNo = seq * 10000;
    if (seen.has(lineNo)) { skipped++; continue; }
    const values = {
      'External Document No_': extDoc,
      'Line No_': lineNo,
      'Sell-to Customer No_': customerNo.slice(0, 20),
      'Shipment Date': shipDate,
      'Salesperson Code': String(salespersonCode || '').slice(0, 20),
      'Ship-to Code': '',
      'Item No_': String(l.itemNo).slice(0, 20),
      'Quantity': Number(l.quantityRequested) || 0,
      'Unit of Measure': toSuom(l.unitOfMeasure),
      'Ship-to Name': String(shopName || '').slice(0, 100),
      'Status': 0,
      'Customer Specification': String(reqOrder.notes || '').slice(0, 250),
      'Company': company,
      'Expected Line Count': lines.length,
      'Error Message': '',
      'PDA Order': 1,
      'External Order URL': '',
      'Product Specification': '',
    };
    const req = pool.request();
    for (const c of ORDER_PUSH_COLUMNS) req.input(`c_${c.replace(/\W/g, '')}`, ORDER_PUSH_TYPES[c], values[c]);
    const cols = ORDER_PUSH_COLUMNS.map((c) => `[${c}]`).join(', ');
    const vals = ORDER_PUSH_COLUMNS.map((c) => `@c_${c.replace(/\W/g, '')}`).join(', ');
    await req.query(`INSERT INTO ${table} (${cols}) VALUES (${vals})`);
    inserted++;
  }
  logger.info('pushImportedOrder', { requestNo: extDoc, company, inserted, skipped, lines: lines.length });
  return { company, table, candidates: lines.length, inserted, skipped };
}

/**
 * BC posting readiness for a shop — is everything the POS pushed already processed
 * by BC? Inspects the staging tables: pending sales are pushed lines still
 * Executed=0 / Posted=0; pending orders are pushed rows still Status=0. Use this
 * before a morning Harmonize so we don't reconcile against a BC that hasn't yet
 * absorbed the shop's own sales/receipts.
 *
 * A per-table read that errors (e.g. a differently-named flag column) yields
 * `null` for that side and a warning, so the caller can proceed with caution
 * rather than crash. `ready` is true only when both sides are confirmed clear.
 *
 * @returns { company, customerNo, salesPending, ordersPending, ready, warnings[] }
 */
export async function bcPostingReadiness({ shopCode }) {
  const { company, customerNo } = await resolveShopCompany(shopCode);
  const pool = await bcDb.getPool();
  const salesTable  = bcTable(company, 'Imported SalesAL', { ext: true });
  const ordersTable = bcTable(company, 'Imported Orders',  { ext: true });
  const warnings = [];

  let salesPending = null;
  try {
    const s = await pool.request()
      .input('cust', bcSql.NVarChar(20), customerNo.slice(0, 10))
      .query(`SELECT COUNT(*) AS Lines, COUNT(DISTINCT [ExtDocNo]) AS Docs
              FROM ${salesTable}
              WHERE [CustNO]=@cust AND (ISNULL([Executed],0)=0 OR ISNULL([Posted],0)=0)`);
    salesPending = { lines: Number(s.recordset[0]?.Lines || 0), docs: Number(s.recordset[0]?.Docs || 0) };
  } catch (e) { warnings.push(`Could not read Imported SalesAL: ${e.message}`); }

  let ordersPending = null;
  try {
    const o = await pool.request()
      .input('cust', bcSql.NVarChar(20), customerNo.slice(0, 20))
      .query(`SELECT COUNT(*) AS Lines, COUNT(DISTINCT [External Document No_]) AS Docs
              FROM ${ordersTable}
              WHERE [Sell-to Customer No_]=@cust AND ISNULL([Status],0)=0`);
    ordersPending = { lines: Number(o.recordset[0]?.Lines || 0), docs: Number(o.recordset[0]?.Docs || 0) };
  } catch (e) { warnings.push(`Could not read Imported Orders: ${e.message}`); }

  const ready = salesPending !== null && ordersPending !== null
    && salesPending.lines === 0 && ordersPending.lines === 0;

  return { company, customerNo, salesPending, ordersPending, ready, warnings };
}

/**
 * Bulk (re)push of a shop's approved/completed stock requests into BC Imported
 * Orders. Idempotent per request (skips lines already present). Used by the Sync
 * Center to backfill anything a live auto-push may have missed (BC was busy).
 */
export async function pushAllImportedOrders({ shopCode }) {
  const pool = await appDb.getPool();
  const r = await pool.request()
    .input('shop', sql.NVarChar(50), String(shopCode || '').toUpperCase())
    .query(`SELECT [RequestId],[RequestNo] FROM [dbo].[PosStockRequest]
            WHERE [ShopCode]=@shop AND [Status] IN ('approved','completed')
            ORDER BY [CreatedAt] DESC`);
  let inserted = 0, skipped = 0;
  const results = [];
  for (const row of r.recordset) {
    try {
      const res = await pushImportedOrder({ requestId: row.RequestId });
      inserted += res.inserted; skipped += res.skipped;
      results.push({ requestNo: row.RequestNo, inserted: res.inserted, skipped: res.skipped });
    } catch (e) { results.push({ requestNo: row.RequestNo, error: e.message }); }
  }
  logger.info('pushAllImportedOrders', { shopCode, requests: r.recordset.length, inserted, skipped });
  return { shopCode, requests: r.recordset.length, inserted, skipped, results };
}

// ── Fire-and-forget variants ─────────────────────────────────────────────────
// Kick off the BC push but NEVER throw and NEVER block the caller. If BC is busy
// or unreachable the sale / approval still completes; the awaited functions above
// remain available (idempotent) for a manual retry or the bulk push. Call these
// WITHOUT await so the HTTP response returns immediately.
export function pushImportedSalesBg(args = {}) {
  return Promise.resolve()
    .then(() => pushImportedSales(args))
    .then((r) => logger.info('pushImportedSales(bg)', { shopCode: args.shopCode, orderNo: args.orderNo, inserted: r.inserted, skipped: r.skipped }))
    .catch((e) => logger.error('pushImportedSales(bg) failed', { error: e.message, shopCode: args.shopCode, orderNo: args.orderNo }));
}
export function pushImportedOrderBg(args = {}) {
  return Promise.resolve()
    .then(() => pushImportedOrder(args))
    .then((r) => logger.info('pushImportedOrder(bg)', { requestId: args.requestId, inserted: r.inserted, skipped: r.skipped }))
    .catch((e) => logger.error('pushImportedOrder(bg) failed', { error: e.message, requestId: args.requestId }));
}
