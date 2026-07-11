/**
 * models/DispatchModel.js
 *
 * Dispatch / pick-and-pack pipeline against the local app DB ([dbo].[Dispatch*]).
 * A paid POS order flows in via createForOrder(); it then advances:
 *   pending → confirmed (4 parts A/B/C/D) → assigned → assembled → packed → loaded.
 *
 * All writes are parameterised. Header + lines + parts are inserted in one
 * transaction (local app DB, so no MSDTC concern).
 */
import { randomUUID } from 'crypto';
import { db as appDb, sql } from '../db/pool.js';
import { bcDb, bcSql } from '../db/bcPool.js';
import { bcTable, ALL_COMPANIES } from '../services/bcTables.js';
import logger from '../services/logger.js';

const PARTS = ['A', 'B', 'C', 'D'];

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const num = (v) => (isNaN(Number(v)) ? 0 : Number(v));
const isWeightUom = (uom) => ['KG', 'KGS', 'KILOGRAM', 'KILOGRAMS', 'KILO'].includes(String(uom || '').trim().toUpperCase());
async function appPool() { return appDb.getPool(); }

/** Generate a per-day document number: PREFIX-YYYYMMDD-### */
async function nextNo(pool, prefix, table, column) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const like = `${prefix}-${ymd}-%`;
  const r = await pool.request()
    .input('like', sql.NVarChar(40), like)
    .query(`SELECT MAX([${column}]) AS mx FROM [dbo].[${table}] WHERE [${column}] LIKE @like`);
  let seq = 1;
  const mx = r.recordset[0]?.mx;
  if (mx) { const n = parseInt(String(mx).split('-').pop(), 10); if (!isNaN(n)) seq = n + 1; }
  return `${prefix}-${ymd}-${String(seq).padStart(3, '0')}`;
}

/** Unique QR payload token for a box. */
export function genQrToken() { return randomUUID().replace(/-/g, ''); }

// ── Ingestion ────────────────────────────────────────────────────────────────
/**
 * Create a dispatch order from a paid POS order (best-effort; the caller wraps
 * this in try/catch so a failure never rolls back the sale). Idempotent: a POS
 * order maps to at most one dispatch order (unique index on SourceOrderId).
 * @param {object} order  the shape returned by PosModel.getOrder()
 * @returns {string|null} the DispatchOrderId (existing or new), or null if skipped
 */
