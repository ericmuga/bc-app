/**
 * models/PosStockModel.js
 * Inventory ledger + stock requests + stock take.
 *
 * Every quantity change goes through PosStockMovement (signed quantity, scoped by ShopCode + ItemNo).
 *   sale          → quantity negative (auto-posted on payment confirmation)
 *   transfer-in   → quantity positive (posted when a stock request is completed)
 *   positive-adj  → quantity positive (from stock-take variance > 0)
 *   negative-adj  → quantity negative (from stock-take variance < 0)
 *
 * On-hand = SUM(quantity) for that shop + item.
 */
import { db as appDb, sql } from '../db/pool.js';
import logger from '../services/logger.js';

function str(v, max = 200) { return String(v ?? '').trim().slice(0, max); }
function num(v) { return isNaN(Number(v)) ? 0 : Number(v); }

async function appPool() { return appDb.getPool(); }

// ── Order numbering helpers ──────────────────────────────────────────────────

async function nextNo(pool, prefix, table, column) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fullPrefix = `${prefix}-${today}-`;
  const r = await pool.request().query(`
    SELECT TOP 1 [${column}] AS Val
    FROM [dbo].[${table}]
    WHERE [${column}] LIKE '${fullPrefix}%'
    ORDER BY [${column}] DESC
  `);
  if (!r.recordset.length) return `${fullPrefix}001`;
  const seq = parseInt(r.recordset[0].Val.slice(-3)) + 1;
  return `${fullPrefix}${String(seq).padStart(3, '0')}`;
}

// ── Movement ledger ──────────────────────────────────────────────────────────

/**
 * Resolve a shop's LocationCode (from PosShop). Returns null when the shop
 * has no location mapped — caller falls back to per-shop aggregation.
 */
async function locationForShop(pool, shopCode) {
  if (!shopCode) return null;
  const r = await pool.request()
    .input('code', sql.NVarChar(50), str(shopCode, 50).toUpperCase())
    .query(`SELECT [LocationCode] FROM [dbo].[PosShop] WHERE [Code]=@code`);
  return r.recordset[0]?.LocationCode?.trim() || null;
}

/**
 * On-hand quantity for an item at the SHOP'S LOCATION (not just the shop).
 * If two shops are tagged to the same LocationCode, they see the same balance.
 * Falls back to per-shop sum when the shop has no LocationCode mapped.
 */
async function onHandAtLocation(pool, shopCode, itemNo) {
  const loc = await locationForShop(pool, shopCode);
  if (loc) {
    const r = await pool.request()
      .input('loc',    sql.NVarChar(20), loc.toUpperCase())
      .input('itemNo', sql.NVarChar(30), str(itemNo, 30).toUpperCase())
      .query(`
        SELECT ISNULL(SUM(m.[Quantity]),0) AS Qty
        FROM   [dbo].[PosStockMovement] m
        JOIN   [dbo].[PosShop]          s ON s.[Code] = m.[ShopCode]
        WHERE  s.[LocationCode] = @loc AND m.[ItemNo] = @itemNo
      `);
    return Number(r.recordset[0].Qty || 0);
  }
  const r = await pool.request()
    .input('shopCode', sql.NVarChar(50), str(shopCode, 50).toUpperCase())
    .input('itemNo',   sql.NVarChar(30), str(itemNo, 30).toUpperCase())
    .query(`SELECT ISNULL(SUM([Quantity]),0) AS Qty FROM [dbo].[PosStockMovement]
            WHERE [ShopCode]=@shopCode AND [ItemNo]=@itemNo`);
  return Number(r.recordset[0].Qty || 0);
}

/**
 * Defensive guard: any movement that would push on-hand at the location below zero is blocked.
 */
async function assertNoNegativeStock(pool, { shopCode, itemNo, description, quantity }) {
  const q = num(quantity);
  if (q >= 0) return;   // increases / no-change always allowed
  if (!shopCode) {
    throw new Error(`Cannot decrement stock for ${itemNo}: no shopCode supplied (transactions must be tied to a shop / location).`);
  }
  const onHandQty = await onHandAtLocation(pool, shopCode, itemNo);
  const projected = onHandQty + q;   // q is negative
  if (projected < 0) {
    const need = Math.abs(q);
    throw new Error(
      `Insufficient stock for ${itemNo}${description ? ` (${description})` : ''}: ` +
      `have ${onHandQty} at this location, trying to remove ${need} (would leave ${projected.toFixed(4)}).`
    );
  }
}

export async function postMovement({ shopCode, itemNo, description, movementType, quantity,
                                     unitPrice = null, referenceType = null, referenceId = null,
                                     referenceNo = null, movementDate = null, notes = null,
                                     createdBy = null }) {
  const pool = await appPool();
  // Block any decrement that would take the on-hand position below zero.
  await assertNoNegativeStock(pool, { shopCode, itemNo, description, quantity });
  await pool.request()
    .input('shopCode',      sql.NVarChar(50),    str(shopCode, 50).toUpperCase())
    .input('itemNo',        sql.NVarChar(30),    str(itemNo, 30).toUpperCase())
    .input('description',   sql.NVarChar(200),   str(description) || null)
    .input('movementType',  sql.NVarChar(30),    str(movementType, 30))
    .input('quantity',      sql.Decimal(18, 4),  num(quantity))
    .input('unitPrice',     sql.Decimal(18, 4),  unitPrice == null ? null : num(unitPrice))
    .input('referenceType', sql.NVarChar(30),    referenceType ? str(referenceType, 30) : null)
    .input('referenceId',   sql.UniqueIdentifier, referenceId || null)
    .input('referenceNo',   sql.NVarChar(30),    referenceNo ? str(referenceNo, 30) : null)
    .input('movementDate',  sql.Date,            movementDate || new Date())
    .input('notes',         sql.NVarChar(500),   notes ? str(notes, 500) : null)
    .input('createdBy',     sql.NVarChar(100),   createdBy ? str(createdBy, 100) : null)
    .query(`
      INSERT INTO [dbo].[PosStockMovement]
        ([ShopCode],[ItemNo],[Description],[MovementType],[Quantity],[UnitPrice],
         [ReferenceType],[ReferenceId],[ReferenceNo],[MovementDate],[Notes],[CreatedBy])
      VALUES
        (@shopCode,@itemNo,@description,@movementType,@quantity,@unitPrice,
         @referenceType,@referenceId,@referenceNo,@movementDate,@notes,@createdBy)
    `);
}

/**
 * Auto-post sale movements for every line on a paid POS order.
 * Idempotent: skips if movements for this order already exist.
 */
