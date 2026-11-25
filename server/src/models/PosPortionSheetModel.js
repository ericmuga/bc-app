/**
 * models/PosPortionSheetModel.js
 * Portioning: source picker (received stock-request lines), the stock sheet,
 * sheet upload, and the filterable portioning / yield report.
 *
 * Stock sheet = one per shop + "as at" date covering [PeriodFrom, AsAtDate].
 * Per item, book figures come from the movement ledger (stockPositionReport):
 *   Opening   on hand before PeriodFrom
 *   In        everything else that moved stock in the period (portion-in,
 *             transfer-in, adjustments, portion-out …) EXCEPT sales/write-offs
 *   Recorded  sales / write-offs already in the ledger (POS terminal etc.)
 * The user enters total Sales, Write-off and the final Count; then
 *   Expected  = Opening + In − Sales − Write-off
 *   Variance  = Expected − Count   (positive = unaccounted loss)
 * Posting writes the sales/write-offs not yet in the ledger and an adjustment
 * that brings on-hand to the count, all dated AsAtDate (ReferenceType
 * 'stock-sheet').
 */
import { db as appDb, sql } from '../db/pool.js';
import { postMovement, stockPositionReport, onHandMany } from './PosStockModel.js';

function str(v, max = 200) { return String(v ?? '').trim().slice(0, max); }
function num(v) { return isNaN(Number(v)) ? 0 : Number(v); }
function round4(v) { return Math.round(Number(v || 0) * 10000) / 10000; }
function isoDay(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
async function appPool() { return appDb.getPool(); }

async function nextNo(pool, prefix, table, column) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fullPrefix = `${prefix}-${today}-`;
  const r = await pool.request().query(`
    SELECT TOP 1 [${column}] AS Val FROM [dbo].[${table}]
    WHERE [${column}] LIKE '${fullPrefix}%' ORDER BY [${column}] DESC
  `);
  if (!r.recordset.length) return `${fullPrefix}001`;
  const seq = parseInt(r.recordset[0].Val.slice(-3)) + 1;
  return `${fullPrefix}${String(seq).padStart(3, '0')}`;
}

async function itemMaster(pool, itemNos) {
  const out = new Map();
  const clean = [...new Set(itemNos.map((n) => String(n || '').toUpperCase()).filter(Boolean))];
  if (!clean.length) return out;
  const r = pool.request();
  clean.forEach((no, i) => r.input(`i${i}`, sql.NVarChar(30), no));
  const q = await r.query(`
    SELECT [ItemNo],[Description],[UnitOfMeasure],ISNULL([UnitPrice],0) AS UnitPrice
    FROM [dbo].[PosItem] WHERE [ItemNo] IN (${clean.map((_, i) => `@i${i}`).join(',')})
  `);
  for (const x of q.recordset) out.set(String(x.ItemNo).toUpperCase(), x);
  return out;
}

// ── Portioning sources: received stock-request lines (+ legacy transfers) ────

export async function portioningSources(shopCode) {
  const pool = await appPool();
  const req = pool.request().input('shop', sql.NVarChar(50), str(shopCode, 50).toUpperCase());
  const r = await req.query(`
    SELECT l.[LineId], h.[RequestNo], h.[CompletedAt], l.[ItemNo], l.[Description],
           l.[QuantityReceived] AS Qty, l.[UnitOfMeasure],
           ISNULL(NULLIF(pi.[UnitCost], 0), ISNULL(pi.[UnitPrice], 0)) AS UnitCost,
           ISNULL((SELECT SUM(p.[SourceQuantity]) FROM [dbo].[PosPortioning] p
                   WHERE p.[SourceRequestLineId] = l.[LineId]), 0) AS UsedQty
    FROM [dbo].[PosStockRequestLine] l
    JOIN [dbo].[PosStockRequest] h ON h.[RequestId] = l.[RequestId]
    LEFT JOIN [dbo].[PosItem] pi ON pi.[ItemNo] = l.[ItemNo]
    WHERE h.[ShopCode] = @shop AND h.[Status] = 'completed' AND ISNULL(l.[QuantityReceived], 0) > 0
    ORDER BY h.[CompletedAt] DESC
  `);
  const out = r.recordset.map((x) => {
    const qty = Number(x.Qty || 0), used = Number(x.UsedQty || 0);
    return {
      kind: 'request', id: x.LineId, docNo: x.RequestNo, receivedAt: x.CompletedAt,
      itemNo: x.ItemNo, description: x.Description, uom: x.UnitOfMeasure || 'KG',
      quantity: qty, usedQty: round4(used), remainingQty: round4(Math.max(qty - used, 0)),
      unitCost: Number(x.UnitCost || 0),
    };
  });
  // Legacy third-party transfers still portion-able until they are used up.
  const t = await pool.request().input('shop', sql.NVarChar(50), str(shopCode, 50).toUpperCase()).query(`
    SELECT l.[LineId], t.[TransferNo], t.[PostedAt], l.[ItemNo], l.[Description], l.[Quantity], l.[UnitOfMeasure], l.[UnitCost],
           ISNULL((SELECT SUM(p.[SourceQuantity]) FROM [dbo].[PosPortioning] p
                   WHERE p.[SourceTransferLineId] = l.[LineId]), 0) AS UsedQty
    FROM [dbo].[PosThirdPartyTransferLine] l
    JOIN [dbo].[PosThirdPartyTransfer] t ON t.[TransferId] = l.[TransferId]
    WHERE t.[Status] = 'posted' AND t.[DestinationShopCode] = @shop
  `);
  for (const x of t.recordset) {
    const qty = Number(x.Quantity || 0), used = Number(x.UsedQty || 0);
    if (qty - used <= 0) continue;
    out.push({
      kind: 'transfer', id: x.LineId, docNo: x.TransferNo, receivedAt: x.PostedAt,
      itemNo: x.ItemNo, description: x.Description, uom: x.UnitOfMeasure || 'KG',
      quantity: qty, usedQty: round4(used), remainingQty: round4(qty - used),
      unitCost: Number(x.UnitCost || 0),
    });
  }
  return out;
}

