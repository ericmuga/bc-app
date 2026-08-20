/**
 * models/PosProductionModel.js
 * Production orders: build a finished POS item from its BOM (PosBom), let the
 * operator key ACTUAL consumption (prefilled with the BOM standard), add overhead
 * (service) lines for costing, and on POST avail the finished stock to the POS
 * (produce-in) while consuming components (consume-out). Service/overhead lines
 * never touch inventory. BC push (WMS tables) is a separate step.
 */
import { db as appDb, sql } from '../db/pool.js';
import { postMovement } from './PosStockModel.js';
import { getBom } from './PosBomModel.js';
import logger from '../services/logger.js';

const appPool = () => appDb.getPool();
const num  = (v) => (isNaN(Number(v)) ? 0 : Number(v));
const r4   = (n) => Math.round(num(n) * 10000) / 10000;
const str  = (v, n) => (v == null ? '' : String(v)).slice(0, n ?? 4000);

function yyyymmdd(d = new Date()) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function nextProdOrderNo(pool) {
  const day = yyyymmdd();
  const r = await pool.request()
    .input('like', sql.NVarChar(30), `PRD-${day}-%`)
    .query(`SELECT COUNT(*) AS N FROM [dbo].[PosProductionOrder] WHERE [OrderNo] LIKE @like`);
  const seq = Number(r.recordset[0]?.N || 0) + 1;
  return `PRD-${day}-${String(seq).padStart(3, '0')}`;
}

/** Item master lookups (description, uom, service flag) for a set of item nos. */
async function itemMeta(pool, itemNos) {
  const out = new Map();
  const uniq = [...new Set(itemNos.map((n) => String(n || '').toUpperCase()).filter(Boolean))];
  if (!uniq.length) return out;
  const req = pool.request();
  uniq.forEach((n, i) => req.input(`i${i}`, sql.NVarChar(30), n));
  const hasSvc  = await columnExists(pool, 'PosItem', 'IsService');
  const hasBase = await columnExists(pool, 'PosItem', 'BaseUnitOfMeasure');
  // BOM / production quantities are in BASE units (the inventory ledger is), so
  // report the base UoM (fall back to the sales UoM when none set).
  const uomExpr = hasBase ? `COALESCE(NULLIF([BaseUnitOfMeasure],''),[UnitOfMeasure])` : `[UnitOfMeasure]`;
  const r = await req.query(`
    SELECT UPPER([ItemNo]) AS ItemNo, [Description], ${uomExpr} AS Uom, [UnitPrice] AS UnitPrice
           ${hasSvc ? ', [IsService]' : ', CAST(0 AS BIT) AS IsService'}
    FROM [dbo].[PosItem] WHERE UPPER([ItemNo]) IN (${uniq.map((_, i) => `@i${i}`).join(',')})`);
  for (const x of r.recordset) out.set(x.ItemNo, { description: x.Description || '', uom: x.Uom || '', unitPrice: Number(x.UnitPrice || 0), isService: !!x.IsService });
  return out;
}

async function columnExists(pool, table, col) {
  const r = await pool.request()
    .query(`SELECT COL_LENGTH('dbo.${table}','${col}') AS L`);
  return r.recordset[0]?.L != null;
}

/**
 * Create a production order for a finished item that has an (active) BOM.
 * Component lines are pre-filled from the BOM × outputQty (standard = actual).
 */