export async function postSaleMovementsForOrder(order) {
  if (!order?.lines?.length) return;
  if (!order.shopCode) return;
  const pool = await appPool();
  const exists = await pool.request()
    .input('refType', sql.NVarChar(30),    'order')
    .input('refId',   sql.UniqueIdentifier, order.orderId)
    .query(`SELECT COUNT(*) AS n FROM [dbo].[PosStockMovement]
            WHERE [ReferenceType]=@refType AND [ReferenceId]=@refId`);
  if (exists.recordset[0].n > 0) return;

  for (const line of order.lines) {
    if (!line.itemNo || !Number(line.quantity)) continue;
    await postMovement({
      shopCode:      order.shopCode,
      itemNo:        line.itemNo,
      description:   line.description,
      movementType:  'sale',
      quantity:      -Math.abs(Number(line.quantity)),
      unitPrice:     line.unitPrice,
      referenceType: 'order',
      referenceId:   order.orderId,
      referenceNo:   order.orderNo,
      movementDate:  new Date(),
      createdBy:     order.cashierUserId || null,
    });
  }
  logger.info('posted sale movements', { orderNo: order.orderNo, lines: order.lines.length });
}

/**
 * Per-item on-hand for a shop (signed sum of all movements).
 */
/**
 * Batch on-hand lookup at the shop's LOCATION (not the shop alone).
 * Returns Map<itemNo, qty>. Items not in the map are 0.
 */
export async function onHandMany(shopCode, itemNos) {
  const out = new Map();
  if (!shopCode || !itemNos?.length) return out;
  const pool = await appPool();
  const cleaned = [...new Set(itemNos.map(n => String(n || '').toUpperCase()).filter(Boolean))];
  if (!cleaned.length) return out;

  const loc = await locationForShop(pool, shopCode);
  const r = pool.request();
  cleaned.forEach((no, i) => r.input(`i${i}`, sql.NVarChar(30), no));
  const inList = cleaned.map((_, i) => `@i${i}`).join(',');

  let q;
  if (loc) {
    r.input('loc', sql.NVarChar(20), loc.toUpperCase());
    q = `
      SELECT m.[ItemNo], SUM(m.[Quantity]) AS Qty
      FROM   [dbo].[PosStockMovement] m
      JOIN   [dbo].[PosShop]          s ON s.[Code] = m.[ShopCode]
      WHERE  s.[LocationCode] = @loc AND m.[ItemNo] IN (${inList})
      GROUP BY m.[ItemNo]
    `;
  } else {
    r.input('shopCode', sql.NVarChar(50), shopCode.toUpperCase());
    q = `
      SELECT [ItemNo], SUM([Quantity]) AS Qty
      FROM   [dbo].[PosStockMovement]
      WHERE  [ShopCode]=@shopCode AND [ItemNo] IN (${inList})
      GROUP BY [ItemNo]
    `;
  }
  const res = await r.query(q);
  for (const row of res.recordset) out.set(row.ItemNo, Number(row.Qty || 0));
  return out;
}

/**
 * Pre-flight check: throws a single human-readable error listing every line
 * that doesn't have enough stock at the shop's location. Hard-fails when no
 * shopCode is supplied (so an admin selling without a selected shop can't
 * sneak past the inventory guard).
 */
export async function assertOrderHasStock({ shopCode, lines }) {
  if (!lines?.length) return;
  if (!shopCode) {
    throw new Error('Order has no shop assigned — pick a shop / terminal so the inventory check can run.');
  }
  // Aggregate by item so duplicate lines don't double-count differently
  const need = new Map();
  for (const ln of lines) {
    if (!ln.itemNo) continue;
    const q = Math.abs(Number(ln.quantity || 0));
    if (q <= 0) throw new Error(`Line "${ln.description || ln.itemNo}" has no quantity — cannot sell zero or negative.`);
    need.set(ln.itemNo, (need.get(ln.itemNo) || 0) + q);
  }
  if (!need.size) return;
  const have = await onHandMany(shopCode, [...need.keys()]);
  const shortages = [];
  for (const [itemNo, requested] of need) {
    const onHandQty = have.get(itemNo) || 0;
    if (requested > onHandQty) {
      shortages.push({ itemNo, requested, onHand: onHandQty, short: requested - onHandQty });
    }
  }
  if (shortages.length) {
    const msg = shortages.map(s =>
      `${s.itemNo}: have ${s.onHand} at location, need ${s.requested} (short ${s.short.toFixed(4)})`
    ).join('; ');
    const err = new Error(`Insufficient stock — ${msg}`);
    err.shortages = shortages;
    throw err;
  }
}

export async function onHand(shopCode, itemNo) {
  const pool = await appPool();
  const r = await pool.request()
    .input('shopCode', sql.NVarChar(50), shopCode.toUpperCase())
    .input('itemNo',   sql.NVarChar(30), itemNo.toUpperCase())
    .query(`SELECT ISNULL(SUM([Quantity]),0) AS Qty
            FROM [dbo].[PosStockMovement]
            WHERE [ShopCode]=@shopCode AND [ItemNo]=@itemNo`);
  return Number(r.recordset[0].Qty || 0);
}

// ── Daily movements report ───────────────────────────────────────────────────
/**
 * For each (date, item) inside the period, return:
 *   opening, transferIn, positiveAdj, sales, negativeAdj, closing
 */
