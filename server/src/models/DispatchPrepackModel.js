/**
 * models/DispatchPrepackModel.js
 *
 * Pack sizes (from BC table MOQ) and numbered prepacks.
 *
 * A prepack is an extra assembler job: packs of one item are made up ahead of the orders
 * (main or mini pack size from BC), each with its own number and QR label. While assembling
 * an order line the assembler scans prepacks; their sizes fill the assembled pieces, and each
 * prepack is marked used against that order line, so every pack can be traced to its order.
 */
import { randomUUID } from 'crypto';
import { db, sql } from '../db/pool.js';
import { bcDb, bcSql } from '../db/bcPool.js';
import { bcTable, ALL_COMPANIES } from '../services/bcTables.js';
import { ensurePrepackSchema } from '../db/dispatchPrepacks.js';
import { packSize, validatePrepacks } from '../../../shared/dispatchPacks.mjs';
import logger from '../services/logger.js';

const isWeightUom = (uom) => ['KG', 'KGS', 'KILOGRAM', 'KILOGRAMS', 'KILO', 'G', 'GRAM', 'GRAMS'].includes(String(uom || '').trim().toUpperCase());
const company = (c) => {
  const v = String(c || 'FCL').trim().toUpperCase();
  if (!ALL_COMPANIES.includes(v)) throw new Error(`Unknown company ${v}`);
  return v;
};

// ── BC pack setup (MOQ table) ────────────────────────────────────────────────
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map(); // company -> { at, rows: Map(itemNo -> setup) }

/** Pack setup of every configured item (Main Pack Size > 0) in a company, cached 5 minutes. */
export async function packSetups(companyId, { fresh = false } = {}) {
  const c = company(companyId);
  const hit = cache.get(c);
  if (hit && !fresh && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const pool = await bcDb.getPool();
  const res = await pool.request().query(`
    SELECT m.[Item No] ItemNo, m.[MOQ] Moq, m.[Main Pack Size] MainPackSize, m.[Mini Pack Size] MiniPackSize,
           m.[Allow Loose Pieces] AllowLoose, m.[Category] Category, i.[Description] Description,
           i.[Sales Unit of Measure] SalesUom
    FROM ${bcTable(c, 'MOQ', { ext: true })} m
    LEFT JOIN ${bcTable(c, 'Item')} i ON i.[No_]=m.[Item No]
    WHERE m.[Main Pack Size] > 0`);
  const rows = new Map(res.recordset.map((r) => [r.ItemNo, { ...r, AllowLoose: !!r.AllowLoose }]));
  cache.set(c, { at: Date.now(), rows });
  return rows;
}

/** Same as packSetups but never throws (BC not yet on the pack-size version → no pack items). */
export async function packSetupsSafe(companyId) {
  try { return await packSetups(companyId); } catch (e) {
    logger.warn('dispatch packs: BC pack setup not available', { company: companyId, error: e.message });
    return new Map();
  }
}

/** The pack setup for an order line, or null (not a pack item, or a weight line). */
export function lineSetup(setups, itemNo, uom) {
  const s = setups.get(String(itemNo || ''));
  if (!s || isWeightUom(uom)) return null;
  if (s.SalesUom && uom && String(s.SalesUom).toUpperCase() !== String(uom).toUpperCase()) return null;
  return s;
}

export async function listPackItems(companyId) {
  return [...(await packSetups(companyId, { fresh: true })).values()]
    .sort((a, b) => String(a.Category || '').localeCompare(String(b.Category || '')) || String(a.ItemNo).localeCompare(String(b.ItemNo)));
}

// ── Prepacks ─────────────────────────────────────────────────────────────────
async function chillerFor(pool, c, itemNo) {
  const r = await pool.request().input('co', sql.NVarChar(10), c).input('item', sql.NVarChar(30), itemNo).query(`
    SELECT COALESCE((SELECT TOP 1 Chiller FROM dbo.DispatchItemRule WHERE Company=@co AND ItemNo=@item),
                    (SELECT TOP 1 Chiller FROM dbo.DispatchItemChiller WHERE ItemNo=@item)) Chiller`);
  return r.recordset[0]?.Chiller || null;
}

/** Creates `count` numbered prepacks of one item and pack type. */
export async function createPrepacks(body = {}, user = {}) {
  await ensurePrepackSchema();
  const c = company(body.company);
  const itemNo = String(body.itemNo || '').trim();
  const packType = String(body.packType || '').toLowerCase();
  const count = Number(body.count);
  const batch = String(body.batchNo || '').trim().toUpperCase();
  if (!itemNo) throw new Error('Select an item');
  if (!['main', 'mini'].includes(packType)) throw new Error('Select the main or mini pack');
  if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error('Enter between 1 and 200 packs');
  if (batch && !/^[A-Z0-9]{4,5}$/.test(batch)) throw new Error('Batch number must contain 4 or 5 letters or digits');
  const setup = (await packSetups(c, { fresh: true })).get(itemNo);
  if (!setup) throw new Error(`Item ${itemNo} has no pack sizes in BC (MOQ and Pack Sizes)`);
  const size = packSize(setup, packType);
  if (!size) throw new Error(`Item ${itemNo} has no ${packType} pack size`);

  const pool = await db.getPool();
  const chiller = await chillerFor(pool, c, itemNo);
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const created = [];
    for (let i = 0; i < count; i++) {
      const r = await new sql.Request(tx)
        .input('token', sql.NVarChar(64), randomUUID().replace(/-/g, ''))
        .input('co', sql.NVarChar(10), c).input('item', sql.NVarChar(30), itemNo)
        .input('desc', sql.NVarChar(250), String(setup.Description || '').slice(0, 250))
        .input('type', sql.NVarChar(10), packType).input('size', sql.Int, size)
        .input('batch', sql.NVarChar(5), batch || null).input('ch', sql.NVarChar(50), chiller)
        .input('uid', sql.NVarChar(100), String(user.userId || '')).input('un', sql.NVarChar(200), user.userName || '')
        .query(`DECLARE @n INT = NEXT VALUE FOR dbo.DispatchPrepackSeq;
          INSERT dbo.DispatchPrepack(PrepackNo,QrToken,Company,ItemNo,Description,PackType,PackSize,BatchNo,Chiller,CreatedByUserId,CreatedByName)
          OUTPUT inserted.*
          VALUES (CONCAT('PP', RIGHT(CONCAT('0000000', @n), 7)),@token,@co,@item,@desc,@type,@size,@batch,@ch,@uid,@un)`);
      created.push(r.recordset[0]);
    }
    await tx.commit();
    return created;
  } catch (e) { try { await tx.rollback(); } catch { /* rolled back */ } throw e; }
}