export async function createProductionOrder({ shopCode, company = null, locationCode = null, outputItemNo, outputQty, userId = null, userName = null }) {
  const pool = await appPool();
  const finished = String(outputItemNo || '').toUpperCase();
  const qty = r4(outputQty);
  if (!finished) throw new Error('outputItemNo is required');
  if (qty <= 0) throw new Error('outputQty must be positive');

  const bom = await getBom(finished);
  if (!bom || !bom.IsActive) { const e = new Error(`No active BOM/recipe for ${finished}`); e.code = 'NO_BOM'; throw e; }

  const metaNos = [finished, ...bom.lines.map((l) => l.ComponentItemNo)];
  const meta = await itemMeta(pool, metaNos);
  const fin = meta.get(finished) || {};
  const orderNo = await nextProdOrderNo(pool);

  const tx = new sql.Transaction(pool);
  await tx.begin();
  let prodOrderId;
  try {
    const hdr = await new sql.Request(tx)
      .input('orderNo',  sql.NVarChar(30),  orderNo)
      .input('shopCode', sql.NVarChar(50),  shopCode ? String(shopCode).toUpperCase() : null)
      .input('company',  sql.NVarChar(20),  company ? String(company).toUpperCase() : null)
      .input('loc',      sql.NVarChar(20),  locationCode || null)
      .input('itemNo',   sql.NVarChar(30),  finished)
      .input('desc',     sql.NVarChar(200), bom.Description || fin.description || finished)
      .input('uom',      sql.NVarChar(20),  bom.OutputUom || fin.uom || null)
      .input('qty',      sql.Decimal(18, 4), qty)
      .input('bomId',    sql.UniqueIdentifier, bom.BomId)
      .input('by',       sql.NVarChar(100), str(userName || userId, 100) || null)
      .query(`
        INSERT INTO [dbo].[PosProductionOrder]
          ([OrderNo],[ShopCode],[Company],[LocationCode],[OutputItemNo],[OutputDescription],[OutputUom],[OutputQty],[BomId],[Status],[CreatedBy])
        OUTPUT INSERTED.[ProdOrderId]
        VALUES (@orderNo,@shopCode,@company,@loc,@itemNo,@desc,@uom,@qty,@bomId,'open',@by)`);
    prodOrderId = hdr.recordset[0].ProdOrderId;

    let seq = 0;
    for (const l of bom.lines) {
      const std = r4(Number(l.QtyPer) * qty);
      const m = meta.get(String(l.ComponentItemNo).toUpperCase()) || {};
      await new sql.Request(tx)
        .input('poId', sql.UniqueIdentifier, prodOrderId)
        .input('type', sql.NVarChar(20),  'component')
        .input('itemNo', sql.NVarChar(30), String(l.ComponentItemNo).toUpperCase())
        .input('desc', sql.NVarChar(200), l.Description || m.description || null)
        .input('uom',  sql.NVarChar(20),  l.Uom || bom.OutputUom || fin.uom || null)
        .input('std',  sql.Decimal(18, 4), std)
        .input('act',  sql.Decimal(18, 4), std)
        .input('svc',  sql.Bit,           m.isService ? 1 : 0)
        .input('cost', sql.Decimal(18, 4), m.unitPrice ?? null)
        .input('sort', sql.Int,           seq++)
        .query(`INSERT INTO [dbo].[PosProductionLine]
          ([ProdOrderId],[LineType],[ItemNo],[Description],[Uom],[StandardQty],[ActualQty],[IsService],[UnitCost],[SortOrder])
          VALUES (@poId,@type,@itemNo,@desc,@uom,@std,@act,@svc,@cost,@sort)`);
    }
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }

  logger.info('production order created', { orderNo, shopCode, outputItemNo: finished, outputQty: qty });
  return getProductionOrder(prodOrderId);
}

// Build an item's valid UoM matrix from base/sales + factor (base units per sales
// unit). Each entry: { code, factorToBase } — base is 1, sales is qtyPerSalesUnit.
export function buildItemUoms(baseUom, salesUom, qtyPerSalesUnit) {
  const base = String(baseUom || '').trim();
  const sales = String(salesUom || '').trim();
  const factor = Number(qtyPerSalesUnit) || 1;
  const list = [];
  if (base) list.push({ code: base, factorToBase: 1 });
  if (sales && sales.toUpperCase() !== base.toUpperCase()) list.push({ code: sales, factorToBase: factor });
  if (!list.length) list.push({ code: base || sales || '', factorToBase: 1 });
  return list;
}