// ── Stock sheet ──────────────────────────────────────────────────────────────

export async function listSheets({ shopCode = null, dateFrom = null, dateTo = null } = {}) {
  const pool = await appPool();
  const req = pool.request();
  const where = ['1=1'];
  if (shopCode) { req.input('shop', sql.NVarChar(50), shopCode); where.push('s.[ShopCode]=@shop'); }
  if (dateFrom) { req.input('df', sql.Date, dateFrom); where.push('s.[AsAtDate] >= @df'); }
  if (dateTo)   { req.input('dt', sql.Date, dateTo);   where.push('s.[AsAtDate] <= @dt'); }
  const r = await req.query(`
    SELECT s.*,
      (SELECT COUNT(*) FROM [dbo].[PosPortionSheetLine] l WHERE l.[SheetId]=s.[SheetId]) AS LineCount,
      (SELECT ISNULL(SUM(l.[SalesQty]),0)      FROM [dbo].[PosPortionSheetLine] l WHERE l.[SheetId]=s.[SheetId]) AS SalesQty,
      (SELECT ISNULL(SUM(l.[WriteOffQty]),0)   FROM [dbo].[PosPortionSheetLine] l WHERE l.[SheetId]=s.[SheetId]) AS WriteOffQty,
      (SELECT ISNULL(SUM(l.[VarianceQty]),0)   FROM [dbo].[PosPortionSheetLine] l WHERE l.[SheetId]=s.[SheetId]) AS VarianceQty,
      (SELECT ISNULL(SUM(l.[VarianceValue]),0) FROM [dbo].[PosPortionSheetLine] l WHERE l.[SheetId]=s.[SheetId]) AS VarianceValue
    FROM [dbo].[PosPortionSheet] s
    WHERE ${where.join(' AND ')}
    ORDER BY s.[AsAtDate] DESC, s.[CreatedAt] DESC
  `);
  return r.recordset;
}

function mapLine(l) {
  return {
    lineId: l.LineId, itemNo: l.ItemNo, description: l.Description, unitOfMeasure: l.UnitOfMeasure || '',
    openingQty: Number(l.OpeningQty), inQty: Number(l.InQty),
    recordedSalesQty: Number(l.RecordedSalesQty), recordedWriteOffQty: Number(l.RecordedWriteOffQty),
    salesQty: Number(l.SalesQty), writeOffQty: Number(l.WriteOffQty),
    countQty: l.CountQty == null ? null : Number(l.CountQty),
    expectedQty: Number(l.ExpectedQty), varianceQty: Number(l.VarianceQty),
    unitPrice: Number(l.UnitPrice), varianceValue: Number(l.VarianceValue),
    comment: l.Comment || '', sortOrder: l.SortOrder,
  };
}