export async function createForOrder(order) {
  if (!order || !order.orderId) return null;
  if (order.status && order.status !== 'paid') return null; // only finalised orders
  const pool = await appPool();

  const existing = await pool.request()
    .input('sid', sql.UniqueIdentifier, order.orderId)
    .query(`SELECT TOP 1 [DispatchOrderId] FROM [dbo].[DispatchOrder] WHERE [SourceOrderId]=@sid`);
  if (existing.recordset.length) return existing.recordset[0].DispatchOrderId;

  // Pull lines with the item's barcode + UoM (for scan-to-select + KG weighing).
  const linesRes = await pool.request()
    .input('oid', sql.UniqueIdentifier, order.orderId)
    .query(`
      SELECT l.[ItemNo], pi.[Barcode], l.[Description], l.[Quantity],
             pi.[UnitOfMeasure], l.[SortOrder]
      FROM [dbo].[PosOrderLine] l
      LEFT JOIN [dbo].[PosItem] pi ON pi.[ItemNo] = l.[ItemNo]
      WHERE l.[OrderId] = @oid
      ORDER BY l.[SortOrder]
    `);
  const lines = linesRes.recordset;

  const dispatchNo = await nextNo(pool, 'DSP', 'DispatchOrder', 'DispatchNo');
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const hdr = await new sql.Request(tx)
      .input('no',       sql.NVarChar(30),  dispatchNo)
      .input('sid',      sql.UniqueIdentifier, order.orderId)
      .input('orderNo',  sql.NVarChar(40),  str(order.orderNo, 40))
      .input('custNo',   sql.NVarChar(30),  str(order.contactNo, 30))
      .input('custName', sql.NVarChar(200), str(order.contactName || order.cashierName, 200))
      .input('shop',     sql.NVarChar(50),  str(order.shopCode, 50))
      .input('total',    sql.Decimal(18, 4), num(order.totalAmount))
      .query(`
        INSERT INTO [dbo].[DispatchOrder]
          ([DispatchNo],[SourceType],[SourceOrderId],[OrderNo],[CustomerNo],[CustomerName],[ShopCode],[TotalAmount],[Status])
        OUTPUT INSERTED.[DispatchOrderId]
        VALUES (@no,'pos',@sid,@orderNo,@custNo,@custName,@shop,@total,'pending')
      `);
    const dispatchOrderId = hdr.recordset[0].DispatchOrderId;

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const uom = str(ln.UnitOfMeasure, 20);
      await new sql.Request(tx)
        .input('doid',    sql.UniqueIdentifier, dispatchOrderId)
        .input('itemNo',  sql.NVarChar(30),  str(ln.ItemNo, 30))
        .input('barcode', sql.NVarChar(50),  str(ln.Barcode, 50))
        .input('desc',    sql.NVarChar(250), str(ln.Description, 250))
        .input('qty',     sql.Decimal(18, 4), num(ln.Quantity))
        .input('uom',     sql.NVarChar(20),  uom)
        .input('weighted', sql.Bit, isWeightUom(uom) ? 1 : 0)
        .input('sort',    sql.Int, Number(ln.SortOrder) || i)
        .query(`
          INSERT INTO [dbo].[DispatchOrderLine]
            ([DispatchOrderId],[ItemNo],[Barcode],[Description],[OrderQty],[Uom],[IsWeighted],[SortOrder])
          VALUES (@doid,@itemNo,@barcode,@desc,@qty,@uom,@weighted,@sort)
        `);
    }
    for (const part of PARTS) {
      await new sql.Request(tx)
        .input('doid', sql.UniqueIdentifier, dispatchOrderId)
        .input('part', sql.Char(1), part)
        .query(`INSERT INTO [dbo].[DispatchOrderPart] ([DispatchOrderId],[Part]) VALUES (@doid,@part)`);
    }
    await tx.commit();
    return dispatchOrderId;
  } catch (e) {
    try { await tx.rollback(); } catch { /* already rolled back */ }
    throw e;
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────
/** Full dispatch order: header + lines + the 4 parts. */
export async function getDispatchOrder(dispatchOrderId) {
  const pool = await appPool();
  const hdr = await pool.request()
    .input('id', sql.UniqueIdentifier, dispatchOrderId)
    .query(`SELECT * FROM [dbo].[DispatchOrder] WHERE [DispatchOrderId]=@id`);
  if (!hdr.recordset.length) return null;
  const lines = await pool.request()
    .input('id', sql.UniqueIdentifier, dispatchOrderId)
    .query(`SELECT * FROM [dbo].[DispatchOrderLine] WHERE [DispatchOrderId]=@id ORDER BY [SortOrder]`);
  const parts = await pool.request()
    .input('id', sql.UniqueIdentifier, dispatchOrderId)
    .query(`SELECT * FROM [dbo].[DispatchOrderPart] WHERE [DispatchOrderId]=@id ORDER BY [Part]`);
  return { ...hdr.recordset[0], lines: lines.recordset, parts: parts.recordset };
}

/** Registry worklist: orders not yet fully confirmed. */
export async function listForConfirmation() {
  const pool = await appPool();
  const r = await pool.request().query(`
    SELECT o.[DispatchOrderId],o.[DispatchNo],o.[OrderNo],o.[CustomerName],o.[CustomerNo],
           o.[ShopCode],o.[Status],o.[TotalAmount],o.[CreatedAt],
           SUM(CASE WHEN p.[Confirmed]=1 THEN 1 ELSE 0 END) AS ConfirmedParts,
           COUNT(p.[PartId]) AS TotalParts
    FROM [dbo].[DispatchOrder] o
    LEFT JOIN [dbo].[DispatchOrderPart] p ON p.[DispatchOrderId]=o.[DispatchOrderId]
    WHERE o.[Confirmed]=0 AND o.[Status]='pending'
    GROUP BY o.[DispatchOrderId],o.[DispatchNo],o.[OrderNo],o.[CustomerName],o.[CustomerNo],
             o.[ShopCode],o.[Status],o.[TotalAmount],o.[CreatedAt]
    ORDER BY o.[CreatedAt] DESC
  `);
  return r.recordset;
}

/** Assignment worklist: confirmed but not yet assigned to a packer. */
export async function listUnassigned() {
  const pool = await appPool();
  const r = await pool.request().query(`
    SELECT o.[DispatchOrderId],o.[DispatchNo],o.[OrderNo],o.[CustomerName],o.[CustomerNo],
           o.[ShopCode],o.[Status],o.[TotalAmount],o.[CreatedAt],
           (SELECT COUNT(*) FROM [dbo].[DispatchOrderLine] l WHERE l.[DispatchOrderId]=o.[DispatchOrderId]) AS LineCount
    FROM [dbo].[DispatchOrder] o
    WHERE o.[Confirmed]=1 AND o.[Status]='confirmed'
    ORDER BY o.[CreatedAt] DESC
  `);
  return r.recordset;
}

/** Active users of a given role (e.g. packers), for the assignment picker. */
export async function listUsersByRole(role) {
  const pool = await appPool();
  const r = await pool.request()
    .input('role', sql.NVarChar(50), String(role || ''))
    .query(`SELECT [UserId],[Username],[DisplayName] FROM [dbo].[Users]
            WHERE [Role]=@role AND [IsActive]=1 ORDER BY [DisplayName],[Username]`);
  return r.recordset.map((u) => ({ userId: String(u.UserId), name: u.DisplayName || u.Username }));
}

// ── Stage transitions ────────────────────────────────────────────────────────
/** Registry: confirm one part; flips the order to 'confirmed' once all 4 are done. */
export async function confirmPart(dispatchOrderId, part, user = {}) {
  const pool = await appPool();
  await pool.request()
    .input('doid',  sql.UniqueIdentifier, dispatchOrderId)
    .input('part',  sql.Char(1), String(part || '').toUpperCase())
    .input('uid',   sql.NVarChar(100), str(user.userId, 100))
    .input('uname', sql.NVarChar(200), str(user.userName, 200))
    .query(`
      UPDATE [dbo].[DispatchOrderPart]
      SET [Confirmed]=1,[ConfirmedByUserId]=@uid,[ConfirmedByName]=@uname,
          [ConfirmedAt]=GETUTCDATE(),[UpdatedAt]=GETUTCDATE()
      WHERE [DispatchOrderId]=@doid AND [Part]=@part
    `);
  const chk = await pool.request()
    .input('doid', sql.UniqueIdentifier, dispatchOrderId)
    .query(`SELECT SUM(CASE WHEN [Confirmed]=1 THEN 1 ELSE 0 END) AS c, COUNT(*) AS t
            FROM [dbo].[DispatchOrderPart] WHERE [DispatchOrderId]=@doid`);
  const c = Number(chk.recordset[0]?.c || 0);
  const t = Number(chk.recordset[0]?.t || 0);
  if (t > 0 && c >= t) {
    await pool.request()
      .input('doid', sql.UniqueIdentifier, dispatchOrderId)
      .query(`UPDATE [dbo].[DispatchOrder] SET [Confirmed]=1,[Status]='confirmed',[UpdatedAt]=GETUTCDATE()
              WHERE [DispatchOrderId]=@doid AND [Status]='pending'`);
  }
  return { confirmedParts: c, totalParts: t, fullyConfirmed: t > 0 && c >= t };
}

// ── BC ingestion (Refresh: pull today's "Execute" sales orders) ──────────────
// BC Sales Header [Status] is a customised option; 4 = "Execute" (env-overridable).
const EXECUTE_STATUS = () => Number(process.env.DISPATCH_EXECUTE_STATUS ?? 4);

async function fetchBcOrderLines(bcPool, slTable, orderNo) {
  const r = await bcPool.request()
    .input('no', bcSql.NVarChar(20), orderNo)
    .query(`
      SELECT [Line No_] AS [LineNo], [No_] AS ItemNo, [Description] AS Descr,
             [Quantity] AS Qty, [Unit of Measure Code] AS Uom
      FROM ${slTable}
      WHERE [Document No_]=@no AND [Type]=2 AND [Quantity] <> 0
      ORDER BY [Line No_]
    `);
  return r.recordset;
}

async function insertBcDispatchOrder(appP, company, h, lines) {
  const dispatchNo = await nextNo(appP, 'DSP', 'DispatchOrder', 'DispatchNo');
  const tx = new sql.Transaction(appP);
  await tx.begin();
  try {
    const hdr = await new sql.Request(tx)
      .input('no',       sql.NVarChar(30),  dispatchNo)
      .input('company',  sql.NVarChar(10),  company)
      .input('orderNo',  sql.NVarChar(40),  str(h.OrderNo, 40))
      .input('custNo',   sql.NVarChar(30),  str(h.CustomerNo, 30))
      .input('custName', sql.NVarChar(200), str(h.CustomerName, 200))
      .input('sp',       sql.NVarChar(20),  str(h.SalespersonCode, 20))
      .input('route',    sql.NVarChar(40),  str(h.SalespersonCode, 40))
      .input('shop',     sql.NVarChar(50),  str(h.LocationCode, 50))
      .input('shipDate', sql.Date,          h.ShipmentDate || null)
      .query(`
        INSERT INTO [dbo].[DispatchOrder]
          ([DispatchNo],[SourceType],[Company],[OrderNo],[CustomerNo],[CustomerName],
           [SalespersonCode],[RouteCode],[ShopCode],[ShipmentDate],[Status])
        OUTPUT INSERTED.[DispatchOrderId]
        VALUES (@no,'bc',@company,@orderNo,@custNo,@custName,@sp,@route,@shop,@shipDate,'pending')
      `);
    const id = hdr.recordset[0].DispatchOrderId;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const uom = str(ln.Uom, 20);
      await new sql.Request(tx)
        .input('doid',     sql.UniqueIdentifier, id)
        .input('itemNo',   sql.NVarChar(30),  str(ln.ItemNo, 30))
        .input('desc',     sql.NVarChar(250), str(ln.Descr, 250))
        .input('qty',      sql.Decimal(18, 4), num(ln.Qty))
        .input('uom',      sql.NVarChar(20),  uom)
        .input('weighted', sql.Bit, isWeightUom(uom) ? 1 : 0)
        .input('sort',     sql.Int, Number(ln.LineNo) || i)
        .query(`
          INSERT INTO [dbo].[DispatchOrderLine]
            ([DispatchOrderId],[ItemNo],[Description],[OrderQty],[Uom],[IsWeighted],[SortOrder])
          VALUES (@doid,@itemNo,@desc,@qty,@uom,@weighted,@sort)
        `);
    }
    for (const part of PARTS) {
      await new sql.Request(tx)
        .input('doid', sql.UniqueIdentifier, id).input('part', sql.Char(1), part)
        .query(`INSERT INTO [dbo].[DispatchOrderPart] ([DispatchOrderId],[Part]) VALUES (@doid,@part)`);
    }
    await tx.commit();
  } catch (e) {
    try { await tx.rollback(); } catch { /* already rolled back */ }
    throw e;
  }
}