/** All active POS items with their UoM matrix (base/sales + factor) — for BOM/production pickers. */
export async function listCatalogueItems() {
  const pool = await appPool();
  const hasSvc  = await columnExists(pool, 'PosItem', 'IsService');
  const hasBase = await columnExists(pool, 'PosItem', 'BaseUnitOfMeasure');
  const cols = hasBase
    ? `[BaseUnitOfMeasure] AS BaseUom, [SalesUnitOfMeasure] AS SalesUom, ISNULL(NULLIF([QtyPerSalesUnit],0),1) AS QtyPerSalesUnit`
    : `[UnitOfMeasure] AS BaseUom, CAST(NULL AS NVARCHAR(20)) AS SalesUom, CAST(1 AS DECIMAL(18,6)) AS QtyPerSalesUnit`;
  const r = await pool.request().query(`
    SELECT [ItemNo], [Description], [UnitOfMeasure] AS Uom, ${cols}${hasSvc ? ', ISNULL([IsService],0) AS IsService' : ', CAST(0 AS BIT) AS IsService'}
    FROM [dbo].[PosItem] WHERE [IsActive]=1 ORDER BY [Description],[ItemNo]`);
  return r.recordset.map((x) => {
    const baseUom = (x.BaseUom || x.Uom || '').trim();
    const salesUom = (x.SalesUom || '').trim();
    const qtyPerSalesUnit = Number(x.QtyPerSalesUnit) || 1;
    return {
      itemNo: x.ItemNo, description: x.Description || x.ItemNo,
      uom: baseUom, baseUom, salesUom, qtyPerSalesUnit,
      uoms: buildItemUoms(baseUom, salesUom, qtyPerSalesUnit),
      isService: !!x.IsService,
    };
  });
}

/** UoM matrix per item (base/sales + factor) for a set of item nos — for translation at post/push. */
async function itemUomMatrix(pool, itemNos) {
  const out = new Map();
  const uniq = [...new Set(itemNos.map((n) => String(n || '').toUpperCase()).filter(Boolean))];
  if (!uniq.length) return out;
  const hasBase = await columnExists(pool, 'PosItem', 'BaseUnitOfMeasure');
  const req = pool.request();
  uniq.forEach((n, i) => req.input(`i${i}`, sql.NVarChar(30), n));
  const cols = hasBase
    ? `[BaseUnitOfMeasure] AS BaseUom, [SalesUnitOfMeasure] AS SalesUom, ISNULL(NULLIF([QtyPerSalesUnit],0),1) AS QtyPerSalesUnit`
    : `[UnitOfMeasure] AS BaseUom, CAST(NULL AS NVARCHAR(20)) AS SalesUom, CAST(1 AS DECIMAL(18,6)) AS QtyPerSalesUnit`;
  const r = await req.query(`SELECT UPPER([ItemNo]) AS ItemNo, [UnitOfMeasure] AS Uom, ${cols} FROM [dbo].[PosItem] WHERE UPPER([ItemNo]) IN (${uniq.map((_, i) => `@i${i}`).join(',')})`);
  for (const x of r.recordset) {
    const baseUom = (x.BaseUom || x.Uom || '').trim();
    out.set(x.ItemNo, { baseUom, salesUom: (x.SalesUom || '').trim(), qtyPerSalesUnit: Number(x.QtyPerSalesUnit) || 1 });
  }
  return out;
}

// Factor to convert a quantity in `uom` to BASE units for a given item's matrix.
function factorToBase(meta, uom) {
  if (!meta) return { factor: 1, baseUom: uom || '' };
  const u = String(uom || '').trim().toUpperCase();
  if (meta.salesUom && u === meta.salesUom.toUpperCase() && meta.salesUom.toUpperCase() !== meta.baseUom.toUpperCase()) {
    return { factor: meta.qtyPerSalesUnit, baseUom: meta.baseUom };
  }
  return { factor: 1, baseUom: meta.baseUom || uom || '' };
}