export async function dailyMovementsReport({ shopCode, dateFrom, dateTo, itemNo = null }) {
  const pool = await appPool();
  const req = pool.request()
    .input('shopCode', sql.NVarChar(50), shopCode.toUpperCase())
    .input('dateFrom', sql.Date, dateFrom)
    .input('dateTo',   sql.Date, dateTo);

  // Per-item per-day. When no item filter is supplied we list every item that
  // had at least one movement inside [dateFrom, dateTo].
  let itemFilter = '';
  if (itemNo) {
    req.input('itemNo', sql.NVarChar(30), itemNo.toUpperCase());
    itemFilter = 'AND m.[ItemNo]=@itemNo';
  }

  const r = await req.query(`
    -- Pre-period opening balance per item (only for items that transacted in the period)
    WITH PeriodItems AS (
      SELECT DISTINCT m.[ItemNo]
      FROM   [dbo].[PosStockMovement] m
      WHERE  m.[ShopCode]=@shopCode
        AND  m.[MovementDate] BETWEEN @dateFrom AND @dateTo
        ${itemFilter}
    ),
    Opening AS (
      SELECT m.[ItemNo], SUM(m.[Quantity]) AS OpeningQty
      FROM   [dbo].[PosStockMovement] m
      JOIN   PeriodItems p ON p.[ItemNo] = m.[ItemNo]
      WHERE  m.[ShopCode]=@shopCode
        AND  m.[MovementDate] < @dateFrom
      GROUP BY m.[ItemNo]
    ),
    Day AS (
      SELECT m.[ItemNo], m.[MovementDate],
             SUM(CASE WHEN m.[MovementType]='transfer-in'  THEN m.[Quantity] ELSE 0 END) AS TransferIn,
             SUM(CASE WHEN m.[MovementType]='positive-adj' THEN m.[Quantity] ELSE 0 END) AS PositiveAdj,
             SUM(CASE WHEN m.[MovementType]='sale'         THEN m.[Quantity] ELSE 0 END) AS Sales,
             SUM(CASE WHEN m.[MovementType]='negative-adj' THEN m.[Quantity] ELSE 0 END) AS NegativeAdj,
             SUM(m.[Quantity]) AS NetChange
      FROM   [dbo].[PosStockMovement] m
      JOIN   PeriodItems p ON p.[ItemNo] = m.[ItemNo]
      WHERE  m.[ShopCode]=@shopCode
        AND  m.[MovementDate] BETWEEN @dateFrom AND @dateTo
      GROUP BY m.[ItemNo], m.[MovementDate]
    )
    SELECT
      d.[ItemNo],
      pi.[Description] AS Description,
      d.[MovementDate] AS [Date],
      ISNULL(o.OpeningQty, 0)
        + ISNULL(SUM(d.NetChange) OVER (
            PARTITION BY d.[ItemNo]
            ORDER BY d.[MovementDate]
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ), 0) AS OpeningStock,
      d.TransferIn,
      d.PositiveAdj,
      d.Sales,
      d.NegativeAdj,
      ISNULL(o.OpeningQty, 0)
        + ISNULL(SUM(d.NetChange) OVER (
            PARTITION BY d.[ItemNo]
            ORDER BY d.[MovementDate]
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ), 0) AS ClosingStock
    FROM Day d
    LEFT JOIN Opening      o  ON o.[ItemNo]  = d.[ItemNo]
    LEFT JOIN [dbo].[PosItem] pi ON pi.[ItemNo] = d.[ItemNo]
    ORDER BY pi.[Description], d.[ItemNo], d.[MovementDate]
  `);
  return r.recordset.map(row => ({
    mode:         'item',
    itemNo:       row.ItemNo,
    description:  row.Description || '',
    date:         row.Date,
    opening:      Number(row.OpeningStock || 0),
    transferIn:   Number(row.TransferIn   || 0),
    positiveAdj:  Number(row.PositiveAdj  || 0),
    sales:        Math.abs(Number(row.Sales || 0)),       // shown as positive magnitude
    negativeAdj:  Math.abs(Number(row.NegativeAdj || 0)),
    closing:      Number(row.ClosingStock || 0),
  }));
}

// ── Stock requests ───────────────────────────────────────────────────────────

export async function listStockRequests({ shopCode = null, role = 'shop' } = {}) {
  const pool = await appPool();
  const req = pool.request();
  let where = '';
  if (role !== 'admin' && shopCode) {
    req.input('shopCode', sql.NVarChar(50), shopCode);
    where = 'WHERE [ShopCode]=@shopCode';
  }
  const r = await req.query(`
    SELECT h.[RequestId],h.[RequestNo],h.[ShopCode],h.[RequestedName],h.[Status],
           h.[Notes],h.[SubmittedAt],h.[ApprovedAt],h.[CompletedAt],
           h.[CreatedAt],h.[UpdatedAt],
           (SELECT COUNT(*) FROM [dbo].[PosStockRequestLine] l WHERE l.[RequestId]=h.[RequestId]) AS LineCount,
           (SELECT ISNULL(SUM(l.[QuantityRequested]),0) FROM [dbo].[PosStockRequestLine] l WHERE l.[RequestId]=h.[RequestId]) AS TotalRequested
    FROM [dbo].[PosStockRequest] h
    ${where}
    ORDER BY h.[CreatedAt] DESC
  `);
  return r.recordset;
}

export async function getStockRequest(requestId) {
  const pool = await appPool();
  const hdr = await pool.request()
    .input('requestId', sql.UniqueIdentifier, requestId)
    .query(`SELECT * FROM [dbo].[PosStockRequest] WHERE [RequestId]=@requestId`);
  if (!hdr.recordset.length) return null;
  const lns = await pool.request()
    .input('requestId', sql.UniqueIdentifier, requestId)
    .query(`SELECT * FROM [dbo].[PosStockRequestLine]
            WHERE [RequestId]=@requestId ORDER BY [SortOrder],[Description]`);
  const h = hdr.recordset[0];
  return {
    requestId:     h.RequestId,
    requestNo:     h.RequestNo,
    shopCode:      h.ShopCode,
    requestedBy:   h.RequestedBy,
    requestedName: h.RequestedName,
    status:        h.Status,
    notes:         h.Notes || '',
    submittedAt:   h.SubmittedAt,
    approvedAt:    h.ApprovedAt,
    completedAt:   h.CompletedAt,
    createdAt:     h.CreatedAt,
    updatedAt:     h.UpdatedAt,
    lines: lns.recordset.map(l => ({
      lineId:            l.LineId,
      requestNo:         l.RequestNo || h.RequestNo,   // header & line share the same DocNo
      itemNo:            l.ItemNo,
      description:       l.Description,
      quantityRequested: Number(l.QuantityRequested),
      quantityReceived:  l.QuantityReceived == null ? null : Number(l.QuantityReceived),
      unitOfMeasure:     l.UnitOfMeasure || '',
      comments:          l.Comments || '',
      sortOrder:         l.SortOrder,
    })),
  };
}

export async function createStockRequest({ shopCode, requestedBy, requestedName, notes }) {
  const pool = await appPool();
  const requestNo = await nextNo(pool, 'SR', 'PosStockRequest', 'RequestNo');
  const r = await pool.request()
    .input('requestNo',     sql.NVarChar(30),  requestNo)
    .input('shopCode',      sql.NVarChar(50),  str(shopCode, 50).toUpperCase())
    .input('requestedBy',   sql.NVarChar(100), str(requestedBy, 100))
    .input('requestedName', sql.NVarChar(200), str(requestedName))
    .input('notes',         sql.NVarChar(500), str(notes, 500) || null)
    .query(`
      INSERT INTO [dbo].[PosStockRequest]([RequestNo],[ShopCode],[RequestedBy],[RequestedName],[Status],[Notes])
      OUTPUT INSERTED.[RequestId], INSERTED.[RequestNo]
      VALUES(@requestNo,@shopCode,@requestedBy,@requestedName,'open',@notes)
    `);
  return r.recordset[0];
}