export async function getSheet(sheetId) {
  const pool = await appPool();
  const h = await pool.request().input('id', sql.UniqueIdentifier, sheetId)
    .query(`SELECT * FROM [dbo].[PosPortionSheet] WHERE [SheetId]=@id`);
  if (!h.recordset.length) return null;
  const l = await pool.request().input('id', sql.UniqueIdentifier, sheetId)
    .query(`SELECT * FROM [dbo].[PosPortionSheetLine] WHERE [SheetId]=@id ORDER BY [SortOrder],[Description]`);
  const s = h.recordset[0];
  return {
    sheetId: s.SheetId, sheetNo: s.SheetNo, shopCode: s.ShopCode,
    periodFrom: isoDay(s.PeriodFrom), asAtDate: isoDay(s.AsAtDate),
    status: s.Status, source: s.Source, notes: s.Notes || '',
    createdBy: s.CreatedBy, createdAt: s.CreatedAt, postedBy: s.PostedBy, postedAt: s.PostedAt,
    lines: l.recordset.map(mapLine),
  };
}

/** Book figures per item for a shop and period, from the movement ledger. */
async function bookFigures(shopCode, periodFrom, asAtDate) {
  const rows = await stockPositionReport({ shopCode, dateFrom: periodFrom, dateTo: asAtDate });
  const out = new Map();
  for (const r of rows) {
    const opening = Number(r.opening || 0);
    const sales = Number(r.sales || 0), wo = Number(r.writeOff || 0);
    out.set(String(r.itemNo).toUpperCase(), {
      description: r.description,
      openingQty: round4(opening),
      // Every other movement in the period: closing = opening + in − sales − write-offs
      inQty: round4(Number(r.closing || 0) - opening + sales + wo),
      recordedSalesQty: round4(sales),
      recordedWriteOffQty: round4(wo),
    });
  }
  return out;
}

async function defaultPeriodFrom(pool, shopCode, asAtDate, excludeSheetId = null) {
  const req = pool.request()
    .input('shop', sql.NVarChar(50), shopCode)
    .input('asAt', sql.Date, asAtDate);
  let ex = '';
  if (excludeSheetId) { req.input('ex', sql.UniqueIdentifier, excludeSheetId); ex = 'AND [SheetId]<>@ex'; }
  const r = await req.query(`
    SELECT MAX([AsAtDate]) AS Last FROM [dbo].[PosPortionSheet]
    WHERE [ShopCode]=@shop AND [Status]='posted' AND [AsAtDate] < @asAt ${ex}
  `);
  const last = r.recordset[0]?.Last;
  if (last) return addDays(isoDay(last), 1);
  return `${asAtDate.slice(0, 8)}01`;
}

/** Items that have ever been produced by portioning at this shop. */
async function portionedItems(pool, shopCode) {
  const r = await pool.request().input('shop', sql.NVarChar(50), shopCode).query(`
    SELECT DISTINCT UPPER(l.[ItemNo]) AS ItemNo
    FROM [dbo].[PosPortioningLine] l JOIN [dbo].[PosPortioning] p ON p.[PortioningId]=l.[PortioningId]
    WHERE p.[ShopCode]=@shop
  `);
  return new Set(r.recordset.map((x) => x.ItemNo));
}

export async function createSheet({ shopCode, asAtDate, periodFrom = null, notes = null, scope = 'portioned', source = 'manual', createdBy = null }) {
  if (!shopCode) throw new Error('shopCode required');
  const asAt = isoDay(asAtDate || new Date());
  const pool = await appPool();
  const shop = str(shopCode, 50).toUpperCase();
  const dup = await pool.request().input('shop', sql.NVarChar(50), shop).input('asAt', sql.Date, asAt).query(`
    SELECT TOP 1 [SheetNo],[Status] FROM [dbo].[PosPortionSheet] WHERE [ShopCode]=@shop AND [AsAtDate]=@asAt AND [Status]<>'cancelled'
  `);
  if (dup.recordset.length) throw new Error(`Stock sheet ${dup.recordset[0].SheetNo} (${dup.recordset[0].Status}) already exists for ${shop} as at ${asAt}`);
  const from = isoDay(periodFrom) || await defaultPeriodFrom(pool, shop, asAt);
  if (from > asAt) throw new Error(`Period start ${from} is after the as-at date ${asAt}`);

  const sheetNo = await nextNo(pool, 'PSS', 'PosPortionSheet', 'SheetNo');
  const r = await pool.request()
    .input('no', sql.NVarChar(30), sheetNo)
    .input('shop', sql.NVarChar(50), shop)
    .input('from', sql.Date, from)
    .input('asAt', sql.Date, asAt)
    .input('src', sql.NVarChar(20), source)
    .input('notes', sql.NVarChar(500), str(notes, 500) || null)
    .input('by', sql.NVarChar(100), createdBy ? str(createdBy, 100) : null)
    .query(`
      INSERT INTO [dbo].[PosPortionSheet]([SheetNo],[ShopCode],[PeriodFrom],[AsAtDate],[Source],[Notes],[CreatedBy])
      OUTPUT INSERTED.[SheetId], INSERTED.[SheetNo]
      VALUES(@no,@shop,@from,@asAt,@src,@notes,@by)
    `);
  const { SheetId } = r.recordset[0];

  // Pre-fill: portioned items (or every item) with any stock or movement in the period.
  if (scope !== 'none') {
    const book = await bookFigures(shop, from, asAt);
    const portioned = scope === 'all' ? null : await portionedItems(pool, shop);
    const lines = [];
    for (const [itemNo, b] of book) {
      if (portioned && !portioned.has(itemNo)) continue;
      if (!b.openingQty && !b.inQty && !b.recordedSalesQty && !b.recordedWriteOffQty) continue;
      lines.push({ itemNo, salesQty: b.recordedSalesQty, writeOffQty: b.recordedWriteOffQty, countQty: null });
    }
    await saveSheetLines(SheetId, lines);
  }
  return r.recordset[0];
}