/** Service/overhead items only (IsService=1) — for the production overhead picker. */
export async function listServiceItems() {
  const pool = await appPool();
  if (!(await columnExists(pool, 'PosItem', 'IsService'))) return [];
  const r = await pool.request().query(`
    SELECT [ItemNo], [Description], [UnitOfMeasure] AS Uom, [UnitPrice] AS UnitPrice
    FROM [dbo].[PosItem] WHERE [IsService]=1 AND [IsActive]=1
    ORDER BY [Description], [ItemNo]`);
  return r.recordset.map((x) => ({ itemNo: x.ItemNo, description: x.Description || x.ItemNo, uom: x.Uom || '', unitPrice: Number(x.UnitPrice || 0) }));
}

export async function getProductionOrder(prodOrderId) {
  const pool = await appPool();
  const h = await pool.request().input('id', sql.UniqueIdentifier, prodOrderId)
    .query(`SELECT * FROM [dbo].[PosProductionOrder] WHERE [ProdOrderId]=@id`);
  const hdr = h.recordset[0];
  if (!hdr) return null;
  const l = await pool.request().input('id', sql.UniqueIdentifier, prodOrderId)
    .query(`SELECT * FROM [dbo].[PosProductionLine] WHERE [ProdOrderId]=@id ORDER BY [SortOrder],[ItemNo]`);
  return {
    prodOrderId: hdr.ProdOrderId, orderNo: hdr.OrderNo, shopCode: hdr.ShopCode, company: hdr.Company,
    locationCode: hdr.LocationCode, outputItemNo: hdr.OutputItemNo, outputDescription: hdr.OutputDescription,
    outputUom: hdr.OutputUom, outputQty: Number(hdr.OutputQty || 0), bomId: hdr.BomId, status: hdr.Status,
    notes: hdr.Notes || '', bcOrderNo: hdr.BcOrderNo || '', postedAt: hdr.PostedAt, createdAt: hdr.CreatedAt,
    createdBy: hdr.CreatedBy || '', postedBy: hdr.PostedBy || '',
    lines: l.recordset.map((x) => ({
      prodLineId: x.ProdLineId, lineType: x.LineType, itemNo: x.ItemNo, description: x.Description || '',
      uom: x.Uom || '', standardQty: Number(x.StandardQty || 0), actualQty: Number(x.ActualQty || 0),
      isService: !!x.IsService, unitCost: x.UnitCost == null ? null : Number(x.UnitCost), sortOrder: x.SortOrder,
    })),
  };
}

export async function listProductionOrders({ shopCode = null } = {}) {
  const pool = await appPool();
  const req = pool.request();
  let where = '';
  if (shopCode) { req.input('shop', sql.NVarChar(50), String(shopCode).toUpperCase()); where = 'WHERE [ShopCode]=@shop'; }
  const r = await req.query(`
    SELECT o.*, (SELECT COUNT(*) FROM [dbo].[PosProductionLine] l WHERE l.[ProdOrderId]=o.[ProdOrderId]) AS LineCount
    FROM [dbo].[PosProductionOrder] o ${where} ORDER BY o.[CreatedAt] DESC`);
  return r.recordset.map((h) => ({
    prodOrderId: h.ProdOrderId, orderNo: h.OrderNo, shopCode: h.ShopCode, company: h.Company,
    outputItemNo: h.OutputItemNo, outputDescription: h.OutputDescription, outputUom: h.OutputUom,
    outputQty: Number(h.OutputQty || 0), status: h.Status, lineCount: Number(h.LineCount || 0),
    bcOrderNo: h.BcOrderNo || '', postedAt: h.PostedAt, createdAt: h.CreatedAt, createdBy: h.CreatedBy || '',
  }));
}

