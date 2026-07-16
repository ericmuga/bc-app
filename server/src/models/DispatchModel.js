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
import QRCode from 'qrcode';
import { db as appDb, sql } from '../db/pool.js';
import { bcDb, bcSql } from '../db/bcPool.js';
import { bcTable, extCol, ALL_COMPANIES } from '../services/bcTables.js';
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

// Build a `[Company] IN (@c0,@c1,...)` clause + bind the params. Empty list =
// no rows (a restricted user with no companies sees nothing).
function companyFilter(request, companies) {
  if (!Array.isArray(companies)) return ''; // undefined = no restriction
  if (!companies.length) return 'AND 1=0';
  companies.forEach((c, i) => request.input(`c${i}`, sql.NVarChar(10), c));
  return `AND o.[Company] IN (${companies.map((_, i) => `@c${i}`).join(', ')})`;
}

/** Registry worklist: orders not yet fully confirmed, optionally scoped to companies. */
export async function listForConfirmation({ companies } = {}) {
  const pool = await appPool();
  const r = pool.request();
  const filter = companyFilter(r, companies);
  const res = await r.query(`
    SELECT o.[DispatchOrderId],o.[DispatchNo],o.[Company],o.[OrderNo],o.[CustomerName],o.[CustomerNo],
           o.[ShopCode],o.[Status],o.[TotalAmount],o.[CreatedAt],
           SUM(CASE WHEN p.[Confirmed]=1 AND p.[Active]=1 THEN 1 ELSE 0 END) AS ConfirmedParts,
           SUM(CASE WHEN p.[Active]=1 THEN 1 ELSE 0 END) AS TotalParts
    FROM [dbo].[DispatchOrder] o
    LEFT JOIN [dbo].[DispatchOrderPart] p ON p.[DispatchOrderId]=o.[DispatchOrderId]
    WHERE o.[Confirmed]=0 AND o.[Status]='pending' ${filter}
    GROUP BY o.[DispatchOrderId],o.[DispatchNo],o.[Company],o.[OrderNo],o.[CustomerName],o.[CustomerNo],
             o.[ShopCode],o.[Status],o.[TotalAmount],o.[CreatedAt]
    ORDER BY o.[CreatedAt] DESC
  `);
  return res.recordset;
}

/** Downloadable report: who confirmed each part, optionally scoped to companies. */
export async function listConfirmationReport({ companies } = {}) {
  const pool = await appPool();
  const r = pool.request();
  const filter = companyFilter(r, companies);
  const res = await r.query(`
    SELECT o.[Company], o.[DispatchNo], o.[OrderNo], o.[CustomerName],
           p.[Part], p.[ConfirmedByUserId], p.[ConfirmedByName], p.[ConfirmedAt]
    FROM [dbo].[DispatchOrderPart] p
    JOIN [dbo].[DispatchOrder] o ON o.[DispatchOrderId]=p.[DispatchOrderId]
    WHERE p.[Confirmed]=1 ${filter}
    ORDER BY p.[ConfirmedAt] DESC
  `);
  return res.recordset;
}

// ── Per-user, per-company registry permissions ──────────────────────────────
/** Companies a user is explicitly permitted for (empty array = unrestricted). */
export async function listUserCompanies(userId) {
  const pool = await appPool();
  const r = await pool.request()
    .input('uid', sql.NVarChar(100), String(userId || ''))
    .query(`SELECT [Company] FROM [dbo].[DispatchUserCompany] WHERE [UserId]=@uid ORDER BY [Company]`);
  return r.recordset.map((x) => x.Company);
}

