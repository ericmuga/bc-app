/**
 * controllers/dispatchController.js
 * REST handlers for the dispatch / pick-and-pack pipeline.
 */
import * as Dispatch from '../models/DispatchModel.js';
import logger from '../services/logger.js';

const ok  = (res, data) => res.json(data);
const err = (res, e, code = 500) => {
  logger.error('dispatch controller error', { error: e.message });
  res.status(code).json({ error: e.message });
};

// ── Registry (confirm the 4 parts) ───────────────────────────────────────────
export async function listConfirmation(_req, res) {
  try { ok(res, await Dispatch.listForConfirmation()); }
  catch (e) { err(res, e); }
}

/** POST /dispatch/import — pull today's Execute orders from BC into the registry. */
export async function importFromBc(req, res) {
  try {
    const raw = req.body?.companies ?? req.query?.companies;
    const companies = Array.isArray(raw)
      ? raw
      : (typeof raw === 'string' && raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
    ok(res, await Dispatch.importFromBc({ companies }));
  } catch (e) { err(res, e); }
}

export async function getOrder(req, res) {
  try {
    const order = await Dispatch.getDispatchOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Dispatch order not found' });
    ok(res, order);
  } catch (e) { err(res, e); }
}

export async function confirmPart(req, res) {
  try {
    const part = String(req.body?.part || '').toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(part)) {
      return res.status(400).json({ error: 'part must be A, B, C or D' });
    }
    const result = await Dispatch.confirmPart(req.params.id, part, req.user);
    ok(res, result);
  } catch (e) { err(res, e, 400); }
}

// ── Assignment (supervisor → packer) ─────────────────────────────────────────
export async function listUnassigned(_req, res) {
  try { ok(res, await Dispatch.listUnassigned()); }
  catch (e) { err(res, e); }
}

export async function listPackers(_req, res) {
  try { ok(res, await Dispatch.listUsersByRole('packer')); }
  catch (e) { err(res, e); }
}

export async function assign(req, res) {
  try {
    const { userId, name } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId (packer) is required' });
    const affected = await Dispatch.assign(req.params.id, { userId, name });
    if (!affected) return res.status(409).json({ error: 'Order is not in a confirmed/assignable state' });
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}