/**
 * Pull today's (Shipment Date = today) BC sales orders at the "Execute" status
 * into the dispatch pipeline as pending-confirmation orders. Idempotent per
 * (Company, OrderNo). Reads BC live (bcDb); writes the app DB.
 */
export async function importFromBc({ companies } = {}) {
  const status = EXECUTE_STATUS();
  const comps = (Array.isArray(companies) && companies.length) ? companies : ALL_COMPANIES;
  const bcPool = await bcDb.getPool();
  const appP = await appPool();
  let imported = 0, skipped = 0;
  const byCompany = {};

  for (const c of comps) {
    byCompany[c] = { found: 0, imported: 0 };
    let headers = [];
    try {
      const sh = bcTable(c, 'Sales Header');
      const hRes = await bcPool.request()
        .input('st', bcSql.Int, status)
        .query(`
          SELECT [No_] AS OrderNo, [Sell-to Customer No_] AS CustomerNo,
                 [Sell-to Customer Name] AS CustomerName, [Salesperson Code] AS SalespersonCode,
                 [Location Code] AS LocationCode, [Shipment Date] AS ShipmentDate
          FROM ${sh}
          WHERE [Status]=@st AND CAST([Shipment Date] AS date)=CAST(GETDATE() AS date)
        `);
      headers = hRes.recordset;
    } catch (e) {
      logger.warn('dispatch importFromBc: header query failed', { company: c, error: e.message });
      continue;
    }
    byCompany[c].found = headers.length;
    if (!headers.length) continue;

    const existRes = await appP.request()
      .input('co', sql.NVarChar(10), c)
      .query(`SELECT [OrderNo] FROM [dbo].[DispatchOrder] WHERE [SourceType]='bc' AND [Company]=@co`);
    const existing = new Set(existRes.recordset.map((r) => r.OrderNo));

    const sl = bcTable(c, 'Sales Line');
    for (const h of headers) {
      if (existing.has(h.OrderNo)) { skipped++; continue; }
      try {
        const lines = await fetchBcOrderLines(bcPool, sl, h.OrderNo);
        await insertBcDispatchOrder(appP, c, h, lines);
        imported++; byCompany[c].imported++;
      } catch (e) {
        logger.warn('dispatch importFromBc: order import failed', { company: c, orderNo: h.OrderNo, error: e.message });
      }
    }
  }
  return { imported, skipped, byCompany, executeStatus: status };
}

/** Supervisor: assign a confirmed order to a packer. */
export async function assign(dispatchOrderId, { userId, name } = {}) {
  const pool = await appPool();
  const res = await pool.request()
    .input('doid',  sql.UniqueIdentifier, dispatchOrderId)
    .input('uid',   sql.NVarChar(100), str(userId, 100))
    .input('uname', sql.NVarChar(200), str(name, 200))
    .query(`
      UPDATE [dbo].[DispatchOrder]
      SET [AssignedToUserId]=@uid,[AssignedToName]=@uname,[AssignedAt]=GETUTCDATE(),
          [Status]='assigned',[UpdatedAt]=GETUTCDATE()
      WHERE [DispatchOrderId]=@doid AND [Status]='confirmed'
    `);
  return res.rowsAffected[0] || 0;
}