export async function setStockRequestLines(requestId, lines) {
  const pool = await appPool();
  const hdr = await pool.request()
    .input('requestId', sql.UniqueIdentifier, requestId)
    .query(`SELECT [RequestNo],[Status] FROM [dbo].[PosStockRequest] WHERE [RequestId]=@requestId`);
  if (!hdr.recordset.length) throw new Error('Request not found');
  if (!['open', 'submitted'].includes(hdr.recordset[0].Status))
    throw new Error(`Cannot edit lines on ${hdr.recordset[0].Status} request`);
  const requestNo = hdr.recordset[0].RequestNo;

  await pool.request()
    .input('requestId', sql.UniqueIdentifier, requestId)
    .query(`DELETE FROM [dbo].[PosStockRequestLine] WHERE [RequestId]=@requestId`);

  // Detect whether RequestNo column exists on the line table (the bootstrap adds it on startup).
  const hasReqNoCol = await pool.request().query(`
    SELECT COL_LENGTH('[dbo].[PosStockRequestLine]', 'RequestNo') AS L
  `);
  const includeReqNo = hasReqNoCol.recordset[0]?.L != null;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.itemNo) continue;
    const r2 = pool.request()
      .input(`rid${i}`, sql.UniqueIdentifier, requestId)
      .input(`rno${i}`, sql.NVarChar(30),    requestNo)
      .input(`ino${i}`, sql.NVarChar(30),    str(l.itemNo, 30).toUpperCase())
      .input(`dsc${i}`, sql.NVarChar(200),   str(l.description))
      .input(`qty${i}`, sql.Decimal(18, 4),  num(l.quantityRequested))
      .input(`uom${i}`, sql.NVarChar(20),    str(l.unitOfMeasure, 20) || null)
      .input(`srt${i}`, sql.Int,             i);
    if (includeReqNo) {
      await r2.query(`
        INSERT INTO [dbo].[PosStockRequestLine]
          ([RequestId],[RequestNo],[ItemNo],[Description],[QuantityRequested],[UnitOfMeasure],[SortOrder])
        VALUES(@rid${i},@rno${i},@ino${i},@dsc${i},@qty${i},@uom${i},@srt${i})
      `);
    } else {
      await r2.query(`
        INSERT INTO [dbo].[PosStockRequestLine]
          ([RequestId],[ItemNo],[Description],[QuantityRequested],[UnitOfMeasure],[SortOrder])
        VALUES(@rid${i},@ino${i},@dsc${i},@qty${i},@uom${i},@srt${i})
      `);
    }
  }
  await pool.request()
    .input('requestId', sql.UniqueIdentifier, requestId)
    .query(`UPDATE [dbo].[PosStockRequest] SET [UpdatedAt]=GETUTCDATE() WHERE [RequestId]=@requestId`);
}

export async function submitStockRequest(requestId) {
  const pool = await appPool();
  await pool.request()
    .input('requestId', sql.UniqueIdentifier, requestId)
    .query(`UPDATE [dbo].[PosStockRequest]
            SET [Status]='submitted',[SubmittedAt]=GETUTCDATE(),[UpdatedAt]=GETUTCDATE()
            WHERE [RequestId]=@requestId AND [Status]='open'`);
}

export async function approveStockRequest(requestId, approvedBy) {
  const pool = await appPool();
  await pool.request()
    .input('requestId',  sql.UniqueIdentifier, requestId)
    .input('approvedBy', sql.NVarChar(100),    approvedBy)
    .query(`UPDATE [dbo].[PosStockRequest]
            SET [Status]='approved',[ApprovedBy]=@approvedBy,[ApprovedAt]=GETUTCDATE(),[UpdatedAt]=GETUTCDATE()
            WHERE [RequestId]=@requestId AND [Status]='submitted'`);
}

export async function cancelStockRequest(requestId) {
  const pool = await appPool();
  const r = await pool.request()
    .input('requestId', sql.UniqueIdentifier, requestId)
    .query(`SELECT [Status] FROM [dbo].[PosStockRequest] WHERE [RequestId]=@requestId`);
  if (!r.recordset.length) throw new Error('Request not found');
  if (r.recordset[0].Status === 'completed') throw new Error('Cannot cancel a completed request');
  await pool.request()
    .input('requestId', sql.UniqueIdentifier, requestId)
    .query(`UPDATE [dbo].[PosStockRequest]
            SET [Status]='cancelled',[UpdatedAt]=GETUTCDATE()
            WHERE [RequestId]=@requestId`);
}

/**
 * Complete a stock request: posts a transfer-in movement for each line based on QuantityReceived.
 * Body: { lines: [{ lineId, quantityReceived }] }
 */
export async function completeStockRequest(requestId, receivedLines, completedBy) {
  const pool = await appPool();
  const order = await getStockRequest(requestId);
  if (!order) throw new Error('Request not found');
  if (order.status === 'completed') throw new Error('Already completed');
  if (order.status === 'cancelled') throw new Error('Cancelled requests cannot be completed');

  // Apply received quantities (default to requested if not specified)
  const qtyByLine = new Map();
  for (const r of (receivedLines || [])) qtyByLine.set(r.lineId, num(r.quantityReceived));

  // Per-line received comment (capture mismatches for the receiving cashier).
  const commentByLine = new Map();
  for (const r of (receivedLines || [])) {
    if (r.comments != null) commentByLine.set(r.lineId, String(r.comments).slice(0, 500));
  }

  for (const line of order.lines) {
    const qty = qtyByLine.has(line.lineId) ? qtyByLine.get(line.lineId) : line.quantityRequested;
    const requested = Number(line.quantityRequested || 0);
    const cmt = commentByLine.has(line.lineId)
      ? commentByLine.get(line.lineId)
      : (Number(qty) !== requested
          ? `Auto-flagged: requested ${requested}, received ${qty} (variance ${(Number(qty) - requested).toFixed(4)})`
          : null);
    await pool.request()
      .input('lineId',   sql.UniqueIdentifier, line.lineId)
      .input('qty',      sql.Decimal(18, 4),   qty)
      .input('comments', sql.NVarChar(500),    cmt || null)
      .query(`UPDATE [dbo].[PosStockRequestLine]
              SET [QuantityReceived]=@qty,
                  [Comments]=@comments,
                  [UpdatedAt]=GETUTCDATE()
              WHERE [LineId]=@lineId`);
    if (qty > 0) {
      await postMovement({
        shopCode:      order.shopCode,
        itemNo:        line.itemNo,
        description:   line.description,
        movementType:  'transfer-in',
        quantity:      qty,
        referenceType: 'request',
        referenceId:   order.requestId,
        referenceNo:   order.requestNo,
        movementDate:  new Date(),
        createdBy:     completedBy,
      });
    }
  }

  await pool.request()
    .input('requestId', sql.UniqueIdentifier, requestId)
    .query(`UPDATE [dbo].[PosStockRequest]
            SET [Status]='completed',[CompletedAt]=GETUTCDATE(),[UpdatedAt]=GETUTCDATE()
            WHERE [RequestId]=@requestId`);
}

// ── Stock take ───────────────────────────────────────────────────────────────

export async function listStockTakes({ shopCode = null, role = 'shop' } = {}) {
  const pool = await appPool();
  const req = pool.request();
  let where = '';
  if (role !== 'admin' && shopCode) {
    req.input('shopCode', sql.NVarChar(50), shopCode);
    where = 'WHERE [ShopCode]=@shopCode';
  }
  const r = await req.query(`
    SELECT h.[StockTakeId],h.[StockTakeNo],h.[ShopCode],h.[DateFrom],h.[DateTo],
           h.[Status],h.[CountedBy],h.[CompletedAt],h.[CreatedAt],
           (SELECT COUNT(*) FROM [dbo].[PosStockTakeLine] l WHERE l.[StockTakeId]=h.[StockTakeId]) AS LineCount
    FROM [dbo].[PosStockTake] h
    ${where}
    ORDER BY h.[CreatedAt] DESC
  `);
  return r.recordset;
}

