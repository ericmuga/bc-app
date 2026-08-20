/**
 * controllers/posBcBomController.js
 * Inventory-posting-group sync config + BC Production BOM sync (BC → POS).
 */
import * as BomSync from '../models/PosBcBomSyncModel.js';
import logger from '../services/logger.js';

function ok(res, data) { return res.json(data); }
function err(res, e, code = 500) { logger.error('pos-bc-bom error', { error: e.message }); return res.status(code).json({ error: e.message }); }

// ── Inventory posting groups ─────────────────────────────────────────────────
export async function getInvPostingGroups(req, res) {
  try { ok(res, await BomSync.getInvPostingGroups(req.query.company || 'FCL')); } catch (e) { err(res, e); }
}
export async function saveInvPostingGroups(req, res) {
  try { ok(res, await BomSync.saveInvPostingGroups(req.body?.groups || [])); } catch (e) { err(res, e, 400); }
}

// ── BC Production BOMs ───────────────────────────────────────────────────────
export async function listBcBoms(req, res) {
  try { ok(res, await BomSync.listBcProductionBoms(req.query.company || 'FCL')); } catch (e) { err(res, e); }
}
export async function syncBcBom(req, res) {
  try {
    const bomNo = String(req.body?.bomNo || '').trim();
    if (!bomNo) return res.status(400).json({ error: 'bomNo required' });
    ok(res, await BomSync.syncBcBom(req.body?.company || 'FCL', bomNo));
  } catch (e) { err(res, e, 400); }
}
export async function syncBcBomsAll(req, res) {
  try { ok(res, await BomSync.syncBcBomsByGroups(req.body?.company || 'FCL')); } catch (e) { err(res, e); }
}
