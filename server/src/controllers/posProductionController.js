/**
 * controllers/posProductionController.js
 * Production orders (build finished POS items from BOMs). Gated to
 * PRODUCTION_ORDER_ROLES at the route layer.
 */
import * as Prod from '../models/PosProductionModel.js';
import * as Bom  from '../models/PosBomModel.js';
import * as Pos  from '../models/PosModel.js';
import * as BcSync from '../models/PosBcSyncModel.js';
import { db as appDb, sql } from '../db/pool.js';
import logger from '../services/logger.js';

function ok(res, data) { return res.json(data); }
function err(res, e, code = 500) { logger.error('pos-production error', { error: e.message }); return res.status(code).json({ error: e.message }); }

// Managers (admin / shop-admin / sales-admin) may target any shop via X-Shop-Code;
// others fall back to their assigned shop.
async function userShopCode(req) {
  const isManager = ['admin', 'shop-admin', 'sales-admin'].includes(req.user.role);
  if (isManager) {
    const h = req.headers['x-shop-code'];
    if (h) return String(h).trim().toUpperCase();
    const own = await Pos.getUserShopCode(req.user.userId);
    if (own) return own;
    if (req.body?.shopCode)  return String(req.body.shopCode).trim().toUpperCase();
    if (req.query?.shopCode) return String(req.query.shopCode).trim().toUpperCase();
    return null;
  }
  return Pos.getUserShopCode(req.user.userId);
}

async function shopMeta(shopCode) {
  if (!shopCode) return { company: null, locationCode: null };
  try {
    const pool = await appDb.getPool();
    const r = await pool.request().input('code', sql.NVarChar(50), String(shopCode).toUpperCase())
      .query(`SELECT [Company],[LocationCode] FROM [dbo].[PosShop] WHERE [Code]=@code`);
    const s = r.recordset[0] || {};
    return { company: s.Company || null, locationCode: s.LocationCode || null };
  } catch { return { company: null, locationCode: null }; }
}

/** GET /pos/production/makeable — items that have an active BOM/recipe. */
export async function listMakeable(_req, res) {
  try {
    const boms = await Bom.listBoms();
    ok(res, (boms || []).filter((b) => b.IsActive !== false).map((b) => ({ itemNo: b.ItemNo, description: b.Description || b.ItemNo })));
  } catch (e) { err(res, e); }
}

/** GET /pos/production/service-items — service/overhead items for the overhead picker. */
export async function listServiceItems(_req, res) {
  try { ok(res, await Prod.listServiceItems()); } catch (e) { err(res, e); }
}

/** GET /pos/production/items — all active items (for BOM + production pickers). */
export async function listItems(_req, res) {
  try { ok(res, await Prod.listCatalogueItems()); } catch (e) { err(res, e); }
}

export async function listOrders(req, res) {
  try { ok(res, await Prod.listProductionOrders({ shopCode: await userShopCode(req) })); }
  catch (e) { err(res, e); }
}

export async function getOrder(req, res) {
  try {
    const o = await Prod.getProductionOrder(req.params.id);
    if (!o) return res.status(404).json({ error: 'Production order not found' });
    ok(res, o);
  } catch (e) { err(res, e); }
}

export async function createOrder(req, res) {
  try {
    const shopCode = await userShopCode(req);
    if (!shopCode) return res.status(400).json({ error: 'No shop in context — pick a shop/terminal first' });
    const { company, locationCode } = await shopMeta(shopCode);
    const o = await Prod.createProductionOrder({
      shopCode, company, locationCode,
      outputItemNo: req.body?.outputItemNo,
      outputQty:    req.body?.outputQty,
      userId: req.user.userId, userName: req.user.userName,
    });
    ok(res, o);
  } catch (e) { err(res, e, e.code === 'NO_BOM' ? 400 : 400); }
}

export async function setLines(req, res) {
  try {
    if (!Array.isArray(req.body?.lines)) return res.status(400).json({ error: 'lines[] required' });
    ok(res, await Prod.setProductionLines(req.params.id, req.body.lines));
  } catch (e) { err(res, e, 400); }
}

export async function updateHeader(req, res) {
  try { ok(res, await Prod.updateProductionHeader(req.params.id, { outputQty: req.body?.outputQty, notes: req.body?.notes })); }
  catch (e) { err(res, e, 400); }
}

export async function postOrder(req, res) {
  try {
    const out = await Prod.postProductionOrder(req.params.id, { userId: req.user.userId, userName: req.user.userName });
    // Fire-and-forget push to BC WMS tables (a busy BC never blocks the post).
    if (out?.status === 'posted') BcSync.pushProductionOrderBg(req.params.id);
    ok(res, out);
  } catch (e) { err(res, e, 400); }
}

export async function cancelOrder(req, res) {
  try { ok(res, await Prod.cancelProductionOrder(req.params.id)); }
  catch (e) { err(res, e, 400); }
}

/** POST /pos/production/orders/:id/push-bc — (re)push one posted order to BC. */
export async function pushOrderToBc(req, res) {
  try { ok(res, await BcSync.pushProductionOrder({ prodOrderId: req.params.id })); }
  catch (e) { err(res, e, 400); }
}

/** POST /pos/production/push-bc — bulk (re)push the shop's posted orders (Sync Center). */
export async function pushAllToBc(req, res) {
  try { ok(res, await BcSync.pushAllProductionOrders({ shopCode: await userShopCode(req) })); }
  catch (e) { err(res, e); }
}
