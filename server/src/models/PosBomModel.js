/**
 * models/PosBomModel.js
 * POS make-to-order: bill-of-materials CRUD, production planning, and the
 * produce-from-BOM posting routine.
 *
 * A finished POS item (PosBom.ItemNo) has N component lines (PosBomLine); each
 * line's QtyPer is the component quantity consumed to produce ONE finished unit.
 * Producing `qty` finished units posts, per component, a negative `consume-out`
 * movement (QtyPer × qty) and one positive `produce-in` movement for the
 * finished good — all through PosStockModel so the negative-stock guard applies.
 */
import { db as appDb, sql } from '../db/pool.js';
import { postMovement, onHandMany } from './PosStockModel.js';
import logger from '../services/logger.js';

const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const num = (v) => (isNaN(Number(v)) ? 0 : Number(v));
async function pool() { return appDb.getPool(); }

// ── CRUD ──────────────────────────────────────────────────────────────────────

/** List every BOM header with its component count. */
export async function listBoms() {
  const p = await pool();
  const r = await p.request().query(`
    SELECT b.[BomId], b.[ItemNo], b.[IsActive], b.[Notes], b.[UpdatedAt],
           (SELECT COUNT(*) FROM [dbo].[PosBomLine] l WHERE l.[BomId] = b.[BomId]) AS ComponentCount
    FROM [dbo].[PosBom] b
    ORDER BY b.[ItemNo]
  `);
  return r.recordset;
}

/** Full BOM (header + lines) for a finished item, or null. */
export async function getBom(itemNo) {
  const p = await pool();
  const hdr = await p.request()
    .input('itemNo', sql.NVarChar(30), str(itemNo, 30).toUpperCase())
    .query(`SELECT * FROM [dbo].[PosBom] WHERE [ItemNo] = @itemNo`);
  if (!hdr.recordset.length) return null;
  const bom = hdr.recordset[0];
  const lines = await p.request()
    .input('bomId', sql.UniqueIdentifier, bom.BomId)
    .query(`
      SELECT [BomLineId], [ComponentItemNo], [Description], [QtyPer], [Uom], [SortOrder]
      FROM [dbo].[PosBomLine] WHERE [BomId] = @bomId
      ORDER BY [SortOrder], [ComponentItemNo]
    `);
  return { ...bom, lines: lines.recordset };
}

/**
 * Upsert a BOM (header + full line replacement).
 * @param {object} body { itemNo, isActive, notes, lines:[{componentItemNo, description, qtyPer, uom, sortOrder}] }
 */