export async function getStockTake(stockTakeId) {
  const pool = await appPool();
  const hdr = await pool.request()
    .input('stockTakeId', sql.UniqueIdentifier, stockTakeId)
    .query(`SELECT * FROM [dbo].[PosStockTake] WHERE [StockTakeId]=@stockTakeId`);
  if (!hdr.recordset.length) return null;
  const lns = await pool.request()
    .input('stockTakeId', sql.UniqueIdentifier, stockTakeId)
    .query(`SELECT * FROM [dbo].[PosStockTakeLine]
            WHERE [StockTakeId]=@stockTakeId ORDER BY [SortOrder],[Description]`);
  const h = hdr.recordset[0];
  return {
    stockTakeId:  h.StockTakeId,
    stockTakeNo:  h.StockTakeNo,
    shopCode:     h.ShopCode,
    dateFrom:     h.DateFrom,
    dateTo:       h.DateTo,
    status:       h.Status,
    countedBy:    h.CountedBy,
    completedAt:  h.CompletedAt,
    notes:        h.Notes || '',
    createdAt:    h.CreatedAt,
    lines: lns.recordset.map(l => ({
      lineId:        l.LineId,
      itemNo:        l.ItemNo,
      description:   l.Description,
      unitOfMeasure: l.UnitOfMeasure || '',
      openingStock:  Number(l.OpeningStock),
      increasesQty:  Number(l.IncreasesQty),
      decreasesQty:  Number(l.DecreasesQty),
      expectedStock: Number(l.ExpectedStock),
      physicalStock: l.PhysicalStock == null ? null : Number(l.PhysicalStock),
      variance:      l.Variance      == null ? null : Number(l.Variance),
      comments:      l.Comments || '',
      sortOrder:     l.SortOrder,
    })),
  };
}

/**
 * Create a stock take for a date range. Auto-populates lines for every item
 * the shop has had any movement on, with opening + period totals + expected stock.
 */
export async function createStockTake({ shopCode, dateFrom, dateTo, countedBy, notes }) {
  const pool = await appPool();
  const stockTakeNo = await nextNo(pool, 'ST', 'PosStockTake', 'StockTakeNo');
  const headerRes = await pool.request()
    .input('stockTakeNo', sql.NVarChar(30), stockTakeNo)
    .input('shopCode',    sql.NVarChar(50), str(shopCode, 50).toUpperCase())
    .input('dateFrom',    sql.Date,         dateFrom)
    .input('dateTo',      sql.Date,         dateTo)
    .input('countedBy',   sql.NVarChar(100),str(countedBy, 100) || null)
    .input('notes',       sql.NVarChar(500),str(notes, 500) || null)
    .query(`
      INSERT INTO [dbo].[PosStockTake]([StockTakeNo],[ShopCode],[DateFrom],[DateTo],[Status],[CountedBy],[Notes])
      OUTPUT INSERTED.[StockTakeId], INSERTED.[StockTakeNo]
      VALUES(@stockTakeNo,@shopCode,@dateFrom,@dateTo,'open',@countedBy,@notes)
    `);
  const stockTakeId = headerRes.recordset[0].StockTakeId;

  // Compute lines: opening = sum before dateFrom, increases/decreases = within range
  const linesQ = await pool.request()
    .input('shopCode', sql.NVarChar(50), str(shopCode, 50).toUpperCase())
    .input('dateFrom', sql.Date,         dateFrom)
    .input('dateTo',   sql.Date,         dateTo)
    .query(`
      WITH AllItems AS (
        SELECT DISTINCT [ItemNo]
        FROM [dbo].[PosStockMovement]
        WHERE [ShopCode]=@shopCode
      ),
      Opening AS (
        SELECT [ItemNo], ISNULL(SUM([Quantity]),0) AS Opening
        FROM [dbo].[PosStockMovement]
        WHERE [ShopCode]=@shopCode AND [MovementDate] < @dateFrom
        GROUP BY [ItemNo]
      ),
      InPeriod AS (
        SELECT [ItemNo],
               SUM(CASE WHEN [Quantity] > 0 THEN [Quantity] ELSE 0 END) AS Inc,
               SUM(CASE WHEN [Quantity] < 0 THEN ABS([Quantity]) ELSE 0 END) AS Dec
        FROM [dbo].[PosStockMovement]
        WHERE [ShopCode]=@shopCode AND [MovementDate] BETWEEN @dateFrom AND @dateTo
        GROUP BY [ItemNo]
      )
      SELECT a.[ItemNo],
             ISNULL(pi.[Description], a.[ItemNo]) AS Description,
             pi.[UnitOfMeasure] AS UnitOfMeasure,
             ISNULL(o.Opening, 0) AS Opening,
             ISNULL(p.Inc, 0)     AS Inc,
             ISNULL(p.Dec, 0)     AS Dec
      FROM AllItems a
      LEFT JOIN Opening  o  ON o.[ItemNo] = a.[ItemNo]
      LEFT JOIN InPeriod p  ON p.[ItemNo] = a.[ItemNo]
      LEFT JOIN [dbo].[PosItem] pi ON pi.[ItemNo] = a.[ItemNo]
      ORDER BY Description
    `);

  let order = 0;
  for (const row of linesQ.recordset) {
    const opening = Number(row.Opening);
    const inc     = Number(row.Inc);
    const dec     = Number(row.Dec);
    const expected = opening + inc - dec;
    await pool.request()
      .input('stockTakeId', sql.UniqueIdentifier, stockTakeId)
      .input('itemNo',      sql.NVarChar(30),     row.ItemNo)
      .input('description', sql.NVarChar(200),    row.Description)
      .input('uom',         sql.NVarChar(20),     row.UnitOfMeasure || null)
      .input('opening',     sql.Decimal(18, 4),   opening)
      .input('inc',         sql.Decimal(18, 4),   inc)
      .input('dec',         sql.Decimal(18, 4),   dec)
      .input('expected',    sql.Decimal(18, 4),   expected)
      .input('sortOrder',   sql.Int,              order++)
      .query(`
        INSERT INTO [dbo].[PosStockTakeLine]
          ([StockTakeId],[ItemNo],[Description],[UnitOfMeasure],[OpeningStock],[IncreasesQty],
           [DecreasesQty],[ExpectedStock],[SortOrder])
        VALUES(@stockTakeId,@itemNo,@description,@uom,@opening,@inc,@dec,@expected,@sortOrder)
      `);
  }
  return headerRes.recordset[0];
}

