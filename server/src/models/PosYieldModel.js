/**
 * models/PosYieldModel.js
 * Third-party transfers, portioning, write-offs, and the yield/loss report.
 *
 * Movement types posted to PosStockMovement:
 *   third-party-in   →  destination shop receives a transferred piece
 *   portion-out      →  source whole piece consumed during portioning
 *   portion-in       →  each portion produced (with allocated cost in UnitPrice)
 *   write-off        →  spoilage / damage / loss (negative qty)
 *
 * The yield report joins:
 *   transfer.line  →  portionings[].lines[]  →  sales (PosOrderLine) and write-offs
 * to compute, per period:
 *   transferred qty/cost  vs  sold qty/value  vs  written-off qty/value  vs  expected stock
 */
import { db as appDb, sql } from '../db/pool.js';
import { postMovement } from './PosStockModel.js';
import logger from '../services/logger.js';

function str(v, max = 200) { return String(v ?? '').trim().slice(0, max); }
function num(v) { return isNaN(Number(v)) ? 0 : Number(v); }
async function appPool() { return appDb.getPool(); }

async function nextNo(pool, prefix, table, column) {
  const today  = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fullPrefix = `${prefix}-${today}-`;
  const r = await pool.request().query(`
    SELECT TOP 1 [${column}] AS Val FROM [dbo].[${table}]
    WHERE [${column}] LIKE '${fullPrefix}%' ORDER BY [${column}] DESC
  `);
  if (!r.recordset.length) return `${fullPrefix}001`;
  const seq = parseInt(r.recordset[0].Val.slice(-3)) + 1;
  return `${fullPrefix}${String(seq).padStart(3, '0')}`;
}

// ── Third Party master ───────────────────────────────────────────────────────

export async function listThirdParties() {
  const pool = await appPool();
  const r = await pool.request().query(`
    SELECT * FROM [dbo].[PosThirdParty] ORDER BY [Name]
  `);
  return r.recordset;
}

export async function saveThirdParty({ thirdPartyId, code, name, shopCode, isActive = true, notes }) {
  const pool = await appPool();
  const req = pool.request()
    .input('code',     sql.NVarChar(50),  str(code, 50).toUpperCase())
    .input('name',     sql.NVarChar(200), str(name))
    .input('shopCode', sql.NVarChar(50),  str(shopCode, 50).toUpperCase() || null)
    .input('isActive', sql.Bit,           isActive ? 1 : 0)
    .input('notes',    sql.NVarChar(500), str(notes, 500) || null);
  if (thirdPartyId) {
    req.input('id', sql.UniqueIdentifier, thirdPartyId);
    await req.query(`
      UPDATE [dbo].[PosThirdParty]
      SET [Code]=@code,[Name]=@name,[ShopCode]=@shopCode,[IsActive]=@isActive,
          [Notes]=@notes,[UpdatedAt]=GETUTCDATE()
      WHERE [ThirdPartyId]=@id
    `);
    return thirdPartyId;
  }
  const r = await req.query(`
    INSERT INTO [dbo].[PosThirdParty]([Code],[Name],[ShopCode],[IsActive],[Notes])
    OUTPUT INSERTED.[ThirdPartyId]
    VALUES(@code,@name,@shopCode,@isActive,@notes)
  `);
  return r.recordset[0].ThirdPartyId;
}

export async function deleteThirdParty(thirdPartyId) {
  const pool = await appPool();
  await pool.request()
    .input('id', sql.UniqueIdentifier, thirdPartyId)
    .query(`DELETE FROM [dbo].[PosThirdParty] WHERE [ThirdPartyId]=@id`);
}

// ── Third Party Transfers ────────────────────────────────────────────────────

export async function listTransfers({ shopCode = null } = {}) {
  const pool = await appPool();
  const req  = pool.request();
  let where = '';
  if (shopCode) {
    req.input('shopCode', sql.NVarChar(50), shopCode);
    where = 'WHERE [DestinationShopCode]=@shopCode';
  }
  const r = await req.query(`
    SELECT t.*, (SELECT COUNT(*) FROM [dbo].[PosThirdPartyTransferLine] l WHERE l.[TransferId]=t.[TransferId]) AS LineCount
    FROM [dbo].[PosThirdPartyTransfer] t
    ${where}
    ORDER BY t.[TransferDate] DESC, t.[CreatedAt] DESC
  `);
  return r.recordset;
}

export async function getTransfer(transferId) {
  const pool = await appPool();
  const hdr = await pool.request()
    .input('id', sql.UniqueIdentifier, transferId)
    .query(`SELECT * FROM [dbo].[PosThirdPartyTransfer] WHERE [TransferId]=@id`);
  if (!hdr.recordset.length) return null;
  const lns = await pool.request()
    .input('id', sql.UniqueIdentifier, transferId)
    .query(`SELECT * FROM [dbo].[PosThirdPartyTransferLine] WHERE [TransferId]=@id ORDER BY [SortOrder],[Description]`);
  const h = hdr.recordset[0];
  return {
    transferId: h.TransferId, transferNo: h.TransferNo,
    transferDate: h.TransferDate, thirdPartyId: h.ThirdPartyId, thirdPartyName: h.ThirdPartyName,
    destinationShopCode: h.DestinationShopCode,
    originLabel: h.OriginLabel || 'HQ dispatch',
    status: h.Status,
    totalCost: Number(h.TotalCost), notes: h.Notes || '',
    createdBy: h.CreatedBy, createdAt: h.CreatedAt, postedAt: h.PostedAt,
    lines: lns.recordset.map(l => ({
      lineId: l.LineId, itemNo: l.ItemNo, description: l.Description,
      quantity: Number(l.Quantity), unitOfMeasure: l.UnitOfMeasure || '',
      unitCost: Number(l.UnitCost), lineCost: Number(l.LineCost), sortOrder: l.SortOrder,
    })),
  };
}