/**
 * Replace a draft sheet's lines. Client sends itemNo + the entered figures;
 * book figures (opening / in / recorded) and the variance are recomputed here.
 */
export async function saveSheetLines(sheetId, lines, { periodFrom = null, notes } = {}) {
  const pool = await appPool();
  const sheet = await getSheet(sheetId);
  if (!sheet) throw new Error('Stock sheet not found');
  if (sheet.status !== 'draft') throw new Error(`Cannot edit a ${sheet.status} stock sheet`);

  let from = sheet.periodFrom;
  if (periodFrom && isoDay(periodFrom) !== from) {
    from = isoDay(periodFrom);
    if (from > sheet.asAtDate) throw new Error(`Period start ${from} is after the as-at date ${sheet.asAtDate}`);
  }

  const byItem = new Map();
  for (const l of lines || []) {
    const itemNo = str(l.itemNo, 30).toUpperCase();
    if (!itemNo) continue;
    byItem.set(itemNo, l);   // last one wins on duplicates
  }
  const items = [...byItem.keys()];
  const book = await bookFigures(sheet.shopCode, from, sheet.asAtDate);
  const master = await itemMaster(pool, items);

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).input('id', sql.UniqueIdentifier, sheetId)
      .query(`DELETE FROM [dbo].[PosPortionSheetLine] WHERE [SheetId]=@id`);
    let i = 0;
    for (const itemNo of items) {
      const l = byItem.get(itemNo);
      const b = book.get(itemNo) || { openingQty: 0, inQty: 0, recordedSalesQty: 0, recordedWriteOffQty: 0 };
      const m = master.get(itemNo) || {};
      const sales = round4(Math.max(num(l.salesQty), 0));
      const wo = round4(Math.max(num(l.writeOffQty), 0));
      const count = l.countQty === null || l.countQty === undefined || l.countQty === '' ? null : round4(num(l.countQty));
      const expected = round4(b.openingQty + b.inQty - sales - wo);
      const variance = count == null ? 0 : round4(expected - count);
      const unitPrice = l.unitPrice != null && l.unitPrice !== '' ? num(l.unitPrice) : Number(m.UnitPrice || 0);
      await new sql.Request(tx)
        .input('sid', sql.UniqueIdentifier, sheetId)
        .input('ino', sql.NVarChar(30), itemNo)
        .input('dsc', sql.NVarChar(200), str(l.description || m.Description || b.description || itemNo))
        .input('uom', sql.NVarChar(20), str(l.unitOfMeasure || m.UnitOfMeasure || 'KG', 20))
        .input('op', sql.Decimal(18, 4), b.openingQty)
        .input('inq', sql.Decimal(18, 4), b.inQty)
        .input('rs', sql.Decimal(18, 4), b.recordedSalesQty)
        .input('rw', sql.Decimal(18, 4), b.recordedWriteOffQty)
        .input('sq', sql.Decimal(18, 4), sales)
        .input('wq', sql.Decimal(18, 4), wo)
        .input('cq', sql.Decimal(18, 4), count)
        .input('eq', sql.Decimal(18, 4), expected)
        .input('vq', sql.Decimal(18, 4), variance)
        .input('up', sql.Decimal(18, 4), unitPrice)
        .input('vv', sql.Decimal(18, 4), round4(variance * unitPrice))
        .input('cmt', sql.NVarChar(500), str(l.comment, 500) || null)
        .input('srt', sql.Int, i++)
        .query(`
          INSERT INTO [dbo].[PosPortionSheetLine]
            ([SheetId],[ItemNo],[Description],[UnitOfMeasure],[OpeningQty],[InQty],[RecordedSalesQty],[RecordedWriteOffQty],
             [SalesQty],[WriteOffQty],[CountQty],[ExpectedQty],[VarianceQty],[UnitPrice],[VarianceValue],[Comment],[SortOrder])
          VALUES(@sid,@ino,@dsc,@uom,@op,@inq,@rs,@rw,@sq,@wq,@cq,@eq,@vq,@up,@vv,@cmt,@srt)
        `);
    }
    const upd = new sql.Request(tx).input('id', sql.UniqueIdentifier, sheetId).input('from', sql.Date, from);
    let notesSet = '';
    if (notes !== undefined) { upd.input('notes', sql.NVarChar(500), str(notes, 500) || null); notesSet = ',[Notes]=@notes'; }
    await upd.query(`UPDATE [dbo].[PosPortionSheet] SET [PeriodFrom]=@from${notesSet},[UpdatedAt]=GETUTCDATE() WHERE [SheetId]=@id`);
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  }
  return getSheet(sheetId);
}