export async function updateStockTakeLine(lineId, { physicalStock, comments }) {
  const pool = await appPool();
  const cur = await pool.request()
    .input('lineId', sql.UniqueIdentifier, lineId)
    .query(`SELECT [ExpectedStock] FROM [dbo].[PosStockTakeLine] WHERE [LineId]=@lineId`);
  if (!cur.recordset.length) throw new Error('Line not found');
  const expected = Number(cur.recordset[0].ExpectedStock);
  const phys     = physicalStock == null ? null : num(physicalStock);
  const variance = phys == null ? null : (phys - expected);

  await pool.request()
    .input('lineId',   sql.UniqueIdentifier, lineId)
    .input('phys',     sql.Decimal(18, 4),  phys)
    .input('variance', sql.Decimal(18, 4),  variance)
    .input('comments', sql.NVarChar(500),   str(comments, 500) || null)
    .query(`
      UPDATE [dbo].[PosStockTakeLine]
      SET [PhysicalStock]=@phys,[Variance]=@variance,[Comments]=@comments,
          [UpdatedAt]=GETUTCDATE()
      WHERE [LineId]=@lineId
    `);
}

/**
 * Submit a stock take for approval. Counter signs off; an admin/shop-admin
 * later runs approveStockTake which posts the variance movements.
 */
export async function submitStockTake(stockTakeId, submittedBy) {
  const pool = await appPool();
  const take = await getStockTake(stockTakeId);
  if (!take) throw new Error('Stock take not found');
  if (take.status === 'completed')         throw new Error('Already completed');
  if (take.status === 'pending-approval')  throw new Error('Already submitted for approval');
  if (take.status !== 'open')              throw new Error(`Cannot submit a ${take.status} stock take`);
  await pool.request()
    .input('stockTakeId',  sql.UniqueIdentifier, stockTakeId)
    .input('submittedBy',  sql.NVarChar(200),    submittedBy || null)
    .query(`UPDATE [dbo].[PosStockTake]
            SET [Status]='pending-approval',
                [SubmittedAt]=GETUTCDATE(),
                [SubmittedBy]=@submittedBy,
                [UpdatedAt]=GETUTCDATE()
            WHERE [StockTakeId]=@stockTakeId`);
}

/**
 * Approve a submitted stock take. Posts an adjustment movement for every
 * non-zero variance, then flips the header to 'completed'. Idempotent.
 */
export async function approveStockTake(stockTakeId, approvedBy) {
  const pool = await appPool();
  const take = await getStockTake(stockTakeId);
  if (!take) throw new Error('Stock take not found');
  if (take.status === 'completed')   throw new Error('Already completed');
  if (take.status !== 'pending-approval') {
    throw new Error('Stock take must be submitted for approval before it can be approved.');
  }

  for (const line of take.lines) {
    if (line.physicalStock == null || !line.variance) continue;
    const isPositive = line.variance > 0;
    await postMovement({
      shopCode:      take.shopCode,
      itemNo:        line.itemNo,
      description:   line.description,
      movementType:  isPositive ? 'positive-adj' : 'negative-adj',
      quantity:      line.variance,
      referenceType: 'stocktake',
      referenceId:   take.stockTakeId,
      referenceNo:   take.stockTakeNo,
      movementDate:  new Date(),
      notes:         line.comments || null,
      createdBy:     approvedBy,
    });
  }
  await pool.request()
    .input('stockTakeId', sql.UniqueIdentifier, stockTakeId)
    .input('approvedBy',  sql.NVarChar(200), approvedBy || null)
    .query(`UPDATE [dbo].[PosStockTake]
            SET [Status]='completed',
                [CompletedAt]=GETUTCDATE(),
                [ApprovedAt]=GETUTCDATE(),
                [ApprovedBy]=@approvedBy,
                [UpdatedAt]=GETUTCDATE()
            WHERE [StockTakeId]=@stockTakeId`);
}

/**
 * Legacy single-step path (kept for backward-compat where approval isn't required).
 * Equivalent to submit + approve in one call.
 */
export async function completeStockTake(stockTakeId, completedBy) {
  const take = await getStockTake(stockTakeId);
  if (!take) throw new Error('Stock take not found');
  if (take.status === 'open') await submitStockTake(stockTakeId, completedBy);
  await approveStockTake(stockTakeId, completedBy);
}

/** BC Physical Inventory Journal CSV — exports a stock take's variance lines. */
export async function buildStockTakeBcJournal(stockTakeId, { documentNo = null, postingDate = null } = {}) {
  const take = await getStockTake(stockTakeId);
  if (!take) throw new Error('Stock take not found');
  // Resolve location for the shop (BC posts adjustments per location)
  const pool = await appPool();
  const locR = await pool.request()
    .input('code', sql.NVarChar(50), (take.shopCode || '').toUpperCase())
    .query(`SELECT [LocationCode] FROM [dbo].[PosShop] WHERE [Code]=@code`);
  const locationCode = locR.recordset[0]?.LocationCode?.trim() || take.shopCode || '';

  const docNo = documentNo || take.stockTakeNo;
  const dt    = postingDate || new Date().toISOString().slice(0, 10);

  // BC Physical Inventory Journal column names (importable via Edit in Excel /
  // Configuration Package). Adjust to your tenant's exact captions if needed.
  const headers = [
    'Journal Template Name','Journal Batch Name','Posting Date','Document No.',
    'Item No.','Location Code','Description','Phys. Inventory',
    'Qty. (Calculated)','Qty. (Phys. Inventory)','Unit of Measure Code','Comment',
  ];
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  let csv = '﻿' + headers.join(',') + '\r\n';     // UTF-8 BOM
  for (const line of take.lines) {
    if (line.physicalStock == null) continue;        // skip lines that weren't counted
    csv += [
      'ITEM',                              // Journal Template Name
      'PHYS-INV',                          // Journal Batch Name (rename if your tenant uses a different one)
      dt,
      docNo,
      line.itemNo,
      locationCode,
      line.description,
      'Yes',                               // Phys. Inventory flag
      Number(line.expectedStock || 0),     // Qty. (Calculated)
      Number(line.physicalStock  || 0),    // Qty. (Phys. Inventory)
      line.unitOfMeasure || '',
      line.comments || '',
    ].map(esc).join(',') + '\r\n';
  }
  return { csv, fileName: `phys-inv-journal-${take.stockTakeNo}.csv` };
}