export async function createTransfer({ transferDate, thirdPartyId, notes, createdBy }) {
  if (!thirdPartyId) throw new Error('thirdPartyId is required — transfers go from HQ to a third party');
  const pool = await appPool();

  // Resolve third-party details + linked shop (for stock-tracking on post)
  const tpQ = await pool.request()
    .input('id', sql.UniqueIdentifier, thirdPartyId)
    .query(`SELECT [Name],[ShopCode] FROM [dbo].[PosThirdParty] WHERE [ThirdPartyId]=@id AND [IsActive]=1`);
  if (!tpQ.recordset.length) throw new Error('Third party not found or inactive');
  const tp = tpQ.recordset[0];
  const destinationShopCode = tp.ShopCode || null;

  const transferNo = await nextNo(pool, 'TPT', 'PosThirdPartyTransfer', 'TransferNo');
  const r = await pool.request()
    .input('transferNo',          sql.NVarChar(30),     transferNo)
    .input('transferDate',        sql.Date,             transferDate || new Date())
    .input('thirdPartyId',        sql.UniqueIdentifier, thirdPartyId)
    .input('thirdPartyName',      sql.NVarChar(200),    tp.Name)
    .input('destinationShopCode', sql.NVarChar(50),     destinationShopCode)
    .input('notes',               sql.NVarChar(500),    str(notes, 500) || null)
    .input('createdBy',           sql.NVarChar(100),    createdBy || null)
    .query(`
      INSERT INTO [dbo].[PosThirdPartyTransfer]
        ([TransferNo],[TransferDate],[ThirdPartyId],[ThirdPartyName],[DestinationShopCode],[Notes],[CreatedBy])
      OUTPUT INSERTED.[TransferId], INSERTED.[TransferNo]
      VALUES(@transferNo,@transferDate,@thirdPartyId,@thirdPartyName,@destinationShopCode,@notes,@createdBy)
    `);
  return r.recordset[0];
}

export async function setTransferLines(transferId, lines) {
  const pool = await appPool();
  const hdr = await pool.request()
    .input('id', sql.UniqueIdentifier, transferId)
    .query(`SELECT [Status] FROM [dbo].[PosThirdPartyTransfer] WHERE [TransferId]=@id`);
  if (!hdr.recordset.length) throw new Error('Transfer not found');
  if (hdr.recordset[0].Status === 'posted') throw new Error('Cannot edit a posted transfer');

  await pool.request()
    .input('id', sql.UniqueIdentifier, transferId)
    .query(`DELETE FROM [dbo].[PosThirdPartyTransferLine] WHERE [TransferId]=@id`);

  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.itemNo) continue;
    const qty  = num(l.quantity);
    const cost = num(l.unitCost);
    const ln   = Math.round(qty * cost * 10000) / 10000;
    total += ln;
    await pool.request()
      .input('id',  sql.UniqueIdentifier, transferId)
      .input('ino', sql.NVarChar(30),     str(l.itemNo, 30).toUpperCase())
      .input('dsc', sql.NVarChar(200),    str(l.description))
      .input('qty', sql.Decimal(18, 4),   qty)
      .input('uom', sql.NVarChar(20),     str(l.unitOfMeasure, 20) || null)
      .input('uc',  sql.Decimal(18, 4),   cost)
      .input('lc',  sql.Decimal(18, 4),   ln)
      .input('srt', sql.Int,              i)
      .query(`
        INSERT INTO [dbo].[PosThirdPartyTransferLine]
          ([TransferId],[ItemNo],[Description],[Quantity],[UnitOfMeasure],[UnitCost],[LineCost],[SortOrder])
        VALUES(@id,@ino,@dsc,@qty,@uom,@uc,@lc,@srt)
      `);
  }
  await pool.request()
    .input('id', sql.UniqueIdentifier, transferId)
    .input('total', sql.Decimal(18, 4), Math.round(total * 10000) / 10000)
    .query(`UPDATE [dbo].[PosThirdPartyTransfer] SET [TotalCost]=@total,[UpdatedAt]=GETUTCDATE() WHERE [TransferId]=@id`);
}

export async function postTransfer(transferId) {
  const pool = await appPool();
  const t = await getTransfer(transferId);
  if (!t) throw new Error('Transfer not found');
  if (t.status === 'posted') throw new Error('Already posted');
  if (!t.lines.length) throw new Error('No lines to post');

  // If the third party is linked to a shop, post stock movements there.
  // Otherwise, the transfer is recorded for traceability/reporting only.
  if (t.destinationShopCode) {
    for (const line of t.lines) {
      await postMovement({
        shopCode:      t.destinationShopCode,
        itemNo:        line.itemNo,
        description:   line.description,
        movementType:  'third-party-in',
        quantity:      line.quantity,
        unitPrice:     line.unitCost,
        referenceType: 'transfer',
        referenceId:   t.transferId,
        referenceNo:   t.transferNo,
        movementDate:  t.transferDate,
        notes:         t.thirdPartyName ? `From HQ to ${t.thirdPartyName}` : 'From HQ',
        createdBy:     t.createdBy,
      });
    }
  }

  await pool.request()
    .input('id', sql.UniqueIdentifier, transferId)
    .query(`UPDATE [dbo].[PosThirdPartyTransfer] SET [Status]='posted',[PostedAt]=GETUTCDATE(),[UpdatedAt]=GETUTCDATE() WHERE [TransferId]=@id`);
}