export async function saveBom(body) {
  const itemNo = str(body?.itemNo, 30).toUpperCase();
  if (!itemNo) throw new Error('itemNo (finished item) is required');
  const lines = (Array.isArray(body?.lines) ? body.lines : [])
    .map((l, i) => ({
      componentItemNo: str(l.componentItemNo, 30).toUpperCase(),
      description:     str(l.description, 200) || null,
      qtyPer:          num(l.qtyPer),
      uom:             str(l.uom, 20) || null,
      sortOrder:       Number.isFinite(+l.sortOrder) ? +l.sortOrder : i,
    }))
    .filter((l) => l.componentItemNo && l.qtyPer > 0);
  if (!lines.length) throw new Error('At least one component line with a positive qty-per-unit is required');
  if (lines.some((l) => l.componentItemNo === itemNo)) {
    throw new Error('A finished item cannot be its own component');
  }

  const p = await pool();

  // Every item (finished + components) must exist in the POS catalogue.
  const wanted = [...new Set([itemNo, ...lines.map((l) => l.componentItemNo)])];
  const chk = p.request();
  wanted.forEach((n, i) => chk.input(`c${i}`, sql.NVarChar(30), n));
  const found = await chk.query(
    `SELECT [ItemNo] FROM [dbo].[PosItem] WHERE UPPER([ItemNo]) IN (${wanted.map((_, i) => `@c${i}`).join(',')})`
  );
  const have = new Set(found.recordset.map((r) => String(r.ItemNo).toUpperCase()));
  const missing = wanted.filter((n) => !have.has(n));
  if (missing.length) throw new Error(`These items are not in the POS item list: ${missing.join(', ')}`);

  const tx = new sql.Transaction(p);
  await tx.begin();
  try {
    // Upsert header, capture BomId.
    const up = await new sql.Request(tx)
      .input('itemNo',   sql.NVarChar(30),  itemNo)
      .input('isActive', sql.Bit,           body?.isActive === false ? 0 : 1)
      .input('notes',    sql.NVarChar(255), str(body?.notes, 255) || null)
      .query(`
        MERGE [dbo].[PosBom] AS t
        USING (SELECT @itemNo AS ItemNo) AS s ON t.[ItemNo] = s.ItemNo
        WHEN MATCHED THEN UPDATE SET [IsActive]=@isActive, [Notes]=@notes, [UpdatedAt]=GETUTCDATE()
        WHEN NOT MATCHED THEN INSERT ([ItemNo],[IsActive],[Notes]) VALUES (@itemNo,@isActive,@notes)
        OUTPUT INSERTED.[BomId];
      `);
    const bomId = up.recordset[0].BomId;

    await new sql.Request(tx)
      .input('bomId', sql.UniqueIdentifier, bomId)
      .query(`DELETE FROM [dbo].[PosBomLine] WHERE [BomId] = @bomId`);

    for (const l of lines) {
      await new sql.Request(tx)
        .input('bomId',   sql.UniqueIdentifier, bomId)
        .input('comp',    sql.NVarChar(30),  l.componentItemNo)
        .input('desc',    sql.NVarChar(200), l.description)
        .input('qtyPer',  sql.Decimal(18, 4), l.qtyPer)
        .input('uom',     sql.NVarChar(20),  l.uom)
        .input('sort',    sql.Int,           l.sortOrder)
        .query(`
          INSERT INTO [dbo].[PosBomLine] ([BomId],[ComponentItemNo],[Description],[QtyPer],[Uom],[SortOrder])
          VALUES (@bomId,@comp,@desc,@qtyPer,@uom,@sort)
        `);
    }
    await tx.commit();
    return getBom(itemNo);
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function deleteBom(itemNo) {
  const p = await pool();
  const r = await p.request()
    .input('itemNo', sql.NVarChar(30), str(itemNo, 30).toUpperCase())
    .query(`DELETE FROM [dbo].[PosBom] WHERE [ItemNo] = @itemNo`);  // cascades lines
  return { deleted: r.rowsAffected[0] || 0 };
}

// ── Production planning ────────────────────────────────────────────────────────

/** Map<ItemNo, {bomId, lines:[{componentItemNo, description, qtyPer, uom}]}> for active BOMs of the given finished items. */
async function activeBomsFor(itemNos) {
  const out = new Map();
  const clean = [...new Set((itemNos || []).map((n) => String(n || '').toUpperCase()).filter(Boolean))];
  if (!clean.length) return out;
  const p = await pool();
  const r = p.request();
  clean.forEach((n, i) => r.input(`i${i}`, sql.NVarChar(30), n));
  const res = await r.query(`
    SELECT b.[BomId], b.[ItemNo], l.[ComponentItemNo], l.[Description], l.[QtyPer], l.[Uom]
    FROM [dbo].[PosBom] b
    JOIN [dbo].[PosBomLine] l ON l.[BomId] = b.[BomId]
    WHERE b.[IsActive] = 1 AND b.[ItemNo] IN (${clean.map((_, i) => `@i${i}`).join(',')})
    ORDER BY b.[ItemNo], l.[SortOrder]
  `);
  for (const row of res.recordset) {
    if (!out.has(row.ItemNo)) out.set(row.ItemNo, { bomId: row.BomId, lines: [] });
    out.get(row.ItemNo).lines.push({
      componentItemNo: row.ComponentItemNo, description: row.Description,
      qtyPer: Number(row.QtyPer) || 0, uom: row.Uom,
    });
  }
  return out;
}

/**
 * Given the order lines, work out what must be produced (finished-good shortfall)
 * and whether the components are available.
 * Returns { needsProduction, plan:[{ itemNo, description, needed, onHand, shortfall,
 *   hasBom, canProduce, components:[{ itemNo, description, required, onHand, ok }] }] }.
 */
export async function computeProductionPlan({ shopCode, lines }) {
  if (!shopCode) throw new Error('shopCode is required');
  const need = new Map();               // finished item → total qty on the order
  for (const ln of lines || []) {
    if (!ln.itemNo) continue;
    const q = Math.abs(num(ln.quantity));
    if (q <= 0) continue;
    const key = String(ln.itemNo).toUpperCase();
    const cur = need.get(key) || { qty: 0, description: ln.description };
    cur.qty += q;
    need.set(key, cur);
  }
  if (!need.size) return { needsProduction: false, plan: [] };

  const boms = await activeBomsFor([...need.keys()]);
  const finishedOnHand = await onHandMany(shopCode, [...need.keys()]);

  // Collect component on-hand in one lookup.
  const compItems = new Set();
  for (const b of boms.values()) b.lines.forEach((l) => compItems.add(l.componentItemNo));
  const compOnHand = await onHandMany(shopCode, [...compItems]);

  const plan = [];
  for (const [itemNo, info] of need) {
    const onHandQty = finishedOnHand.get(itemNo) || 0;
    const shortfall = Math.max(0, info.qty - onHandQty);
    if (shortfall <= 0) continue;                         // enough finished stock
    const bom = boms.get(itemNo);
    if (!bom) {
      plan.push({ itemNo, description: info.description, needed: info.qty, onHand: onHandQty,
        shortfall, hasBom: false, canProduce: false, components: [] });
      continue;
    }
    const components = bom.lines.map((l) => {
      const required = round4(l.qtyPer * shortfall);
      const have = compOnHand.get(l.componentItemNo) || 0;
      return { itemNo: l.componentItemNo, description: l.description, required, onHand: have, ok: have >= required };
    });
    plan.push({ itemNo, description: info.description, needed: info.qty, onHand: onHandQty,
      shortfall, hasBom: true, canProduce: components.every((c) => c.ok), components });
  }
  return { needsProduction: plan.length > 0, plan };
}

// ── Produce ─────────────────────────────────────────────────────────────────

/**
 * Produce `qty` units of finished `itemNo` at `shopCode`: post consume-out for
 * each component (guarded — throws if any component is short) then produce-in
 * for the finished good. Reference details tie the movements to the order.
 */
export async function produceFromBom(shopCode, itemNo, qty, ctx = {}) {
  const finished = String(itemNo || '').toUpperCase();
  const q = round4(num(qty));
  if (!shopCode) throw new Error('shopCode is required');
  if (q <= 0) throw new Error('produce quantity must be positive');

  const bom = await getBom(finished);
  if (!bom || !bom.IsActive) { const e = new Error(`No active BOM for ${finished}`); e.code = 'NO_BOM'; throw e; }

  const common = {
    shopCode,
    referenceType: ctx.referenceType || 'produce',
    referenceId:   ctx.orderId || null,
    referenceNo:   ctx.referenceNo || null,
    createdBy:     ctx.userId || null,
    movementDate:  new Date(),
  };

  // Knock off components first (each guarded against negative stock).
  for (const l of bom.lines) {
    const required = round4(Number(l.QtyPer) * q);
    if (required <= 0) continue;
    await postMovement({
      ...common,
      itemNo:       l.ComponentItemNo,
      description:  l.Description,
      movementType: 'consume-out',
      quantity:     -required,
      notes:        `Consumed to produce ${q} x ${finished}`,
    });
  }
  // Add the finished good.
  await postMovement({
    ...common,
    itemNo:       finished,
    description:  bom.Notes || finished,
    movementType: 'produce-in',
    quantity:     q,
    notes:        `Produced from BOM${common.referenceNo ? ` for ${common.referenceNo}` : ''}`,
  });

  logger.info('produced from BOM', { shopCode, itemNo: finished, qty: q, components: bom.lines.length });
  return { itemNo: finished, produced: q, components: bom.lines.length };
}

/** Produce several finished items. items:[{itemNo, qty}]. */
export async function produceItems({ shopCode, items, orderId, referenceNo, userId }) {
  const results = [];
  for (const it of items || []) {
    results.push(await produceFromBom(shopCode, it.itemNo, it.qty, { orderId, referenceNo, userId }));
  }
  return { produced: results };
}

function round4(n) { return Math.round((Number(n) || 0) * 10000) / 10000; }