/** BC Item Journal CSV — exports stock-request receive variances as adjustments. */
export async function buildStockRequestBcJournal(requestId, { documentNo = null, postingDate = null } = {}) {
  const order = await getStockRequest(requestId);
  if (!order) throw new Error('Request not found');
  const pool = await appPool();
  const locR = await pool.request()
    .input('code', sql.NVarChar(50), (order.shopCode || '').toUpperCase())
    .query(`SELECT [LocationCode] FROM [dbo].[PosShop] WHERE [Code]=@code`);
  const locationCode = locR.recordset[0]?.LocationCode?.trim() || order.shopCode || '';

  const docNo = documentNo || order.requestNo;
  const dt    = postingDate || new Date().toISOString().slice(0, 10);

  const headers = [
    'Journal Template Name','Journal Batch Name','Posting Date','Document No.',
    'Entry Type','Item No.','Location Code','Description',
    'Qty. Requested','Qty. Received','Variance','Unit of Measure Code','Comment',
  ];
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  let csv = '﻿' + headers.join(',') + '\r\n';
  for (const line of order.lines) {
    const requested = Number(line.quantityRequested || 0);
    const received  = line.quantityReceived == null ? requested : Number(line.quantityReceived);
    const variance  = received - requested;
    if (!variance) continue;                              // only export mismatches
    csv += [
      'ITEM',
      'ADJUSTMENT',
      dt,
      docNo,
      variance > 0 ? 'Positive Adjmt.' : 'Negative Adjmt.',
      line.itemNo,
      locationCode,
      line.description,
      requested,
      received,
      variance,
      line.unitOfMeasure || '',
      line.comments || '',
    ].map(esc).join(',') + '\r\n';
  }
  return { csv, fileName: `bc-adjustment-${order.requestNo}.csv` };
}

// ── Reports hub helpers (used by /pos/reports/*) ────────────────────────────

/**
 * Stock position: opening + per-entry-type movements + closing for a period.
 * Aggregates by item across all shops sharing the cashier's location, or
 * across the whole company when shopCode is not supplied (admin overview).
 */
export async function stockPositionReport({ shopCode = null, dateFrom, dateTo, itemNo = null } = {}) {
  if (!dateFrom || !dateTo) throw new Error('dateFrom, dateTo required');
  const pool = await appPool();

  // Resolve location scope (same logic as the on-hand check)
  let loc = null;
  if (shopCode) {
    const r = await pool.request()
      .input('code', sql.NVarChar(50), shopCode.toUpperCase())
      .query(`SELECT [LocationCode] FROM [dbo].[PosShop] WHERE [Code]=@code`);
    loc = r.recordset[0]?.LocationCode?.trim() || null;
  }
  const req = pool.request()
    .input('df', sql.Date, dateFrom)
    .input('dt', sql.Date, dateTo);
  let scope = '';
  if (loc) {
    req.input('loc', sql.NVarChar(20), loc.toUpperCase());
    scope = `JOIN [dbo].[PosShop] s ON s.[Code] = m.[ShopCode] AND s.[LocationCode] = @loc`;
  } else if (shopCode) {
    req.input('shop', sql.NVarChar(50), shopCode.toUpperCase());
    scope = '';
  }
  const shopFilter = (loc ? '' : (shopCode ? 'AND m.[ShopCode]=@shop' : ''));
  let itemFilter = '';
  if (itemNo) {
    req.input('item', sql.NVarChar(30), itemNo.toUpperCase());
    itemFilter = 'AND m.[ItemNo]=@item';
  }

  const r = await req.query(`
    WITH Opening AS (
      SELECT m.[ItemNo], SUM(m.[Quantity]) AS Qty
      FROM   [dbo].[PosStockMovement] m ${scope}
      WHERE  m.[MovementDate] < @df ${shopFilter} ${itemFilter}
      GROUP BY m.[ItemNo]
    ),
    Period AS (
      SELECT m.[ItemNo],
             SUM(CASE WHEN m.[MovementType]='transfer-in'    THEN m.[Quantity] ELSE 0 END) AS TransferIn,
             SUM(CASE WHEN m.[MovementType]='third-party-in' THEN m.[Quantity] ELSE 0 END) AS ThirdPartyIn,
             SUM(CASE WHEN m.[MovementType]='positive-adj'   THEN m.[Quantity] ELSE 0 END) AS PositiveAdj,
             SUM(CASE WHEN m.[MovementType]='portion-in'     THEN m.[Quantity] ELSE 0 END) AS PortionIn,
             SUM(CASE WHEN m.[MovementType]='sale'           THEN m.[Quantity] ELSE 0 END) AS Sales,
             SUM(CASE WHEN m.[MovementType]='write-off'      THEN m.[Quantity] ELSE 0 END) AS WriteOff,
             SUM(CASE WHEN m.[MovementType]='portion-out'    THEN m.[Quantity] ELSE 0 END) AS PortionOut,
             SUM(CASE WHEN m.[MovementType]='negative-adj'   THEN m.[Quantity] ELSE 0 END) AS NegativeAdj,
             SUM(m.[Quantity]) AS NetChange
      FROM   [dbo].[PosStockMovement] m ${scope}
      WHERE  m.[MovementDate] BETWEEN @df AND @dt ${shopFilter} ${itemFilter}
      GROUP BY m.[ItemNo]
    ),
    AllItems AS (
      SELECT [ItemNo] FROM Opening UNION SELECT [ItemNo] FROM Period
    )
    SELECT a.[ItemNo],
           pi.[Description] AS Description,
           ISNULL(o.Qty, 0)               AS Opening,
           ISNULL(p.TransferIn, 0)        AS TransferIn,
           ISNULL(p.ThirdPartyIn, 0)      AS ThirdPartyIn,
           ISNULL(p.PositiveAdj, 0)       AS PositiveAdj,
           ISNULL(p.PortionIn, 0)         AS PortionIn,
           ISNULL(ABS(p.Sales), 0)        AS Sales,
           ISNULL(ABS(p.WriteOff), 0)     AS WriteOff,
           ISNULL(ABS(p.PortionOut), 0)   AS PortionOut,
           ISNULL(ABS(p.NegativeAdj), 0)  AS NegativeAdj,
           ISNULL(o.Qty, 0) + ISNULL(p.NetChange, 0) AS Closing
    FROM   AllItems a
    LEFT JOIN Opening      o  ON o.[ItemNo]  = a.[ItemNo]
    LEFT JOIN Period       p  ON p.[ItemNo]  = a.[ItemNo]
    LEFT JOIN [dbo].[PosItem] pi ON pi.[ItemNo] = a.[ItemNo]
    ORDER BY pi.[Description], a.[ItemNo]
  `);
  return r.recordset.map(row => ({
    itemNo:       row.ItemNo,
    description:  row.Description || '',
    opening:      Number(row.Opening || 0),
    transferIn:   Number(row.TransferIn   || 0) + Number(row.ThirdPartyIn || 0),
    positiveAdj:  Number(row.PositiveAdj  || 0),
    portionIn:    Number(row.PortionIn    || 0),
    sales:        Number(row.Sales        || 0),
    writeOff:     Number(row.WriteOff     || 0),
    portionOut:   Number(row.PortionOut   || 0),
    negativeAdj:  Number(row.NegativeAdj  || 0),
    closing:      Number(row.Closing      || 0),
  }));
}

/**
 * Sales by item — POS-paid lines + manual sales unioned, grouped by item.
 * Filters: shopCode, dateFrom, dateTo. When shopCode is null, returns all-shops.
 */