// ── Portioning ───────────────────────────────────────────────────────────────

export async function listPortionings({ shopCode = null } = {}) {
  const pool = await appPool();
  const req  = pool.request();
  let where  = '';
  if (shopCode) {
    req.input('shopCode', sql.NVarChar(50), shopCode);
    where = 'WHERE [ShopCode]=@shopCode';
  }
  const r = await req.query(`
    SELECT p.*,
      (SELECT COUNT(*) FROM [dbo].[PosPortioningLine] l WHERE l.[PortioningId]=p.[PortioningId]) AS LineCount
    FROM [dbo].[PosPortioning] p
    ${where}
    ORDER BY p.[PortioningDate] DESC, p.[CreatedAt] DESC
  `);
  return r.recordset;
}

export async function getPortioning(portioningId) {
  const pool = await appPool();
  const hdr = await pool.request()
    .input('id', sql.UniqueIdentifier, portioningId)
    .query(`SELECT * FROM [dbo].[PosPortioning] WHERE [PortioningId]=@id`);
  if (!hdr.recordset.length) return null;
  const lns = await pool.request()
    .input('id', sql.UniqueIdentifier, portioningId)
    .query(`SELECT * FROM [dbo].[PosPortioningLine] WHERE [PortioningId]=@id ORDER BY [SortOrder],[Description]`);
  const h = hdr.recordset[0];
  return {
    portioningId: h.PortioningId, portioningNo: h.PortioningNo, portioningDate: h.PortioningDate,
    sourceTransferLineId: h.SourceTransferLineId,
    sourceItemNo: h.SourceItemNo, sourceDescription: h.SourceDescription,
    sourceQuantity: Number(h.SourceQuantity), sourceUom: h.SourceUom || '',
    sourceUnitCost: Number(h.SourceUnitCost), sourceTotalCost: Number(h.SourceTotalCost),
    shopCode: h.ShopCode, status: h.Status, notes: h.Notes || '',
    createdBy: h.CreatedBy, createdAt: h.CreatedAt, postedAt: h.PostedAt,
    lines: lns.recordset.map(l => ({
      lineId: l.LineId, itemNo: l.ItemNo, description: l.Description,
      quantity: Number(l.Quantity), unitOfMeasure: l.UnitOfMeasure || '',
      allocatedCost: Number(l.AllocatedCost), sortOrder: l.SortOrder,
    })),
  };
}

export async function createPortioning({ portioningDate, sourceTransferLineId, shopCode, notes, createdBy }) {
  const pool = await appPool();
  // Pull source-line details so the source qty/cost are captured at creation time
  let src = {};
  if (sourceTransferLineId) {
    const r = await pool.request()
      .input('id', sql.UniqueIdentifier, sourceTransferLineId)
      .query(`
        SELECT l.[ItemNo],l.[Description],l.[Quantity],l.[UnitOfMeasure],l.[UnitCost],l.[LineCost]
        FROM [dbo].[PosThirdPartyTransferLine] l WHERE l.[LineId]=@id
      `);
    if (r.recordset.length) {
      const ln = r.recordset[0];
      src = {
        itemNo: ln.ItemNo, description: ln.Description,
        qty: Number(ln.Quantity), uom: ln.UnitOfMeasure || '',
        unitCost: Number(ln.UnitCost), totalCost: Number(ln.LineCost),
      };
    }
  }

  const portioningNo = await nextNo(pool, 'PT', 'PosPortioning', 'PortioningNo');
  const r = await pool.request()
    .input('portioningNo',         sql.NVarChar(30),    portioningNo)
    .input('portioningDate',       sql.Date,            portioningDate || new Date())
    .input('sourceTransferLineId', sql.UniqueIdentifier, sourceTransferLineId || null)
    .input('sourceItemNo',         sql.NVarChar(30),    src.itemNo || '')
    .input('sourceDescription',    sql.NVarChar(200),   src.description || '')
    .input('sourceQuantity',       sql.Decimal(18, 4),  src.qty || 0)
    .input('sourceUom',            sql.NVarChar(20),    src.uom || null)
    .input('sourceUnitCost',       sql.Decimal(18, 4),  src.unitCost || 0)
    .input('sourceTotalCost',      sql.Decimal(18, 4),  src.totalCost || 0)
    .input('shopCode',             sql.NVarChar(50),    str(shopCode, 50).toUpperCase())
    .input('notes',                sql.NVarChar(500),   str(notes, 500) || null)
    .input('createdBy',            sql.NVarChar(100),   createdBy || null)
    .query(`
      INSERT INTO [dbo].[PosPortioning]
        ([PortioningNo],[PortioningDate],[SourceTransferLineId],[SourceItemNo],[SourceDescription],
         [SourceQuantity],[SourceUom],[SourceUnitCost],[SourceTotalCost],[ShopCode],[Notes],[CreatedBy])
      OUTPUT INSERTED.[PortioningId], INSERTED.[PortioningNo]
      VALUES(@portioningNo,@portioningDate,@sourceTransferLineId,@sourceItemNo,@sourceDescription,
             @sourceQuantity,@sourceUom,@sourceUnitCost,@sourceTotalCost,@shopCode,@notes,@createdBy)
    `);
  return r.recordset[0];
}