export async function deleteSheet(sheetId) {
  const pool = await appPool();
  const s = await getSheet(sheetId);
  if (!s) throw new Error('Stock sheet not found');
  if (s.status === 'posted') throw new Error('A posted stock sheet cannot be deleted');
  await pool.request().input('id', sql.UniqueIdentifier, sheetId)
    .query(`DELETE FROM [dbo].[PosPortionSheet] WHERE [SheetId]=@id`);
}

export async function postSheet(sheetId, postedBy = null) {
  const pool = await appPool();
  let sheet = await getSheet(sheetId);
  if (!sheet) throw new Error('Stock sheet not found');
  if (sheet.status !== 'draft') throw new Error(`Stock sheet is already ${sheet.status}`);
  if (!sheet.lines.length) throw new Error('No lines to post');
  const uncounted = sheet.lines.filter((l) => l.countQty == null);
  if (uncounted.length) throw new Error(`Enter the final stock count for: ${uncounted.slice(0, 5).map((l) => l.itemNo).join(', ')}${uncounted.length > 5 ? ` and ${uncounted.length - 5} more` : ''}`);

  // Refresh book figures so anything posted since the last save is reflected.
  sheet = await saveSheetLines(sheetId, sheet.lines);

  const plan = [];
  const problems = [];
  for (const l of sheet.lines) {
    const extraSales = round4(l.salesQty - l.recordedSalesQty);
    const extraWo = round4(l.writeOffQty - l.recordedWriteOffQty);
    if (extraSales < 0) problems.push(`${l.itemNo}: sales ${l.salesQty} is below the ${l.recordedSalesQty} already recorded by the POS`);
    if (extraWo < 0) problems.push(`${l.itemNo}: write-off ${l.writeOffQty} is below the ${l.recordedWriteOffQty} already recorded`);
    plan.push({ l, extraSales, extraWo, adj: round4(l.countQty - l.expectedQty) });
  }
  if (problems.length) throw new Error(problems.join('; '));

  // Pre-flight the no-negative-stock guard so the sheet posts all-or-nothing.
  const onHand = await onHandMany(sheet.shopCode, sheet.lines.map((l) => l.itemNo));
  const short = plan.filter((p) => (onHand.get(p.l.itemNo) || 0) - p.extraSales - p.extraWo + p.adj < -0.00005);
  if (short.length) {
    throw new Error(`Posting would take on-hand below zero for ${short.map((p) => p.l.itemNo).join(', ')} (later movements already consumed this stock)`);
  }

  const base = {
    shopCode: sheet.shopCode, referenceType: 'stock-sheet', referenceId: sheet.sheetId,
    referenceNo: sheet.sheetNo, movementDate: sheet.asAtDate, createdBy: postedBy,
  };
  const mv = (p, movementType, quantity, notes) => postMovement({
    ...base, itemNo: p.l.itemNo, description: p.l.description, movementType, quantity,
    unitPrice: p.l.unitPrice, notes,
  });
  // Increases first, so intermediate on-hand never dips below zero.
  for (const p of plan) if (p.adj > 0) await mv(p, 'positive-adj', p.adj, p.l.comment || 'Stock sheet count');
  for (const p of plan) if (p.extraSales > 0) await mv(p, 'sale', -p.extraSales, 'Stock sheet sales');
  for (const p of plan) if (p.extraWo > 0) await mv(p, 'write-off', -p.extraWo, 'Stock sheet write-off');
  for (const p of plan) if (p.adj < 0) await mv(p, 'negative-adj', p.adj, p.l.comment || 'Stock sheet unaccounted');

  await pool.request()
    .input('id', sql.UniqueIdentifier, sheetId)
    .input('by', sql.NVarChar(100), postedBy ? str(postedBy, 100) : null)
    .query(`UPDATE [dbo].[PosPortionSheet] SET [Status]='posted',[PostedBy]=@by,[PostedAt]=GETUTCDATE(),[UpdatedAt]=GETUTCDATE() WHERE [SheetId]=@id`);
  return getSheet(sheetId);
}