/** Replace the editable lines (actual qty + overhead lines) of an OPEN order. */
export async function setProductionLines(prodOrderId, lines) {
  const pool = await appPool();
  const cur = await getProductionOrder(prodOrderId);
  if (!cur) throw new Error('Production order not found');
  if (cur.status !== 'open') throw new Error(`Cannot edit a ${cur.status} production order`);
  const clean = (Array.isArray(lines) ? lines : []).map((l, i) => ({
    lineType:    ['component', 'overhead'].includes(l.lineType) ? l.lineType : 'component',
    itemNo:      String(l.itemNo || '').toUpperCase(),
    description: str(l.description, 200) || null,
    uom:         str(l.uom, 20) || null,
    standardQty: r4(l.standardQty),
    actualQty:   r4(l.actualQty),
    isService:   !!l.isService,
    unitCost:    l.unitCost == null || l.unitCost === '' ? null : r4(l.unitCost),
    sortOrder:   Number.isFinite(+l.sortOrder) ? +l.sortOrder : i,
  })).filter((l) => l.itemNo);

  // Resolve isService from the item master for any line that didn't declare it.
  const meta = await itemMeta(pool, clean.map((l) => l.itemNo));
  for (const l of clean) {
    if (l.lineType === 'overhead') l.isService = true;
    else if (!l.isService) l.isService = !!meta.get(l.itemNo)?.isService;
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx).input('id', sql.UniqueIdentifier, prodOrderId)
      .query(`DELETE FROM [dbo].[PosProductionLine] WHERE [ProdOrderId]=@id`);
    for (const l of clean) {
      await new sql.Request(tx)
        .input('poId', sql.UniqueIdentifier, prodOrderId)
        .input('type', sql.NVarChar(20), l.lineType)
        .input('itemNo', sql.NVarChar(30), l.itemNo)
        .input('desc', sql.NVarChar(200), l.description)
        .input('uom', sql.NVarChar(20), l.uom)
        .input('std', sql.Decimal(18, 4), l.standardQty)
        .input('act', sql.Decimal(18, 4), l.actualQty)
        .input('svc', sql.Bit, l.isService ? 1 : 0)
        .input('cost', sql.Decimal(18, 4), l.unitCost)
        .input('sort', sql.Int, l.sortOrder)
        .query(`INSERT INTO [dbo].[PosProductionLine]
          ([ProdOrderId],[LineType],[ItemNo],[Description],[Uom],[StandardQty],[ActualQty],[IsService],[UnitCost],[SortOrder])
          VALUES (@poId,@type,@itemNo,@desc,@uom,@std,@act,@svc,@cost,@sort)`);
    }
    await new sql.Request(tx).input('id', sql.UniqueIdentifier, prodOrderId)
      .query(`UPDATE [dbo].[PosProductionOrder] SET [UpdatedAt]=GETUTCDATE() WHERE [ProdOrderId]=@id`);
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
  return getProductionOrder(prodOrderId);
}

export async function updateProductionHeader(prodOrderId, { outputQty, notes } = {}) {
  const pool = await appPool();
  const cur = await getProductionOrder(prodOrderId);
  if (!cur) throw new Error('Production order not found');
  if (cur.status !== 'open') throw new Error(`Cannot edit a ${cur.status} production order`);
  await pool.request()
    .input('id', sql.UniqueIdentifier, prodOrderId)
    .input('qty', sql.Decimal(18, 4), outputQty != null ? r4(outputQty) : cur.outputQty)
    .input('notes', sql.NVarChar(500), notes != null ? str(notes, 500) : cur.notes)
    .query(`UPDATE [dbo].[PosProductionOrder] SET [OutputQty]=@qty,[Notes]=@notes,[UpdatedAt]=GETUTCDATE() WHERE [ProdOrderId]=@id`);
  return getProductionOrder(prodOrderId);
}

/**
 * Post the order: consume components (actual qty, non-service) and produce the
 * output — availing it to the POS immediately. Overhead/service lines are costed
 * only (no inventory). Idempotent: a posted order is returned unchanged.
 */