export async function setPortioningLines(portioningId, lines) {
  const pool = await appPool();
  const hdr = await pool.request()
    .input('id', sql.UniqueIdentifier, portioningId)
    .query(`SELECT [Status] FROM [dbo].[PosPortioning] WHERE [PortioningId]=@id`);
  if (!hdr.recordset.length) throw new Error('Portioning not found');
  if (hdr.recordset[0].Status === 'posted') throw new Error('Cannot edit a posted portioning');

  await pool.request()
    .input('id', sql.UniqueIdentifier, portioningId)
    .query(`DELETE FROM [dbo].[PosPortioningLine] WHERE [PortioningId]=@id`);

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.itemNo) continue;
    await pool.request()
      .input('id',  sql.UniqueIdentifier, portioningId)
      .input('ino', sql.NVarChar(30),     str(l.itemNo, 30).toUpperCase())
      .input('dsc', sql.NVarChar(200),    str(l.description))
      .input('qty', sql.Decimal(18, 4),   num(l.quantity))
      .input('uom', sql.NVarChar(20),     str(l.unitOfMeasure, 20) || null)
      .input('ac',  sql.Decimal(18, 4),   num(l.allocatedCost))
      .input('srt', sql.Int,              i)
      .query(`
        INSERT INTO [dbo].[PosPortioningLine]
          ([PortioningId],[ItemNo],[Description],[Quantity],[UnitOfMeasure],[AllocatedCost],[SortOrder])
        VALUES(@id,@ino,@dsc,@qty,@uom,@ac,@srt)
      `);
  }
  await pool.request()
    .input('id', sql.UniqueIdentifier, portioningId)
    .query(`UPDATE [dbo].[PosPortioning] SET [UpdatedAt]=GETUTCDATE() WHERE [PortioningId]=@id`);
}

export async function postPortioning(portioningId) {
  const pool = await appPool();
  const p = await getPortioning(portioningId);
  if (!p) throw new Error('Portioning not found');
  if (p.status === 'posted') throw new Error('Already posted');
  if (!p.lines.length) throw new Error('No portion lines to post');

  // 1. Consume the source whole piece
  if (p.sourceItemNo && p.sourceQuantity > 0) {
    await postMovement({
      shopCode: p.shopCode, itemNo: p.sourceItemNo, description: p.sourceDescription,
      movementType: 'portion-out',
      quantity: -Math.abs(p.sourceQuantity),
      unitPrice: p.sourceUnitCost,
      referenceType: 'portioning', referenceId: p.portioningId, referenceNo: p.portioningNo,
      movementDate: p.portioningDate,
      notes: 'Portioned',
      createdBy: p.createdBy,
    });
  }

  // 2. Produce each portion (positive qty, allocated cost stored as UnitPrice)
  for (const ln of p.lines) {
    if (!ln.itemNo || ln.quantity <= 0) continue;
    const unitCost = ln.quantity > 0 ? ln.allocatedCost / ln.quantity : 0;
    await postMovement({
      shopCode: p.shopCode, itemNo: ln.itemNo, description: ln.description,
      movementType: 'portion-in',
      quantity: ln.quantity,
      unitPrice: Math.round(unitCost * 10000) / 10000,
      referenceType: 'portioning', referenceId: p.portioningId, referenceNo: p.portioningNo,
      movementDate: p.portioningDate,
      notes: `From ${p.sourceDescription || p.sourceItemNo}`,
      createdBy: p.createdBy,
    });
  }

  await pool.request()
    .input('id', sql.UniqueIdentifier, portioningId)
    .query(`UPDATE [dbo].[PosPortioning] SET [Status]='posted',[PostedAt]=GETUTCDATE(),[UpdatedAt]=GETUTCDATE() WHERE [PortioningId]=@id`);
}

// ── Write-offs ───────────────────────────────────────────────────────────────