/**
 * Upload sales + stock by date. rows: [{ date, itemNo, salesQty, writeOffQty, countQty, comment }].
 * One sheet per date (an existing draft for that date is merged into); optionally posted.
 */
export async function uploadSheets({ shopCode, rows, autoPost = false, createdBy = null }) {
  if (!shopCode) throw new Error('shopCode required');
  if (!Array.isArray(rows) || !rows.length) throw new Error('rows required');
  const pool = await appPool();
  const shop = str(shopCode, 50).toUpperCase();
  const byDate = new Map();
  const errors = [];
  rows.forEach((r, i) => {
    const date = isoDay(r.date);
    const itemNo = str(r.itemNo, 30).toUpperCase();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push({ row: i + 1, itemNo, error: 'invalid or missing date' }); return; }
    if (!itemNo) { errors.push({ row: i + 1, itemNo, error: 'itemNo required' }); return; }
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(r);
  });

  const results = [];
  for (const date of [...byDate.keys()].sort()) {
    try {
      const ex = await pool.request().input('shop', sql.NVarChar(50), shop).input('d', sql.Date, date).query(`
        SELECT TOP 1 [SheetId],[Status],[SheetNo] FROM [dbo].[PosPortionSheet] WHERE [ShopCode]=@shop AND [AsAtDate]=@d AND [Status]<>'cancelled'
      `);
      let sheetId;
      if (ex.recordset.length) {
        if (ex.recordset[0].Status !== 'draft') throw new Error(`sheet ${ex.recordset[0].SheetNo} for this date is already ${ex.recordset[0].Status}`);
        sheetId = ex.recordset[0].SheetId;
      } else {
        sheetId = (await createSheet({ shopCode: shop, asAtDate: date, scope: 'none', source: 'upload', createdBy })).SheetId;
      }
      const cur = await getSheet(sheetId);
      const merged = new Map(cur.lines.map((l) => [l.itemNo, l]));
      for (const r of byDate.get(date)) {
        const itemNo = str(r.itemNo, 30).toUpperCase();
        const prev = merged.get(itemNo) || {};
        merged.set(itemNo, {
          ...prev, itemNo,
          salesQty: r.salesQty ?? prev.salesQty ?? 0,
          writeOffQty: r.writeOffQty ?? prev.writeOffQty ?? 0,
          countQty: r.countQty ?? prev.countQty ?? null,
          comment: r.comment ?? prev.comment ?? null,
        });
      }
      let sheet = await saveSheetLines(sheetId, [...merged.values()]);
      if (autoPost) sheet = await postSheet(sheetId, createdBy);
      results.push({ date, sheetNo: sheet.sheetNo, status: sheet.status, lines: sheet.lines.length });
    } catch (e) {
      results.push({ date, error: e.message });
    }
  }
  return { results, errors };
}

// ── Portioning / yield report ────────────────────────────────────────────────

/**
 * Filterable portioning report.
 *   portionings  per portioning: source vs output (yield %, loss qty/value) + lines
 *   summary      per output item: produced, sold, written off, final count, unaccounted
 * Filters: dateFrom/dateTo (portioning date; sheet as-at date), shopCode,
 * itemNos (source or output item), sourceItemNo, status, q (no/description text).
 */