export async function listPrepacks({ company: c, itemNo, status = 'available', limit = 300 } = {}) {
  await ensurePrepackSchema();
  const pool = await db.getPool();
  const r = pool.request().input('limit', sql.Int, Math.min(Math.max(Number(limit) || 300, 1), 1000));
  const where = [];
  if (c) { r.input('co', sql.NVarChar(10), company(c)); where.push('Company=@co'); }
  if (itemNo) { r.input('item', sql.NVarChar(30), String(itemNo)); where.push('ItemNo=@item'); }
  if (status && status !== 'all') { r.input('st', sql.NVarChar(20), String(status)); where.push('Status=@st'); }
  const res = await r.query(`SELECT TOP (@limit) * FROM dbo.DispatchPrepack
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CreatedAt DESC, PrepackNo DESC`);
  return res.recordset;
}

/** Stock of available prepacks per item and pack size. */
export async function prepackStock(companyId) {
  await ensurePrepackSchema();
  const pool = await db.getPool();
  const r = await pool.request().input('co', sql.NVarChar(10), company(companyId)).query(`
    SELECT ItemNo, MAX(Description) Description, PackType, PackSize, COUNT(*) Packs, SUM(PackSize) Pieces
    FROM dbo.DispatchPrepack WHERE Company=@co AND Status='available'
    GROUP BY ItemNo, PackType, PackSize ORDER BY ItemNo, PackSize DESC`);
  return r.recordset;
}

/** Finds a prepack by its number or QR token (what the scanner reads). */
export async function findPrepack(scanned, request = null) {
  await ensurePrepackSchema();
  const v = String(scanned || '').trim();
  if (!v) throw new Error('Scan or enter a prepack number');
  const req = request || (await db.getPool()).request();
  const r = await req.input('v', sql.NVarChar(64), v.toUpperCase()).input('t', sql.NVarChar(64), v)
    .query('SELECT * FROM dbo.DispatchPrepack WHERE PrepackNo=@v OR QrToken=@t');
  return r.recordset[0] || null;
}

/** Scan check for the assembly screen: the prepack must fit the given line. */
export async function lookupForLine(scanned, lineId) {
  const p = await findPrepack(scanned);
  if (!p) throw new Error(`Prepack ${scanned} not found`);
  const pool = await db.getPool();
  const line = (await pool.request().input('lid', sql.UniqueIdentifier, lineId).query(`
    SELECT l.LineId,l.ItemNo,o.Company FROM dbo.DispatchOrderLine l JOIN dbo.DispatchOrder o ON o.DispatchOrderId=l.DispatchOrderId
    WHERE l.LineId=@lid`)).recordset[0];
  if (!line) throw new Error('Order line not found');
  validatePrepacks(line, [p], Number.MAX_SAFE_INTEGER);
  return p;
}