export async function postProductionOrder(prodOrderId, { userId = null, userName = null } = {}) {
  const pool = await appPool();
  const order = await getProductionOrder(prodOrderId);
  if (!order) throw new Error('Production order not found');
  if (order.status === 'posted') return order;
  if (order.status !== 'open') throw new Error(`Cannot post a ${order.status} production order`);
  if (!order.shopCode) throw new Error('Production order has no shop/terminal — cannot post inventory');

  const ref = order.orderNo;
  const common = { shopCode: order.shopCode, referenceType: 'production', referenceId: prodOrderId, referenceNo: ref, createdBy: userName || userId, movementDate: new Date() };

  // UoMs on both the output and the components are picked from the FINISHED item's
  // UoM matrix, and the stock ledger is in BASE units — so translate every posted
  // qty via the finished item's matrix factor (base units per chosen unit).
  const matrix = await itemUomMatrix(pool, [order.outputItemNo]);
  const outMeta = matrix.get(String(order.outputItemNo).toUpperCase());

  // Consume components (guarded against negative stock by postMovement).
  for (const l of order.lines) {
    if (l.lineType !== 'component' || l.isService) continue;
    const q = r4(l.actualQty);
    if (q <= 0) continue;
    const { factor } = factorToBase(outMeta, l.uom);
    const qBase = r4(q * factor);
    await postMovement({ ...common, itemNo: l.itemNo, description: l.description, movementType: 'consume-out', quantity: -qBase, notes: `Consumed ${q} ${l.uom || ''} for ${ref}`.trim() });
  }
  // Produce the finished good (translated to base units).
  const outFactor = factorToBase(outMeta, order.outputUom);
  const outBase = r4(Number(order.outputQty) * outFactor.factor);
  await postMovement({ ...common, itemNo: order.outputItemNo, description: order.outputDescription, movementType: 'produce-in', quantity: outBase, notes: `Produced ${order.outputQty} ${order.outputUom || ''} by ${ref}`.trim() });

  await pool.request()
    .input('id', sql.UniqueIdentifier, prodOrderId)
    .input('by', sql.NVarChar(100), str(userName || userId, 100) || null)
    .query(`UPDATE [dbo].[PosProductionOrder] SET [Status]='posted',[PostedAt]=GETUTCDATE(),[PostedBy]=@by,[UpdatedAt]=GETUTCDATE() WHERE [ProdOrderId]=@id`);

  logger.info('production order posted', { orderNo: ref, shopCode: order.shopCode, outputItemNo: order.outputItemNo, outputQty: order.outputQty });
  return getProductionOrder(prodOrderId);
}

/**
 * Resolve an order's output + component quantities into BASE units and the base
 * UoM, using each item's UoM matrix. Used by the BC push so BC posts base units.
 */
export async function resolveBaseQuantities(order) {
  const pool = await appPool();
  // All UoMs (output + components) come from the finished item's matrix.
  const matrix = await itemUomMatrix(pool, [order.outputItemNo]);
  const outMeta = matrix.get(String(order.outputItemNo).toUpperCase());
  const out = factorToBase(outMeta, order.outputUom);
  return {
    output: { itemNo: order.outputItemNo, qtyBase: r4(Number(order.outputQty) * out.factor), baseUom: out.baseUom || order.outputUom || '' },
    lines: order.lines.map((l) => {
      const f = factorToBase(outMeta, l.uom);
      return { ...l, qtyBase: r4(Number(l.actualQty) * f.factor), baseUom: f.baseUom || l.uom || '' };
    }),
  };
}

export async function cancelProductionOrder(prodOrderId) {
  const pool = await appPool();
  const cur = await getProductionOrder(prodOrderId);
  if (!cur) throw new Error('Production order not found');
  if (cur.status === 'posted') throw new Error('Cannot cancel a posted production order');
  await pool.request().input('id', sql.UniqueIdentifier, prodOrderId)
    .query(`UPDATE [dbo].[PosProductionOrder] SET [Status]='cancelled',[UpdatedAt]=GETUTCDATE() WHERE [ProdOrderId]=@id`);
  return getProductionOrder(prodOrderId);
}