/** Replace a user's permitted companies. */
export async function setUserCompanies(userId, companies) {
  const pool = await appPool();
  const list = [...new Set((Array.isArray(companies) ? companies : []).map((c) => String(c || '').trim()).filter(Boolean))];
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).input('uid', sql.NVarChar(100), String(userId))
      .query(`DELETE FROM [dbo].[DispatchUserCompany] WHERE [UserId]=@uid`);
    for (const c of list) {
      await new sql.Request(tx)
        .input('uid', sql.NVarChar(100), String(userId)).input('co', sql.NVarChar(10), c)
        .query(`INSERT INTO [dbo].[DispatchUserCompany] ([UserId],[Company]) VALUES (@uid,@co)`);
    }
    await tx.commit();
  } catch (e) { try { await tx.rollback(); } catch { /* noop */ } throw e; }
  return list;
}

/**
 * Effective companies for a registry request: the intersection of the user's
 * permitted set (empty = all) with an optional requested filter. Returns
 * undefined when the user is unrestricted AND no filter was requested (= all rows).
 */
export async function resolveRegistryCompanies(userId, requested) {
  const allowed = await listUserCompanies(userId);
  const req = Array.isArray(requested) ? requested.filter(Boolean) : null;
  if (!allowed.length) return (req && req.length) ? req : undefined; // unrestricted
  if (!req || !req.length) return allowed;
  return allowed.filter((c) => req.includes(c));
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
/**
 * Registry: confirm one part (once only). Flips the order to 'confirmed' when
 * every part is done. Throws ALREADY_CONFIRMED / NOT_FOUND if it can't confirm.
 */
export async function confirmPart(dispatchOrderId, part, user = {}) {
  const pool = await appPool();
  const P = String(part || '').toUpperCase();
  const res = await pool.request()
    .input('doid',  sql.UniqueIdentifier, dispatchOrderId)
    .input('part',  sql.Char(1), P)
    .input('uid',   sql.NVarChar(100), str(user.userId, 100))
    .input('uname', sql.NVarChar(200), str(user.userName, 200))
    .query(`
      UPDATE [dbo].[DispatchOrderPart]
      SET [Confirmed]=1,[ConfirmedByUserId]=@uid,[ConfirmedByName]=@uname,
          [ConfirmedAt]=GETUTCDATE(),[UpdatedAt]=GETUTCDATE()
      WHERE [DispatchOrderId]=@doid AND [Part]=@part AND [Confirmed]=0 AND [Active]=1
    `);
  if (!res.rowsAffected[0]) {
    // Nothing updated → part is missing or already confirmed (confirm-once).
    const cur = await pool.request()
      .input('doid', sql.UniqueIdentifier, dispatchOrderId).input('part', sql.Char(1), P)
      .query(`SELECT [Active],[Confirmed],[ConfirmedByName],[ConfirmedAt] FROM [dbo].[DispatchOrderPart]
              WHERE [DispatchOrderId]=@doid AND [Part]=@part`);
    const row = cur.recordset[0];
    if (!row) { const e = new Error(`Part ${P} not found on this order`); e.code = 'NOT_FOUND'; throw e; }
    if (!row.Active) { const e = new Error(`Part ${P} is inactive (no items) on this order`); e.code = 'INACTIVE'; throw e; }
    const e = new Error(`Part ${P} was already confirmed by ${row.ConfirmedByName || 'another user'}`);
    e.code = 'ALREADY_CONFIRMED'; throw e;
  }
  const chk = await pool.request()
    .input('doid', sql.UniqueIdentifier, dispatchOrderId)
    .query(`SELECT SUM(CASE WHEN [Confirmed]=1 AND [Active]=1 THEN 1 ELSE 0 END) AS c,
                   SUM(CASE WHEN [Active]=1 THEN 1 ELSE 0 END) AS t
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

// Each Sales Line's dispatch Part (A/B/C/D) lives on the coreExt table's
// [Part No_] field; join it in so lines can be tagged and empty parts deactivated.
async function fetchBcOrderLines(bcPool, slTable, slExtTable, orderNo) {
  const partCol = extCol('Part No_');
  const r = await bcPool.request()
    .input('no', bcSql.NVarChar(20), orderNo)
    .query(`
      SELECT l.[Line No_] AS [LineNo], l.[No_] AS ItemNo, l.[Description] AS Descr,
             l.[Quantity] AS Qty, l.[Unit of Measure Code] AS Uom, e.${partCol} AS PartNo
      FROM ${slTable} l
      LEFT JOIN ${slExtTable} e
        ON e.[Document Type]=l.[Document Type] AND e.[Document No_]=l.[Document No_] AND e.[Line No_]=l.[Line No_]
      WHERE l.[Document No_]=@no AND l.[Type]=2 AND l.[Quantity] <> 0
      ORDER BY l.[Line No_]
    `);
  return r.recordset;
}

const partOf = (v) => { const s = String(v || '').trim().toUpperCase(); return PARTS.includes(s) ? s : null; };

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
    const present = new Set();
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const uom = str(ln.Uom, 20);
      const part = partOf(ln.PartNo);
      if (part) present.add(part);
      await new sql.Request(tx)
        .input('doid',     sql.UniqueIdentifier, id)
        .input('itemNo',   sql.NVarChar(30),  str(ln.ItemNo, 30))
        .input('desc',     sql.NVarChar(250), str(ln.Descr, 250))
        .input('qty',      sql.Decimal(18, 4), num(ln.Qty))
        .input('uom',      sql.NVarChar(20),  uom)
        .input('weighted', sql.Bit, isWeightUom(uom) ? 1 : 0)
        .input('part',     sql.Char(1), part)
        .input('sort',     sql.Int, Number(ln.LineNo) || i)
        .query(`
          INSERT INTO [dbo].[DispatchOrderLine]
            ([DispatchOrderId],[ItemNo],[Description],[OrderQty],[Uom],[IsWeighted],[Part],[SortOrder])
          VALUES (@doid,@itemNo,@desc,@qty,@uom,@weighted,@part,@sort)
        `);
    }
    // A part is Active only if the order actually has line(s) of it.
    for (const part of PARTS) {
      await new sql.Request(tx)
        .input('doid', sql.UniqueIdentifier, id).input('part', sql.Char(1), part)
        .input('active', sql.Bit, present.has(part) ? 1 : 0)
        .query(`INSERT INTO [dbo].[DispatchOrderPart] ([DispatchOrderId],[Part],[Active]) VALUES (@doid,@part,@active)`);
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
    const slExt = bcTable(c, 'Sales Line', { coreExt: true });
    for (const h of headers) {
      if (existing.has(h.OrderNo)) { skipped++; continue; }
      try {
        const lines = await fetchBcOrderLines(bcPool, sl, slExt, h.OrderNo);
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

// ── Assembly (packer / assembler) ────────────────────────────────────────────
/** BC Return Reasons (for qty-mismatch capture). */
export async function listReturnReasons(company = 'FCL') {
  const bcPool = await bcDb.getPool();
  const r = await bcPool.request().query(
    `SELECT [Code] AS code, [Description] AS description FROM ${bcTable(company, 'Return Reason')} ORDER BY [Code]`
  );
  return r.recordset.map((x) => ({ code: String(x.code || '').trim(), description: String(x.description || '').trim() }));
}

/**
 * Assembly worklist. If userId is given, only that assembler's orders; if null
 * (elevated viewer with no selection) all assigned/assembling orders.
 */
export async function listForAssembly(userId) {
  const pool = await appPool();
  const r = pool.request();
  let filter = '';
  if (userId) { r.input('uid', sql.NVarChar(100), String(userId)); filter = 'AND o.[AssignedToUserId]=@uid'; }
  const res = await r.query(`
    SELECT o.[DispatchOrderId],o.[DispatchNo],o.[Company],o.[OrderNo],o.[CustomerName],
           o.[Status],o.[AssignedToUserId],o.[AssignedToName],o.[AssignedAt],
           (SELECT COUNT(*) FROM [dbo].[DispatchOrderLine] l WHERE l.[DispatchOrderId]=o.[DispatchOrderId]) AS LineCount,
           SUM(CASE WHEN p.[Assembled]=1 AND p.[Active]=1 THEN 1 ELSE 0 END) AS AssembledParts,
           SUM(CASE WHEN p.[Active]=1 THEN 1 ELSE 0 END) AS ActiveParts
    FROM [dbo].[DispatchOrder] o
    LEFT JOIN [dbo].[DispatchOrderPart] p ON p.[DispatchOrderId]=o.[DispatchOrderId]
    WHERE o.[Status] IN ('assigned','assembling') ${filter}
    GROUP BY o.[DispatchOrderId],o.[DispatchNo],o.[Company],o.[OrderNo],o.[CustomerName],
             o.[Status],o.[AssignedToUserId],o.[AssignedToName],o.[AssignedAt]
    ORDER BY o.[AssignedAt] DESC
  `);
  return res.recordset;
}

/** Assembly detail: header + lines (with assembled qty/weight/reason) + parts. */
export async function getAssemblyOrder(dispatchOrderId) {
  const pool = await appPool();
  const hdr = await pool.request().input('id', sql.UniqueIdentifier, dispatchOrderId)
    .query(`SELECT * FROM [dbo].[DispatchOrder] WHERE [DispatchOrderId]=@id`);
  if (!hdr.recordset.length) return null;
  const lines = await pool.request().input('id', sql.UniqueIdentifier, dispatchOrderId).query(`
    SELECT l.*, a.[AssembledQty], a.[AssembledWeight], a.[ReturnReasonCode], a.[ReturnReasonName],
           a.[AssembledByName]
    FROM [dbo].[DispatchOrderLine] l
    LEFT JOIN [dbo].[DispatchAssemblyLine] a ON a.[LineId]=l.[LineId]
    WHERE l.[DispatchOrderId]=@id ORDER BY l.[Part], l.[SortOrder]
  `);
  const parts = await pool.request().input('id', sql.UniqueIdentifier, dispatchOrderId)
    .query(`SELECT * FROM [dbo].[DispatchOrderPart] WHERE [DispatchOrderId]=@id ORDER BY [Part]`);
  return { ...hdr.recordset[0], lines: lines.recordset, parts: parts.recordset };
}

/** Upsert a line's assembled qty/weight/return-reason. Moves order to 'assembling'. */
export async function saveAssemblyLine(lineId, dispatchOrderId, body = {}, user = {}) {
  const pool = await appPool();
  const qty = num(body.assembledQty);
  const weight = num(body.assembledWeight);
  const rc = str(body.returnReasonCode, 20);
  const rn = str(body.returnReasonName, 200);
  const exists = await pool.request().input('lid', sql.UniqueIdentifier, lineId)
    .query(`SELECT TOP 1 [AssemblyLineId] FROM [dbo].[DispatchAssemblyLine] WHERE [LineId]=@lid`);
  const r = pool.request()
    .input('lid',   sql.UniqueIdentifier, lineId)
    .input('doid',  sql.UniqueIdentifier, dispatchOrderId)
    .input('qty',   sql.Decimal(18, 4), qty)
    .input('wt',    sql.Decimal(18, 4), weight)
    .input('rc',    sql.NVarChar(20), rc)
    .input('rn',    sql.NVarChar(200), rn)
    .input('uid',   sql.NVarChar(100), str(user.userId, 100))
    .input('uname', sql.NVarChar(200), str(user.userName, 200));
  if (exists.recordset.length) {
    await r.query(`
      UPDATE [dbo].[DispatchAssemblyLine]
      SET [AssembledQty]=@qty,[AssembledWeight]=@wt,[ReturnReasonCode]=@rc,[ReturnReasonName]=@rn,
          [AssembledByUserId]=@uid,[AssembledByName]=@uname,[AssembledAt]=GETUTCDATE()
      WHERE [LineId]=@lid`);
  } else {
    await r.query(`
      INSERT INTO [dbo].[DispatchAssemblyLine]
        ([DispatchOrderId],[LineId],[AssembledQty],[AssembledWeight],[ReturnReasonCode],[ReturnReasonName],[AssembledByUserId],[AssembledByName])
      VALUES (@doid,@lid,@qty,@wt,@rc,@rn,@uid,@uname)`);
  }
  await pool.request().input('doid', sql.UniqueIdentifier, dispatchOrderId)
    .query(`UPDATE [dbo].[DispatchOrder] SET [Status]='assembling',[UpdatedAt]=GETUTCDATE()
            WHERE [DispatchOrderId]=@doid AND [Status]='assigned'`);
  return { ok: true };
}

/** Mark a part assembled; flips the order to 'assembled' when all active parts are done. */
export async function markPartAssembled(dispatchOrderId, part, user = {}) {
  const pool = await appPool();
  const P = String(part || '').toUpperCase();
  const res = await pool.request()
    .input('doid', sql.UniqueIdentifier, dispatchOrderId).input('part', sql.Char(1), P)
    .input('uid', sql.NVarChar(100), str(user.userId, 100)).input('uname', sql.NVarChar(200), str(user.userName, 200))
    .query(`
      UPDATE [dbo].[DispatchOrderPart]
      SET [Assembled]=1,[AssembledByUserId]=@uid,[AssembledByName]=@uname,[AssembledAt]=GETUTCDATE(),[UpdatedAt]=GETUTCDATE()
      WHERE [DispatchOrderId]=@doid AND [Part]=@part AND [Active]=1 AND [Assembled]=0`);
  if (!res.rowsAffected[0]) { const e = new Error(`Part ${P} can't be marked assembled (inactive or already done)`); e.code = 'INVALID'; throw e; }
  const chk = await pool.request().input('doid', sql.UniqueIdentifier, dispatchOrderId)
    .query(`SELECT SUM(CASE WHEN [Assembled]=1 AND [Active]=1 THEN 1 ELSE 0 END) c, SUM(CASE WHEN [Active]=1 THEN 1 ELSE 0 END) t
            FROM [dbo].[DispatchOrderPart] WHERE [DispatchOrderId]=@doid`);
  const c = Number(chk.recordset[0]?.c || 0), t = Number(chk.recordset[0]?.t || 0);
  if (t > 0 && c >= t) {
    await pool.request().input('doid', sql.UniqueIdentifier, dispatchOrderId)
      .query(`UPDATE [dbo].[DispatchOrder] SET [Assembled]=1,[Status]='assembled',[UpdatedAt]=GETUTCDATE() WHERE [DispatchOrderId]=@doid`);
  }
  return { assembledParts: c, activeParts: t, fullyAssembled: t > 0 && c >= t };
}

// ── Packing / boxing (packer + checker) ──────────────────────────────────────
const DEFAULT_VESSELS = [
  { code: 'CRATE',    description: 'Standard crate', tare: 1.5 },
  { code: 'CARTON-S', description: 'Small carton',   tare: 0.3 },
  { code: 'CARTON-M', description: 'Medium carton',  tare: 0.5 },
  { code: 'CARTON-L', description: 'Large carton',   tare: 0.8 },
];

/** Carton/vessel sizes (seeds defaults on first call). */
export async function listVesselTypes() {
  const pool = await appPool();
  const n = (await pool.request().query(`SELECT COUNT(*) n FROM [dbo].[DispatchVesselType]`)).recordset[0].n;
  if (!n) {
    for (const v of DEFAULT_VESSELS) {
      await pool.request()
        .input('c', sql.NVarChar(30), v.code).input('d', sql.NVarChar(200), v.description).input('t', sql.Decimal(18, 4), v.tare)
        .query(`IF NOT EXISTS (SELECT 1 FROM [dbo].[DispatchVesselType] WHERE [Code]=@c)
                INSERT INTO [dbo].[DispatchVesselType]([Code],[Description],[TareWeight]) VALUES (@c,@d,@t)`);
    }
  }
  return (await pool.request().query(
    `SELECT [VesselTypeId],[Code],[Description],[TareWeight] FROM [dbo].[DispatchVesselType] WHERE [Blocked]=0 ORDER BY [Code]`
  )).recordset;
}

/** Packing worklist: assembled orders ready to box (optionally scoped to a packer). */
export async function listForPacking(userId) {
  const pool = await appPool();
  const r = pool.request();
  let filter = '';
  if (userId) { r.input('uid', sql.NVarChar(100), String(userId)); filter = 'AND o.[AssignedToUserId]=@uid'; }
  return (await r.query(`
    SELECT o.[DispatchOrderId],o.[DispatchNo],o.[Company],o.[OrderNo],o.[CustomerName],o.[Status],o.[AssignedToName],
           (SELECT COUNT(*) FROM [dbo].[DispatchBox] b WHERE b.[DispatchOrderId]=o.[DispatchOrderId]) AS BoxCount
    FROM [dbo].[DispatchOrder] o
    WHERE o.[Status] IN ('assembled','packing') ${filter}
    ORDER BY o.[UpdatedAt] DESC
  `)).recordset;
}

/** Get (or create) the open packing session for an order; sets/updates the checker. */
export async function startOrGetPackingSession(dispatchOrderId, packer = {}, checker = {}) {
  const pool = await appPool();
  const open = await pool.request().input('doid', sql.UniqueIdentifier, dispatchOrderId)
    .query(`SELECT TOP 1 * FROM [dbo].[DispatchPackingSession] WHERE [DispatchOrderId]=@doid AND [Status]='open' ORDER BY [CreatedAt] DESC`);
  if (open.recordset.length) {
    if (checker.userId) {
      await pool.request().input('sid', sql.UniqueIdentifier, open.recordset[0].SessionId)
        .input('cid', sql.NVarChar(100), str(checker.userId, 100)).input('cn', sql.NVarChar(200), str(checker.name, 200))
        .query(`UPDATE [dbo].[DispatchPackingSession] SET [CheckerUserId]=@cid,[CheckerName]=@cn,[UpdatedAt]=GETUTCDATE() WHERE [SessionId]=@sid`);
    }
    return open.recordset[0].SessionId;
  }
  const no = await nextNo(pool, 'PSN', 'DispatchPackingSession', 'SessionNo');
  const res = await pool.request()
    .input('no', sql.NVarChar(30), no).input('doid', sql.UniqueIdentifier, dispatchOrderId)
    .input('pid', sql.NVarChar(100), str(packer.userId, 100)).input('pn', sql.NVarChar(200), str(packer.name, 200))
    .input('cid', sql.NVarChar(100), str(checker.userId, 100)).input('cn', sql.NVarChar(200), str(checker.name, 200))
    .query(`INSERT INTO [dbo].[DispatchPackingSession]([SessionNo],[DispatchOrderId],[PackerUserId],[PackerName],[CheckerUserId],[CheckerName])
            OUTPUT INSERTED.[SessionId] VALUES (@no,@doid,@pid,@pn,@cid,@cn)`);
  await pool.request().input('doid', sql.UniqueIdentifier, dispatchOrderId)
    .query(`UPDATE [dbo].[DispatchOrder] SET [Status]='packing',[UpdatedAt]=GETUTCDATE() WHERE [DispatchOrderId]=@doid AND [Status]='assembled'`);
  return res.recordset[0].SessionId;
}

/** Packing detail: order + lines (assembled + packed qty) + open session + boxes. */
export async function getPackingOrder(dispatchOrderId) {
  const pool = await appPool();
  const hdr = await pool.request().input('id', sql.UniqueIdentifier, dispatchOrderId)
    .query(`SELECT * FROM [dbo].[DispatchOrder] WHERE [DispatchOrderId]=@id`);
  if (!hdr.recordset.length) return null;
  const lines = await pool.request().input('id', sql.UniqueIdentifier, dispatchOrderId).query(`
    SELECT l.[LineId],l.[ItemNo],l.[Barcode],l.[Description],l.[OrderQty],l.[Uom],l.[IsWeighted],l.[Part],
           a.[AssembledQty],
           (SELECT ISNULL(SUM(bl.[Qty]),0) FROM [dbo].[DispatchBoxLine] bl
             JOIN [dbo].[DispatchBox] b ON b.[BoxId]=bl.[BoxId]
             WHERE b.[DispatchOrderId]=@id AND bl.[ItemNo]=l.[ItemNo]) AS PackedQty
    FROM [dbo].[DispatchOrderLine] l
    LEFT JOIN [dbo].[DispatchAssemblyLine] a ON a.[LineId]=l.[LineId]
    WHERE l.[DispatchOrderId]=@id ORDER BY l.[Part], l.[SortOrder]
  `);
  const session = await pool.request().input('id', sql.UniqueIdentifier, dispatchOrderId)
    .query(`SELECT TOP 1 * FROM [dbo].[DispatchPackingSession] WHERE [DispatchOrderId]=@id AND [Status]='open' ORDER BY [CreatedAt] DESC`);
  const boxes = await pool.request().input('id', sql.UniqueIdentifier, dispatchOrderId).query(`
    SELECT b.*, (SELECT COUNT(*) FROM [dbo].[DispatchBoxLine] bl WHERE bl.[BoxId]=b.[BoxId]) AS LineCount
    FROM [dbo].[DispatchBox] b WHERE b.[DispatchOrderId]=@id ORDER BY b.[CreatedAt]`);
  return { ...hdr.recordset[0], lines: lines.recordset, session: session.recordset[0] || null, boxes: boxes.recordset };
}

export async function openBox(sessionId, dispatchOrderId, { vesselTypeId, vesselCode } = {}) {
  const pool = await appPool();
  const boxNo = await nextNo(pool, 'BOX', 'DispatchBox', 'BoxNo');
  const token = genQrToken();
  const res = await pool.request()
    .input('no', sql.NVarChar(40), boxNo).input('qr', sql.NVarChar(64), token)
    .input('sid', sql.UniqueIdentifier, sessionId || null).input('doid', sql.UniqueIdentifier, dispatchOrderId)
    .input('vtid', sql.UniqueIdentifier, vesselTypeId || null).input('vc', sql.NVarChar(30), str(vesselCode, 30))
    .query(`INSERT INTO [dbo].[DispatchBox]([BoxNo],[QrToken],[SessionId],[DispatchOrderId],[VesselTypeId],[VesselCode])
            OUTPUT INSERTED.[BoxId] VALUES (@no,@qr,@sid,@doid,@vtid,@vc)`);
  return { boxId: res.recordset[0].BoxId, boxNo, qrToken: token };
}

export async function addBoxLine(boxId, { itemNo, description, qty, weight } = {}) {
  const pool = await appPool();
  await pool.request()
    .input('bid', sql.UniqueIdentifier, boxId).input('itm', sql.NVarChar(30), str(itemNo, 30))
    .input('desc', sql.NVarChar(250), str(description, 250)).input('q', sql.Decimal(18, 4), num(qty)).input('w', sql.Decimal(18, 4), num(weight))
    .query(`INSERT INTO [dbo].[DispatchBoxLine]([BoxId],[ItemNo],[Description],[Qty],[Weight]) VALUES (@bid,@itm,@desc,@q,@w)`);
  return { ok: true };
}

export async function removeBoxLine(boxLineId) {
  const pool = await appPool();
  const r = await pool.request().input('id', sql.UniqueIdentifier, boxLineId).query(`DELETE FROM [dbo].[DispatchBoxLine] WHERE [BoxLineId]=@id`);
  return { deleted: r.rowsAffected[0] || 0 };
}

export async function getBox(boxId) {
  const pool = await appPool();
  const b = await pool.request().input('id', sql.UniqueIdentifier, boxId).query(`SELECT * FROM [dbo].[DispatchBox] WHERE [BoxId]=@id`);
  if (!b.recordset.length) return null;
  const lines = await pool.request().input('id', sql.UniqueIdentifier, boxId).query(`SELECT * FROM [dbo].[DispatchBoxLine] WHERE [BoxId]=@id ORDER BY [CreatedAt]`);
  return { ...b.recordset[0], lines: lines.recordset };
}

/** Checker confirms + closes a box; generates its QR (encodes the unique QrToken). */
export async function closeBox(boxId, { checkerUserId, checkerName, grossWeight } = {}, user = {}) {
  const pool = await appPool();
  const res = await pool.request()
    .input('id', sql.UniqueIdentifier, boxId)
    .input('cid', sql.NVarChar(100), str(checkerUserId, 100)).input('cn', sql.NVarChar(200), str(checkerName, 200))
    .input('gw', sql.Decimal(18, 4), num(grossWeight))
    .input('uid', sql.NVarChar(100), str(user.userId, 100)).input('un', sql.NVarChar(200), str(user.userName, 200))
    .query(`UPDATE [dbo].[DispatchBox]
            SET [Status]='closed',[CheckedByUserId]=@cid,[CheckedByName]=@cn,[CheckedAt]=GETUTCDATE(),
                [GrossWeight]=@gw,[ClosedByUserId]=@uid,[ClosedByName]=@un,[ClosedAt]=GETUTCDATE(),[UpdatedAt]=GETUTCDATE()
            WHERE [BoxId]=@id AND [Status]='open'`);
  if (!res.rowsAffected[0]) { const e = new Error('Box is not open'); e.code = 'INVALID'; throw e; }
  const box = await getBox(boxId);
  const qrImage = await QRCode.toDataURL(box.QrToken, { margin: 1, width: 240 });
  return { box, qrImage };
}

/** Resolve a scanned QR to its box + item list (unique reference). */
export async function getBoxByQr(qrToken) {
  const pool = await appPool();
  const b = await pool.request().input('qr', sql.NVarChar(64), String(qrToken)).query(`
    SELECT b.*, o.[DispatchNo], o.[OrderNo], o.[CustomerName], o.[Company]
    FROM [dbo].[DispatchBox] b JOIN [dbo].[DispatchOrder] o ON o.[DispatchOrderId]=b.[DispatchOrderId]
    WHERE b.[QrToken]=@qr`);
  if (!b.recordset.length) return null;
  const lines = await pool.request().input('id', sql.UniqueIdentifier, b.recordset[0].BoxId)
    .query(`SELECT [ItemNo],[Description],[Qty],[Weight] FROM [dbo].[DispatchBoxLine] WHERE [BoxId]=@id`);
  return { ...b.recordset[0], lines: lines.recordset };
}

/** Finish packing: close session, mark parts + order packed. (BC fireback = TODO.) */
export async function completePacking(dispatchOrderId) {
  const pool = await appPool();
  await pool.request().input('doid', sql.UniqueIdentifier, dispatchOrderId)
    .query(`UPDATE [dbo].[DispatchPackingSession] SET [Status]='closed',[UpdatedAt]=GETUTCDATE() WHERE [DispatchOrderId]=@doid AND [Status]='open'`);
  await pool.request().input('doid', sql.UniqueIdentifier, dispatchOrderId)
    .query(`UPDATE [dbo].[DispatchOrderPart] SET [Packed]=1,[PackedAt]=GETUTCDATE() WHERE [DispatchOrderId]=@doid AND [Active]=1`);
  const r = await pool.request().input('doid', sql.UniqueIdentifier, dispatchOrderId)
    .query(`UPDATE [dbo].[DispatchOrder] SET [Packed]=1,[Status]='packed',[UpdatedAt]=GETUTCDATE()
            WHERE [DispatchOrderId]=@doid AND [Status] IN ('assembled','packing')`);
  return { packed: r.rowsAffected[0] || 0 };
}