export async function listWriteOffs({ shopCode = null, dateFrom = null, dateTo = null } = {}) {
  const pool = await appPool();
  const req = pool.request();
  const conds = [];
  if (shopCode) { req.input('shopCode', sql.NVarChar(50), shopCode); conds.push('[ShopCode]=@shopCode'); }
  if (dateFrom) { req.input('df', sql.Date, dateFrom); conds.push('[WriteOffDate] >= @df'); }
  if (dateTo)   { req.input('dt', sql.Date, dateTo);   conds.push('[WriteOffDate] <= @dt'); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const r = await req.query(`SELECT * FROM [dbo].[PosWriteOff] ${where} ORDER BY [WriteOffDate] DESC, [CreatedAt] DESC`);
  return r.recordset;
}

export async function postWriteOff({ writeOffDate, shopCode, itemNo, description, quantity, unitOfMeasure,
                                     unitCost, reason, notes, sourceTransferLineId, sourcePortioningId, createdBy }) {
  if (!shopCode || !itemNo || !quantity) throw new Error('shopCode, itemNo, quantity required');
  const pool = await appPool();
  const writeOffNo = await nextNo(pool, 'WO', 'PosWriteOff', 'WriteOffNo');
  const qty   = Math.abs(num(quantity));
  const uc    = num(unitCost);
  const total = Math.round(qty * uc * 10000) / 10000;
  const r = await pool.request()
    .input('writeOffNo',           sql.NVarChar(30),     writeOffNo)
    .input('writeOffDate',         sql.Date,             writeOffDate || new Date())
    .input('shopCode',             sql.NVarChar(50),     str(shopCode, 50).toUpperCase())
    .input('itemNo',               sql.NVarChar(30),     str(itemNo, 30).toUpperCase())
    .input('description',          sql.NVarChar(200),    str(description))
    .input('quantity',             sql.Decimal(18, 4),   qty)
    .input('uom',                  sql.NVarChar(20),     str(unitOfMeasure, 20) || null)
    .input('unitCost',             sql.Decimal(18, 4),   uc)
    .input('totalCost',            sql.Decimal(18, 4),   total)
    .input('reason',               sql.NVarChar(50),     str(reason, 50) || null)
    .input('notes',                sql.NVarChar(500),    str(notes, 500) || null)
    .input('sourceTransferLineId', sql.UniqueIdentifier, sourceTransferLineId || null)
    .input('sourcePortioningId',   sql.UniqueIdentifier, sourcePortioningId || null)
    .input('createdBy',            sql.NVarChar(100),    createdBy || null)
    .query(`
      INSERT INTO [dbo].[PosWriteOff]
        ([WriteOffNo],[WriteOffDate],[ShopCode],[ItemNo],[Description],[Quantity],[UnitOfMeasure],
         [UnitCost],[TotalCost],[Reason],[Notes],[SourceTransferLineId],[SourcePortioningId],[CreatedBy])
      OUTPUT INSERTED.[WriteOffId], INSERTED.[WriteOffNo]
      VALUES(@writeOffNo,@writeOffDate,@shopCode,@itemNo,@description,@quantity,@uom,
             @unitCost,@totalCost,@reason,@notes,@sourceTransferLineId,@sourcePortioningId,@createdBy)
    `);
  // Post stock movement (negative)
  await postMovement({
    shopCode, itemNo, description,
    movementType: 'write-off',
    quantity: -qty,
    unitPrice: uc,
    referenceType: 'writeoff', referenceId: r.recordset[0].WriteOffId, referenceNo: writeOffNo,
    movementDate: writeOffDate || new Date(),
    notes: reason || notes || null,
    createdBy,
  });
  return r.recordset[0];
}

// ── Manual sales (for portioned items not sold via POS terminal) ────────────

export async function listManualSales({ shopCode = null, dateFrom = null, dateTo = null } = {}) {
  const pool = await appPool();
  const req  = pool.request();
  const conds = [];
  if (shopCode) { req.input('shopCode', sql.NVarChar(50), shopCode); conds.push('[ShopCode]=@shopCode'); }
  if (dateFrom) { req.input('df', sql.Date, dateFrom); conds.push('[SaleDate] >= @df'); }
  if (dateTo)   { req.input('dt', sql.Date, dateTo);   conds.push('[SaleDate] <= @dt'); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const r = await req.query(`SELECT * FROM [dbo].[PosManualSale] ${where} ORDER BY [SaleDate] DESC, [CreatedAt] DESC`);
  return r.recordset;
}

/**
 * Bulk-record a batch of manual sales — atomic-ish (best-effort, line failures collected).
 * Each accepted line becomes one PosManualSale row + one stock-out movement.
 * Returns: { posted, failed, errors[] }
 */
export async function recordManualSalesBatch({ saleDate, shopCode, lines, notes = null, createdBy }) {
  if (!shopCode) throw new Error('shopCode required');
  if (!Array.isArray(lines) || !lines.length) throw new Error('lines required');
  const results = { posted: 0, failed: 0, errors: [] };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    try {
      if (!ln.itemNo) { throw new Error('itemNo required'); }
      const qty = Number(ln.quantity);
      if (!isFinite(qty) || qty <= 0) { throw new Error('quantity must be > 0'); }
      await recordManualSale({
        saleDate:      saleDate || ln.saleDate,
        shopCode,
        itemNo:        ln.itemNo,
        description:   ln.description || ln.itemNo,
        quantity:      qty,
        unitOfMeasure: ln.unitOfMeasure || 'KG',
        unitPrice:     Number(ln.unitPrice || 0),
        notes:         ln.notes || notes || null,
        createdBy,
      });
      results.posted += 1;
    } catch (e) {
      results.failed += 1;
      results.errors.push({ row: i + 1, itemNo: ln.itemNo || '', error: e.message });
    }
  }
  return results;
}

export async function recordManualSale({ saleDate, shopCode, itemNo, description, quantity,
                                          unitOfMeasure, unitPrice, notes, createdBy }) {
  if (!shopCode || !itemNo || !quantity) throw new Error('shopCode, itemNo, quantity required');
  const pool = await appPool();
  const manualSaleNo = await nextNo(pool, 'MS', 'PosManualSale', 'ManualSaleNo');
  const qty   = Math.abs(num(quantity));
  if (qty <= 0) throw new Error('Manual sale quantity must be positive — zero or negative sales are not allowed.');
  const up    = num(unitPrice);
  const total = Math.round(qty * up * 10000) / 10000;
  const r = await pool.request()
    .input('manualSaleNo', sql.NVarChar(30),    manualSaleNo)
    .input('saleDate',     sql.Date,            saleDate || new Date())
    .input('shopCode',     sql.NVarChar(50),    str(shopCode, 50).toUpperCase())
    .input('itemNo',       sql.NVarChar(30),    str(itemNo, 30).toUpperCase())
    .input('description',  sql.NVarChar(200),   str(description))
    .input('quantity',     sql.Decimal(18, 4),  qty)
    .input('uom',          sql.NVarChar(20),    str(unitOfMeasure, 20) || null)
    .input('unitPrice',    sql.Decimal(18, 4),  up)
    .input('totalAmount',  sql.Decimal(18, 4),  total)
    .input('notes',        sql.NVarChar(500),   str(notes, 500) || null)
    .input('createdBy',    sql.NVarChar(100),   createdBy || null)
    .query(`
      INSERT INTO [dbo].[PosManualSale]
        ([ManualSaleNo],[SaleDate],[ShopCode],[ItemNo],[Description],[Quantity],
         [UnitOfMeasure],[UnitPrice],[TotalAmount],[Notes],[CreatedBy])
      OUTPUT INSERTED.[ManualSaleId], INSERTED.[ManualSaleNo]
      VALUES(@manualSaleNo,@saleDate,@shopCode,@itemNo,@description,@quantity,
             @uom,@unitPrice,@totalAmount,@notes,@createdBy)
    `);
  // Post a stock-out movement so on-hand stays consistent
  await postMovement({
    shopCode, itemNo, description,
    movementType: 'sale',
    quantity:     -qty,
    unitPrice:    up,
    referenceType:'manual-sale',
    referenceId:  r.recordset[0].ManualSaleId,
    referenceNo:  manualSaleNo,
    movementDate: saleDate || new Date(),
    notes:        notes || 'Manual sale',
    createdBy,
  });
  return r.recordset[0];
}

// ── Yield report (the big one) ───────────────────────────────────────────────
/**
 * For each transfer in the period, return:
 *   source line + portionings produced + sales of those portion items + write-offs
 *   + computed yield-loss qty + net loss value + expected closing stock
 */
export async function yieldReport({ dateFrom, dateTo, shopCode = null }) {
  const pool = await appPool();
  const req  = pool.request().input('df', sql.Date, dateFrom).input('dt', sql.Date, dateTo);
  let shopFilter = '';
  if (shopCode) { req.input('shopCode', sql.NVarChar(50), shopCode); shopFilter = 'AND t.[DestinationShopCode]=@shopCode'; }

  // 1. Transfer headers + lines in period (for traceability detail).
  //    Even with NO transfers in the period, we still compute the portioning summary below.
  const transfersQ = await req.query(`
    SELECT t.[TransferId],t.[TransferNo],t.[TransferDate],t.[ThirdPartyName],
           t.[DestinationShopCode],t.[Status],t.[TotalCost],t.[Notes]
    FROM [dbo].[PosThirdPartyTransfer] t
    WHERE t.[TransferDate] BETWEEN @df AND @dt ${shopFilter}
    ORDER BY t.[TransferDate] DESC
  `);

  // 1a. Transfer line details — only when there are transfers
  let linesQ = { recordset: [] };
  if (transfersQ.recordset.length) {
    const transferIds = transfersQ.recordset.map(t => t.TransferId);
    const linesReq = pool.request();
    const idParams = transferIds.map((id, i) => { linesReq.input(`tid${i}`, sql.UniqueIdentifier, id); return `@tid${i}`; }).join(',');
    linesQ = await linesReq.query(`
      SELECT * FROM [dbo].[PosThirdPartyTransferLine]
      WHERE [TransferId] IN (${idParams})
    `);
  }

  // 2. Portionings posted/created in the period for this shop — independent of transfers.
  const portReq2 = pool.request().input('df2', sql.Date, dateFrom).input('dt2', sql.Date, dateTo);
  let portShopFilter = '';
  if (shopCode) { portReq2.input('psShop', sql.NVarChar(50), shopCode); portShopFilter = 'AND p.[ShopCode]=@psShop'; }
  const portInPeriodQ = await portReq2.query(`
    SELECT * FROM [dbo].[PosPortioning] p
    WHERE p.[PortioningDate] BETWEEN @df2 AND @dt2 ${portShopFilter}
    ORDER BY p.[PortioningDate] DESC
  `);
  let portRows = portInPeriodQ.recordset;
  let portLineRows = [];
  if (portRows.length) {
    const pl = pool.request();
    const pp = portRows.map((p, i) => { pl.input(`pid${i}`, sql.UniqueIdentifier, p.PortioningId); return `@pid${i}`; }).join(',');
    const portLnQ = await pl.query(`
      SELECT * FROM [dbo].[PosPortioningLine] WHERE [PortioningId] IN (${pp})
    `);
    portLineRows = portLnQ.recordset;
  }

  // 3. For all portion item nos, fetch sales (within period) and write-offs (within period)
  const portionItemNos = [...new Set(portLineRows.map(p => p.ItemNo))];
  const salesByItem = new Map();
  const writeOffsByItem = new Map();
  if (portionItemNos.length) {
    const sReq = pool.request().input('df', sql.Date, dateFrom).input('dt', sql.Date, dateTo);
    if (shopCode) sReq.input('shopCode', sql.NVarChar(50), shopCode);
    portionItemNos.forEach((no, i) => sReq.input(`s${i}`, sql.NVarChar(30), no));
    const inList = portionItemNos.map((_, i) => `@s${i}`).join(',');
    const shopFilter2 = shopCode ? 'AND o.[ShopCode]=@shopCode' : '';

    // POS sales + manual sales unioned per item
    const salesQ = await sReq.query(`
      SELECT [ItemNo], SUM([Qty]) AS Qty, SUM([Value]) AS Value FROM (
        SELECT ol.[ItemNo],
               ol.[Quantity]    AS Qty,
               ol.[LineAmount]  AS Value
        FROM   [dbo].[PosOrderLine] ol
        JOIN   [dbo].[PosOrder]    o  ON o.[OrderId] = ol.[OrderId]
        WHERE  o.[Status] = 'paid'
          AND  CAST(o.[CreatedAt] AS DATE) BETWEEN @df AND @dt
          AND  ol.[ItemNo] IN (${inList})
          ${shopFilter2}
        UNION ALL
        SELECT ms.[ItemNo],
               ms.[Quantity]    AS Qty,
               ms.[TotalAmount] AS Value
        FROM   [dbo].[PosManualSale] ms
        WHERE  ms.[SaleDate] BETWEEN @df AND @dt
          AND  ms.[ItemNo] IN (${inList})
          ${shopCode ? 'AND ms.[ShopCode]=@shopCode' : ''}
      ) sales
      GROUP BY [ItemNo]
    `);
    for (const row of salesQ.recordset) {
      salesByItem.set(row.ItemNo, { qty: Number(row.Qty || 0), value: Number(row.Value || 0) });
    }

    const woReq = pool.request().input('df', sql.Date, dateFrom).input('dt', sql.Date, dateTo);
    if (shopCode) woReq.input('shopCode', sql.NVarChar(50), shopCode);
    portionItemNos.forEach((no, i) => woReq.input(`w${i}`, sql.NVarChar(30), no));
    const winList = portionItemNos.map((_, i) => `@w${i}`).join(',');
    const woShopFilter = shopCode ? 'AND [ShopCode]=@shopCode' : '';
    const woQ = await woReq.query(`
      SELECT [ItemNo],
             SUM([Quantity])  AS Qty,
             SUM([TotalCost]) AS Value
      FROM   [dbo].[PosWriteOff]
      WHERE  [WriteOffDate] BETWEEN @df AND @dt
        AND  [ItemNo] IN (${winList})
        ${woShopFilter}
      GROUP BY [ItemNo]
    `);
    for (const row of woQ.recordset) {
      writeOffsByItem.set(row.ItemNo, { qty: Number(row.Qty || 0), value: Number(row.Value || 0) });
    }
  }

  // 4. Stitch the report
  const linesByTransfer = new Map();
  for (const ln of linesQ.recordset) {
    if (!linesByTransfer.has(ln.TransferId)) linesByTransfer.set(ln.TransferId, []);
    linesByTransfer.get(ln.TransferId).push(ln);
  }
  const portsByLine = new Map();
  for (const p of portRows) {
    if (!portsByLine.has(p.SourceTransferLineId)) portsByLine.set(p.SourceTransferLineId, []);
    portsByLine.get(p.SourceTransferLineId).push(p);
  }
  const portLinesByPortioning = new Map();
  for (const pl of portLineRows) {
    if (!portLinesByPortioning.has(pl.PortioningId)) portLinesByPortioning.set(pl.PortioningId, []);
    portLinesByPortioning.get(pl.PortioningId).push(pl);
  }

  const out = [];
  for (const t of transfersQ.recordset) {
    const tLines = linesByTransfer.get(t.TransferId) || [];
    const reportLines = tLines.map(ln => {
      const portionings = (portsByLine.get(ln.LineId) || []);
      // Aggregate portion outputs across all portionings of this source line
      const portionAgg = new Map();   // itemNo → { description, uom, qty, cost }
      for (const p of portionings) {
        const portLines = portLinesByPortioning.get(p.PortioningId) || [];
        for (const pl of portLines) {
          const cur = portionAgg.get(pl.ItemNo) || { description: pl.Description, uom: pl.UnitOfMeasure, qty: 0, cost: 0 };
          cur.qty  += Number(pl.Quantity);
          cur.cost += Number(pl.AllocatedCost);
          portionAgg.set(pl.ItemNo, cur);
        }
      }
      const portionsList = [...portionAgg.entries()].map(([itemNo, agg]) => {
        const sales   = salesByItem.get(itemNo)     || { qty: 0, value: 0 };
        const wOffs   = writeOffsByItem.get(itemNo) || { qty: 0, value: 0 };
        const expQty  = agg.qty - sales.qty - wOffs.qty;
        const unitCost= agg.qty > 0 ? agg.cost / agg.qty : 0;
        // Final variance per portion = portioned - sold - written-off (both qty and cost-basis)
        const soldAtCost     = sales.qty * unitCost;
        const finalVarQty    = agg.qty   - sales.qty   - wOffs.qty;
        const finalVarValue  = agg.cost  - soldAtCost  - wOffs.value;
        return {
          itemNo, description: agg.description, uom: agg.uom,
          producedQty: round4(agg.qty),
          allocatedCost: round4(agg.cost),
          unitCost: round4(unitCost),
          salesQty: round4(sales.qty),  salesValue: round4(sales.value),
          writeOffQty: round4(wOffs.qty), writeOffValue: round4(wOffs.value),
          expectedStockQty:   round4(expQty),
          expectedStockValue: round4(expQty * unitCost),
          finalVarianceQty:   round4(finalVarQty),
          finalVarianceValue: round4(finalVarValue),
        };
      });
      const sourceQty   = Number(ln.Quantity);
      const sourceCost  = Number(ln.LineCost);
      const totalPortionQty    = portionsList.reduce((s, p) => s + p.producedQty,        0);
      const totalPortionCost   = portionsList.reduce((s, p) => s + p.allocatedCost,      0);
      const totalSalesQty      = portionsList.reduce((s, p) => s + p.salesQty,           0);
      const totalSalesValue    = portionsList.reduce((s, p) => s + p.salesValue,         0);
      const totalWriteOffQty   = portionsList.reduce((s, p) => s + p.writeOffQty,        0);
      const totalWriteOffValue = portionsList.reduce((s, p) => s + p.writeOffValue,      0);
      const totalStockValue    = portionsList.reduce((s, p) => s + p.expectedStockValue, 0);
      const totalFinalVarQty   = portionsList.reduce((s, p) => s + p.finalVarianceQty,   0);
      const totalFinalVarValue = portionsList.reduce((s, p) => s + p.finalVarianceValue, 0);
      // Yield variance = source MINUS portioned (the cutting/processing loss)
      const yieldVarianceQty   = round4(sourceQty  - totalPortionQty);
      const yieldVarianceValue = round4(sourceCost - totalPortionCost);
      return {
        lineId: ln.LineId,
        sourceItemNo: ln.ItemNo, sourceDescription: ln.Description,
        sourceQty, sourceUom: ln.UnitOfMeasure, sourceUnitCost: Number(ln.UnitCost),
        sourceCost,
        portions: portionsList,
        totals: {
          portionQty:         round4(totalPortionQty),
          portionCost:        round4(totalPortionCost),
          // Yield variance — the loss between source and portioned
          yieldVarianceQty,
          yieldVarianceValue,
          // Sales (POS + manual)
          salesQty:           round4(totalSalesQty),
          salesValue:         round4(totalSalesValue),
          // Write-offs
          writeOffQty:        round4(totalWriteOffQty),
          writeOffValue:      round4(totalWriteOffValue),
          // Expected stock (= what's still on hand at cost)
          stockValue:         round4(totalStockValue),
          // Final variance — portioned minus sold minus written-off
          finalVarianceQty:   round4(totalFinalVarQty),
          finalVarianceValue: round4(totalFinalVarValue),
        },
      };
    });
    out.push({
      transferId: t.TransferId, transferNo: t.TransferNo, transferDate: t.TransferDate,
      thirdPartyName: t.ThirdPartyName, destinationShopCode: t.DestinationShopCode,
      status: t.Status, totalCost: Number(t.TotalCost),
      lines: reportLines,
    });
  }

  // 5. Flat vector summation across every portioning in the period.
  //    Per output item: produced (qty/value at market price), sold, written-off,
  //    expected stock and yield gain/loss in both qty and value.
  //    AllocatedCost on PosPortioningLine is now stored as qty × catalogue unit price,
  //    so it represents the market value of produced output.
  const flatAgg = new Map();   // itemNo → { description, uom, producedQty, producedValue }
  for (const pl of portLineRows) {
    const cur = flatAgg.get(pl.ItemNo) || {
      itemNo: pl.ItemNo, description: pl.Description, uom: pl.UnitOfMeasure || 'KG',
      producedQty: 0, producedValue: 0,
    };
    cur.producedQty   += Number(pl.Quantity);
    cur.producedValue += Number(pl.AllocatedCost);
    flatAgg.set(pl.ItemNo, cur);
  }
  const summary = [...flatAgg.values()].map(a => {
    const sales  = salesByItem.get(a.itemNo)     || { qty: 0, value: 0 };
    const wOffs  = writeOffsByItem.get(a.itemNo) || { qty: 0, value: 0 };
    const unitPrice = a.producedQty > 0 ? a.producedValue / a.producedQty : 0;
    const stockQty   = a.producedQty   - sales.qty   - wOffs.qty;
    const stockValue = stockQty * unitPrice;
    // Yield gain/loss = produced − (sold + written-off + remaining stock).  In an ideal world this is 0;
    // a positive number means we lost (or under-counted) somewhere; negative = gained.
    const lossQty   = a.producedQty   - sales.qty   - wOffs.qty - stockQty;
    const lossValue = a.producedValue - sales.value - wOffs.value - stockValue;
    return {
      itemNo: a.itemNo, description: a.description, uom: a.uom,
      unitPrice:      round4(unitPrice),
      producedQty:    round4(a.producedQty),
      producedValue:  round4(a.producedValue),
      salesQty:       round4(sales.qty),
      salesValue:     round4(sales.value),
      writeOffQty:    round4(wOffs.qty),
      writeOffValue:  round4(wOffs.value),
      expectedStockQty:   round4(stockQty),
      expectedStockValue: round4(stockValue),
      lossQty:        round4(lossQty),
      lossValue:      round4(lossValue),
    };
  }).sort((a, b) => a.description.localeCompare(b.description));

  // Return both shapes — front-end can show summary prominently and detail below.
  return { transfers: out, summary };
}

function round4(v) { return Math.round(Number(v || 0) * 10000) / 10000; }