export async function portioningReport({ dateFrom, dateTo, shopCode = null, itemNos = [], sourceItemNo = null, status = 'posted', q = null }) {
  if (!dateFrom || !dateTo) throw new Error('dateFrom, dateTo required');
  const pool = await appPool();
  const items = (itemNos || []).map((x) => str(x, 30).toUpperCase()).filter(Boolean);

  const req = pool.request().input('df', sql.Date, dateFrom).input('dt', sql.Date, dateTo);
  const where = ['p.[PortioningDate] BETWEEN @df AND @dt'];
  if (shopCode) { req.input('shop', sql.NVarChar(50), shopCode); where.push('p.[ShopCode]=@shop'); }
  if (status && status !== 'all') { req.input('st', sql.NVarChar(20), status); where.push('p.[Status]=@st'); }
  if (sourceItemNo) { req.input('src', sql.NVarChar(30), str(sourceItemNo, 30).toUpperCase()); where.push('p.[SourceItemNo]=@src'); }
  const hq = await req.query(`
    SELECT p.*, sr.[RequestNo] AS SourceRequestNo, tt.[TransferNo] AS SourceTransferNo
    FROM [dbo].[PosPortioning] p
    LEFT JOIN [dbo].[PosStockRequestLine] srl ON srl.[LineId] = p.[SourceRequestLineId]
    LEFT JOIN [dbo].[PosStockRequest] sr ON sr.[RequestId] = srl.[RequestId]
    LEFT JOIN [dbo].[PosThirdPartyTransferLine] tl ON tl.[LineId] = p.[SourceTransferLineId]
    LEFT JOIN [dbo].[PosThirdPartyTransfer] tt ON tt.[TransferId] = tl.[TransferId]
    WHERE ${where.join(' AND ')}
    ORDER BY p.[PortioningDate] DESC, p.[PortioningNo] DESC
  `);
  let lineRows = [];
  // Chunk to stay under the 2100-parameter limit
  for (let i = 0; i < hq.recordset.length; i += 1000) {
    const lr = pool.request();
    const ids = hq.recordset.slice(i, i + 1000).map((p, j) => { lr.input(`p${j}`, sql.UniqueIdentifier, p.PortioningId); return `@p${j}`; });
    const r = await lr.query(`SELECT * FROM [dbo].[PosPortioningLine] WHERE [PortioningId] IN (${ids.join(',')}) ORDER BY [SortOrder]`);
    lineRows = lineRows.concat(r.recordset);
  }
  const linesBy = new Map();
  for (const l of lineRows) {
    if (!linesBy.has(l.PortioningId)) linesBy.set(l.PortioningId, []);
    linesBy.get(l.PortioningId).push(l);
  }

  const text = q ? String(q).toLowerCase() : null;
  const portionings = [];
  for (const p of hq.recordset) {
    const lines = (linesBy.get(p.PortioningId) || []).map((l) => ({
      itemNo: l.ItemNo, description: l.Description, uom: l.UnitOfMeasure || 'KG',
      quantity: Number(l.Quantity), value: Number(l.AllocatedCost),
    }));
    const srcNo = String(p.SourceItemNo || '').toUpperCase();
    if (items.length && !items.includes(srcNo) && !lines.some((l) => items.includes(String(l.itemNo).toUpperCase()))) continue;
    if (text) {
      const hay = `${p.PortioningNo} ${p.SourceItemNo} ${p.SourceDescription} ${lines.map((l) => `${l.itemNo} ${l.description}`).join(' ')}`.toLowerCase();
      if (!hay.includes(text)) continue;
    }
    const outQty = lines.reduce((s, l) => s + l.quantity, 0);
    const outVal = lines.reduce((s, l) => s + l.value, 0);
    const srcQty = Number(p.SourceQuantity || 0), srcCost = Number(p.SourceTotalCost || 0);
    portionings.push({
      portioningId: p.PortioningId, portioningNo: p.PortioningNo, portioningDate: isoDay(p.PortioningDate),
      shopCode: p.ShopCode, status: p.Status,
      sourceDocNo: p.SourceRequestNo || p.SourceTransferNo || '',
      sourceItemNo: p.SourceItemNo, sourceDescription: p.SourceDescription, sourceUom: p.SourceUom || 'KG',
      sourceQty: round4(srcQty), sourceCost: round4(srcCost),
      outputQty: round4(outQty), outputValue: round4(outVal),
      yieldPct: srcQty > 0 ? round4((outQty / srcQty) * 100) : null,
      lossQty: round4(srcQty - outQty), lossValue: round4(srcCost - outVal),
      lines,
    });
  }

  // Per output item roll-up
  const agg = new Map();
  for (const p of portionings) {
    for (const l of p.lines) {
      const key = String(l.itemNo).toUpperCase();
      if (items.length && !items.includes(key) && !items.includes(String(p.sourceItemNo).toUpperCase())) continue;
      const a = agg.get(key) || { itemNo: key, description: l.description, uom: l.uom, producedQty: 0, producedValue: 0 };
      a.producedQty += l.quantity; a.producedValue += l.value;
      agg.set(key, a);
    }
  }
  // Items filtered explicitly but not portioned in the period still get a row.
  for (const it of items) if (!agg.has(it)) agg.set(it, { itemNo: it, description: '', uom: '', producedQty: 0, producedValue: 0 });
  const keys = [...agg.keys()];

  if (keys.length) {
    const m = pool.request().input('df', sql.Date, dateFrom).input('dt', sql.Date, dateTo);
    keys.forEach((k, i) => m.input(`k${i}`, sql.NVarChar(30), k));
    const inList = keys.map((_, i) => `@k${i}`).join(',');
    if (shopCode) m.input('shop', sql.NVarChar(50), shopCode);
    const mv = await m.query(`
      SELECT UPPER(mv.[ItemNo]) AS ItemNo,
        -SUM(CASE WHEN mv.[MovementType]='sale' THEN mv.[Quantity] ELSE 0 END) AS SalesQty,
        -SUM(CASE WHEN mv.[MovementType]='sale' THEN mv.[Quantity] * ISNULL(mv.[UnitPrice], ISNULL(pi.[UnitPrice],0)) ELSE 0 END) AS SalesValue,
        -SUM(CASE WHEN mv.[MovementType]='write-off' THEN mv.[Quantity] ELSE 0 END) AS WriteOffQty,
        -SUM(CASE WHEN mv.[MovementType]='write-off' THEN mv.[Quantity] * ISNULL(mv.[UnitPrice], ISNULL(pi.[UnitPrice],0)) ELSE 0 END) AS WriteOffValue
      FROM [dbo].[PosStockMovement] mv
      LEFT JOIN [dbo].[PosItem] pi ON pi.[ItemNo] = mv.[ItemNo]
      WHERE mv.[MovementDate] BETWEEN @df AND @dt AND mv.[ItemNo] IN (${inList})
        ${shopCode ? 'AND mv.[ShopCode]=@shop' : ''}
      GROUP BY UPPER(mv.[ItemNo])
    `);
    const mvBy = new Map(mv.recordset.map((x) => [x.ItemNo, x]));

    const s = pool.request().input('df', sql.Date, dateFrom).input('dt', sql.Date, dateTo);
    keys.forEach((k, i) => s.input(`k${i}`, sql.NVarChar(30), k));
    if (shopCode) s.input('shop', sql.NVarChar(50), shopCode);
    const sh = await s.query(`
      SELECT UPPER(l.[ItemNo]) AS ItemNo, h.[AsAtDate], h.[ShopCode], l.[CountQty], l.[VarianceQty], l.[VarianceValue], l.[UnitPrice], l.[Description], l.[UnitOfMeasure]
      FROM [dbo].[PosPortionSheetLine] l JOIN [dbo].[PosPortionSheet] h ON h.[SheetId]=l.[SheetId]
      WHERE h.[Status]='posted' AND h.[AsAtDate] BETWEEN @df AND @dt AND l.[ItemNo] IN (${inList})
        ${shopCode ? 'AND h.[ShopCode]=@shop' : ''}
      ORDER BY h.[AsAtDate]
    `);
    const sheetBy = new Map();
    for (const x of sh.recordset) {
      const c = sheetBy.get(x.ItemNo) || { varianceQty: 0, varianceValue: 0, counts: new Map(), lastAsAt: null, desc: x.Description, uom: x.UnitOfMeasure, price: 0 };
      c.varianceQty += Number(x.VarianceQty || 0);
      c.varianceValue += Number(x.VarianceValue || 0);
      // Final stock = latest count per shop, summed across shops
      c.counts.set(x.ShopCode, Number(x.CountQty || 0));
      c.lastAsAt = isoDay(x.AsAtDate);
      c.price = Number(x.UnitPrice || 0);
      sheetBy.set(x.ItemNo, c);
    }
    const master = await itemMaster(pool, keys);

    for (const a of agg.values()) {
      const x = mvBy.get(a.itemNo) || {};
      const c = sheetBy.get(a.itemNo);
      const mi = master.get(a.itemNo) || {};
      a.description = a.description || mi.Description || c?.desc || a.itemNo;
      a.uom = a.uom || mi.UnitOfMeasure || c?.uom || 'KG';
      a.unitPrice = round4(c?.price || Number(mi.UnitPrice || 0));
      a.salesQty = round4(x.SalesQty); a.salesValue = round4(x.SalesValue);
      a.writeOffQty = round4(x.WriteOffQty); a.writeOffValue = round4(x.WriteOffValue);
      a.finalStockQty = c ? round4([...c.counts.values()].reduce((s2, v) => s2 + v, 0)) : null;
      a.lastCountDate = c?.lastAsAt || null;
      a.varianceQty = round4(c?.varianceQty || 0);
      a.varianceValue = round4(c?.varianceValue || 0);
      a.producedQty = round4(a.producedQty); a.producedValue = round4(a.producedValue);
    }
  }
  const summary = [...agg.values()].sort((a, b) => String(a.description).localeCompare(String(b.description)));
  return { portionings, summary };
}