export async function voidPrepack(prepackId, reason, user = {}) {
  await ensurePrepackSchema();
  const why = String(reason || '').trim();
  if (!why) throw new Error('Enter a reason for voiding the prepack');
  const pool = await db.getPool();
  const r = await pool.request().input('id', sql.UniqueIdentifier, prepackId)
    .input('why', sql.NVarChar(200), why.slice(0, 200)).input('un', sql.NVarChar(200), user.userName || String(user.userId || ''))
    .query(`UPDATE dbo.DispatchPrepack SET Status='void',VoidReason=@why,VoidedByName=@un,VoidedAt=GETUTCDATE(),UpdatedAt=GETUTCDATE()
      OUTPUT inserted.* WHERE PrepackId=@id AND Status='available'`);
  if (!r.recordset.length) throw new Error('Only an available prepack can be voided');
  return r.recordset[0];
}

/**
 * Inside the assembly transaction: links the scanned prepacks to the order line.
 * Prepacks previously on the line but no longer scanned go back to available.
 * Returns the pieces in the prepacks.
 */
export async function applyLinePrepacks(tx, { line, company: c, orderNo, dispatchOrderId, prepackNos, pieces, user }) {
  await ensurePrepackSchema();
  const req = () => new sql.Request(tx);
  const wanted = [...new Set((prepackNos || []).map((n) => String(n || '').trim()).filter(Boolean))];
  if (wanted.length !== (prepackNos || []).filter((n) => String(n || '').trim()).length) throw new Error('A prepack is scanned twice');
  const found = [];
  for (const no of wanted) {
    const r = await req().input('v', sql.NVarChar(64), no.toUpperCase()).input('t', sql.NVarChar(64), no)
      .query('SELECT * FROM dbo.DispatchPrepack WITH (UPDLOCK,HOLDLOCK) WHERE PrepackNo=@v OR QrToken=@t');
    if (!r.recordset[0]) throw new Error(`Prepack ${no} not found`);
    found.push(r.recordset[0]);
  }
  const total = validatePrepacks({ ...line, Company: c }, found, pieces);
  const ids = found.map((p) => p.PrepackId);
  const release = req().input('lid', sql.UniqueIdentifier, line.LineId);
  const keep = ids.map((id, i) => { release.input(`k${i}`, sql.UniqueIdentifier, id); return `@k${i}`; });
  await release.query(`UPDATE dbo.DispatchPrepack SET Status='available',DispatchOrderId=NULL,LineId=NULL,OrderNo=NULL,
      UsedByUserId=NULL,UsedByName=NULL,UsedAt=NULL,UpdatedAt=GETUTCDATE()
    WHERE LineId=@lid AND Status='used' ${keep.length ? `AND PrepackId NOT IN (${keep.join(',')})` : ''}`);
  for (const p of found) {
    if (p.Status === 'used') continue; // already on this line
    await req().input('id', sql.UniqueIdentifier, p.PrepackId).input('oid', sql.UniqueIdentifier, dispatchOrderId)
      .input('lid', sql.UniqueIdentifier, line.LineId).input('no', sql.NVarChar(40), orderNo || null)
      .input('uid', sql.NVarChar(100), String(user.userId || '')).input('un', sql.NVarChar(200), user.userName || '')
      .query(`UPDATE dbo.DispatchPrepack SET Status='used',DispatchOrderId=@oid,LineId=@lid,OrderNo=@no,UsedByUserId=@uid,
          UsedByName=@un,UsedAt=GETUTCDATE(),UpdatedAt=GETUTCDATE() WHERE PrepackId=@id AND Status='available'`);
  }
  return total;
}

/** Prepacks used on the lines of an order, grouped by LineId. */
export async function prepacksByLine(dispatchOrderId) {
  await ensurePrepackSchema();
  const pool = await db.getPool();
  const r = await pool.request().input('id', sql.UniqueIdentifier, dispatchOrderId).query(`
    SELECT PrepackId,PrepackNo,LineId,ItemNo,PackType,PackSize,BatchNo FROM dbo.DispatchPrepack
    WHERE DispatchOrderId=@id AND Status='used' ORDER BY PrepackNo`);
  const map = new Map();
  for (const p of r.recordset) {
    const k = String(p.LineId).toLowerCase();
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  }
  return map;
}

/** Adds pack setup (stored at import, else live from BC) and used prepacks to assembly lines. */
export async function withPacks(order) {
  if (!order?.lines?.length) return order;
  try {
    await ensurePrepackSchema();
    const missing = order.lines.some((l) => l.MainPackSize == null);
    const setups = missing ? await packSetupsSafe(order.Company || 'FCL') : new Map();
    const used = await prepacksByLine(order.DispatchOrderId);
    for (const l of order.lines) {
      if (l.MainPackSize == null) {
        const s = lineSetup(setups, l.ItemNo, l.Uom);
        l.MainPackSize = s?.MainPackSize || 0;
        l.MiniPackSize = s?.MiniPackSize || 0;
        l.AllowLoose = s ? !!s.AllowLoose : null;
      }
      l.Prepacks = used.get(String(l.LineId).toLowerCase()) || [];
    }
  } catch (e) {
    logger.warn('dispatch packs: could not add pack details', { error: e.message });
  }
  return order;
}

export { isWeightUom };
