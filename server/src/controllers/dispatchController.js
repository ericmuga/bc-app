/**
 * controllers/dispatchController.js
 * REST handlers for the dispatch / pick-and-pack pipeline.
 */
import * as Dispatch from '../models/DispatchModel.js';
import { ALL_COMPANIES } from '../services/bcTables.js';
import logger from '../services/logger.js';

const ok  = (res, data) => res.json(data);
const err = (res, e, code = 500) => {
  logger.error('dispatch controller error', { error: e.message });
  res.status(code).json({ error: e.message });
};
const splitCSV = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

// ── Registry (confirm the 4 parts) ───────────────────────────────────────────
export async function listConfirmation(req, res) {
  try {
    const companies = await Dispatch.resolveRegistryCompanies(req.user.userId, splitCSV(req.query.companies));
    ok(res, await Dispatch.listForConfirmation({ companies }));
  } catch (e) { err(res, e); }
}

/** GET /dispatch/registry-companies — the companies this user may act on. */
export async function registryCompanies(req, res) {
  try {
    const allowed = await Dispatch.listUserCompanies(req.user.userId);
    ok(res, { companies: allowed.length ? allowed : ALL_COMPANIES, restricted: allowed.length > 0 });
  } catch (e) { err(res, e); }
}

/** GET /dispatch/confirmations/report — who confirmed each part (for download). */
export async function confirmationReport(req, res) {
  try {
    const companies = await Dispatch.resolveRegistryCompanies(req.user.userId, splitCSV(req.query.companies));
    ok(res, await Dispatch.listConfirmationReport({ companies }));
  } catch (e) { err(res, e); }
}

// Per-user registry company permissions (admin/supervisor).
export async function getUserCompanies(req, res) {
  try { ok(res, { companies: await Dispatch.listUserCompanies(req.params.userId) }); }
  catch (e) { err(res, e); }
}
export async function setUserCompanies(req, res) {
  try { ok(res, { companies: await Dispatch.setUserCompanies(req.params.userId, req.body?.companies || []) }); }
  catch (e) { err(res, e, 400); }
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
  } catch (e) {
    const code = e.code === 'ALREADY_CONFIRMED' ? 409 : e.code === 'NOT_FOUND' ? 404 : 400;
    err(res, e, code);
  }
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

// ── Assembly ─────────────────────────────────────────────────────────────────
// Elevated users (admin/supervisor) may view any assembler via ?userId=; a
// packer only ever sees their own assigned orders.
const ELEVATED = ['admin', 'dispatch-supervisor'];
function assemblyUser(req) {
  if (ELEVATED.includes(req.user.role)) return req.query.userId || null; // null = all
  return req.user.userId;
}

export async function listAssembly(req, res) {
  try { ok(res, await Dispatch.listForAssembly(assemblyUser(req))); }
  catch (e) { err(res, e); }
}

export async function getAssemblyOrder(req, res) {
  try {
    const order = await Dispatch.getAssemblyOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    ok(res, order);
  } catch (e) { err(res, e); }
}

export async function saveAssemblyLine(req, res) {
  try { ok(res, await Dispatch.saveAssemblyLine(req.params.lineId, req.body?.dispatchOrderId, req.body, req.user)); }
  catch (e) { err(res, e, 400); }
}

export async function completeAssemblyPart(req, res) {
  try {
    const part = String(req.body?.part || '').toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(part)) return res.status(400).json({ error: 'part must be A/B/C/D' });
    ok(res, await Dispatch.markPartAssembled(req.params.id, part, req.user));
  } catch (e) { err(res, e, e.code === 'INVALID' ? 409 : 400); }
}

export async function returnReasons(req, res) {
  try { ok(res, await Dispatch.listReturnReasons(req.query.company || 'FCL')); }
  catch (e) { err(res, e); }
}

// Assemblers list (for the elevated "view as" picker) = packers.
export async function listAssemblers(_req, res) {
  try { ok(res, await Dispatch.listUsersByRole('packer')); }
  catch (e) { err(res, e); }
}