export async function salesByItemReport({ shopCode = null, dateFrom, dateTo } = {}) {
  if (!dateFrom || !dateTo) throw new Error('dateFrom, dateTo required');
  const pool = await appPool();
  const req = pool.request().input('df', sql.Date, dateFrom).input('dt', sql.Date, dateTo);
  const shopFilter1 = shopCode ? 'AND o.[ShopCode]=@shop' : '';
  const shopFilter2 = shopCode ? 'AND ms.[ShopCode]=@shop' : '';
  if (shopCode) req.input('shop', sql.NVarChar(50), shopCode.toUpperCase());

  const r = await req.query(`
    WITH Combined AS (
      SELECT ol.[ItemNo], ol.[Description] AS Description,
             SUM(ol.[Quantity]) AS Qty, SUM(ol.[LineAmount]) AS Value
      FROM   [dbo].[PosOrderLine] ol
      JOIN   [dbo].[PosOrder]    o  ON o.[OrderId] = ol.[OrderId]
      WHERE  o.[Status] = 'paid'
        AND  CAST(o.[CreatedAt] AS DATE) BETWEEN @df AND @dt
        ${shopFilter1}
      GROUP BY ol.[ItemNo], ol.[Description]
      UNION ALL
      SELECT ms.[ItemNo], ms.[Description],
             SUM(ms.[Quantity]) AS Qty, SUM(ms.[TotalAmount]) AS Value
      FROM   [dbo].[PosManualSale] ms
      WHERE  ms.[SaleDate] BETWEEN @df AND @dt
        ${shopFilter2}
      GROUP BY ms.[ItemNo], ms.[Description]
    )
    SELECT [ItemNo], MAX([Description]) AS Description,
           SUM([Qty]) AS Qty, SUM([Value]) AS Value
    FROM   Combined
    GROUP BY [ItemNo]
    ORDER BY SUM([Value]) DESC
  `);
  return r.recordset.map(x => ({
    itemNo: x.ItemNo, description: x.Description || '',
    qty: Number(x.Qty || 0), value: Number(x.Value || 0),
  }));
}

/** Sales by contact — POS-paid orders only (manual sales have no contact). */
export async function salesByContactReport({ shopCode = null, dateFrom, dateTo } = {}) {
  if (!dateFrom || !dateTo) throw new Error('dateFrom, dateTo required');
  const pool = await appPool();
  const req = pool.request().input('df', sql.Date, dateFrom).input('dt', sql.Date, dateTo);
  if (shopCode) req.input('shop', sql.NVarChar(50), shopCode.toUpperCase());
  const shopFilter = shopCode ? 'AND o.[ShopCode]=@shop' : '';
  const r = await req.query(`
    SELECT COALESCE(o.[ContactNo],   '(walk-in)') AS ContactNo,
           COALESCE(o.[ContactName], '(walk-in)') AS ContactName,
           COUNT(DISTINCT o.[OrderId]) AS Orders,
           SUM(o.[TotalAmount])        AS Value
    FROM   [dbo].[PosOrder] o
    WHERE  o.[Status] = 'paid'
      AND  CAST(o.[CreatedAt] AS DATE) BETWEEN @df AND @dt
      ${shopFilter}
    GROUP BY COALESCE(o.[ContactNo],'(walk-in)'), COALESCE(o.[ContactName],'(walk-in)')
    ORDER BY SUM(o.[TotalAmount]) DESC
  `);
  return r.recordset.map(x => ({
    contactNo:   x.ContactNo, contactName: x.ContactName,
    orders:      Number(x.Orders || 0),
    value:       Number(x.Value  || 0),
  }));
}

/** Per-shop totals — admin's overview report. */
export async function shopComparisonReport({ dateFrom, dateTo } = {}) {
  if (!dateFrom || !dateTo) throw new Error('dateFrom, dateTo required');
  const pool = await appPool();
  const r = await pool.request()
    .input('df', sql.Date, dateFrom)
    .input('dt', sql.Date, dateTo)
    .query(`
      WITH PosSales AS (
        SELECT o.[ShopCode] AS ShopCode,
               COUNT(DISTINCT o.[OrderId]) AS Orders,
               SUM(o.[TotalAmount]) AS Value
        FROM [dbo].[PosOrder] o
        WHERE o.[Status]='paid' AND CAST(o.[CreatedAt] AS DATE) BETWEEN @df AND @dt
        GROUP BY o.[ShopCode]
      ),
      ManualSales AS (
        SELECT ms.[ShopCode], COUNT(*) AS Orders, SUM(ms.[TotalAmount]) AS Value
        FROM [dbo].[PosManualSale] ms
        WHERE ms.[SaleDate] BETWEEN @df AND @dt
        GROUP BY ms.[ShopCode]
      ),
      AllShops AS (
        SELECT [Code] AS ShopCode, [Name] FROM [dbo].[PosShop] WHERE [IsActive]=1
      )
      SELECT s.ShopCode, s.Name AS ShopName,
             ISNULL(p.Orders, 0) + ISNULL(m.Orders, 0) AS Orders,
             ISNULL(p.Value, 0)  + ISNULL(m.Value, 0)  AS Value
      FROM   AllShops s
      LEFT JOIN PosSales    p ON p.ShopCode = s.ShopCode
      LEFT JOIN ManualSales m ON m.ShopCode = s.ShopCode
      ORDER BY ISNULL(p.Value, 0) + ISNULL(m.Value, 0) DESC
    `);
  return r.recordset.map(x => ({
    shopCode:  x.ShopCode, shopName: x.ShopName,
    orders:    Number(x.Orders || 0),
    value:     Number(x.Value  || 0),
  }));
}

// ── Per-item transactions in a date range (drill-down for stock take page) ──
export async function listItemTransactions({ shopCode, itemNo, dateFrom, dateTo }) {
  const pool = await appPool();
  const r = await pool.request()
    .input('shopCode', sql.NVarChar(50), shopCode.toUpperCase())
    .input('itemNo',   sql.NVarChar(30), itemNo.toUpperCase())
    .input('dateFrom', sql.Date,         dateFrom)
    .input('dateTo',   sql.Date,         dateTo)
    .query(`
      SELECT [MovementDate],[MovementType],[Quantity],[ReferenceType],[ReferenceNo],[Notes],[CreatedBy]
      FROM [dbo].[PosStockMovement]
      WHERE [ShopCode]=@shopCode AND [ItemNo]=@itemNo
        AND [MovementDate] BETWEEN @dateFrom AND @dateTo
      ORDER BY [MovementDate],[CreatedAt]
    `);
  return r.recordset.map(row => ({
    date:          row.MovementDate,
    type:          row.MovementType,
    quantity:      Number(row.Quantity),
    referenceType: row.ReferenceType,
    referenceNo:   row.ReferenceNo,
    notes:         row.Notes || '',
    createdBy:     row.CreatedBy,
  }));
}
