/**
 * controllers/dispatchController.js
 * REST handlers for the dispatch / pick-and-pack pipeline.
 */
import * as Dispatch from '../models/DispatchModel.js';
import * as BcReport from '../models/BcReport.js';
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
  try { ok(res, await Dispatch.listForAssignment()); }
  catch (e) { err(res, e); }
}

export async function listPackers(_req, res) {
  try { ok(res, await Dispatch.listUsersByRole('packer')); }
  catch (e) { err(res, e); }
}

/** Assign one or more PARTS to assemblers. Body: { part, userId, name } or
 *  { assignments: [{ part, userId, name }, ...] }. */
export async function assign(req, res) {
  try {
    const body = req.body || {};
    const items = Array.isArray(body.assignments) && body.assignments.length
      ? body.assignments : [{ part: body.part, userId: body.userId, name: body.name }];
    let last = null;
    for (const it of items) {
      if (!it.part || !it.userId) return res.status(400).json({ error: 'part and userId are required' });
      last = await Dispatch.assignPart(req.params.id, it.part, { userId: it.userId, name: it.name });
    }
    ok(res, last || { ok: true });
  } catch (e) { err(res, e, e.code === 'INVALID' ? 409 : 400); }
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
    const order = await Dispatch.getAssemblyOrder(req.params.id, assemblyUser(req));
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

// ── Packing / boxing ─────────────────────────────────────────────────────────
export async function listPacking(req, res) {
  try { ok(res, await Dispatch.listForPacking(assemblyUser(req))); }
  catch (e) { err(res, e); }
}
export async function vesselTypes(_req, res) {
  try { ok(res, await Dispatch.listVesselTypes()); }
  catch (e) { err(res, e); }
}
export async function listCheckers(_req, res) {
  try { ok(res, await Dispatch.listUsersByRole('checker')); }
  catch (e) { err(res, e); }
}
export async function getPackingOrder(req, res) {
  try {
    const o = await Dispatch.getPackingOrder(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found' });
    ok(res, o);
  } catch (e) { err(res, e); }
}
export async function startPackingSession(req, res) {
  try {
    const { checkerUserId, checkerName } = req.body || {};
    const sessionId = await Dispatch.startOrGetPackingSession(
      req.params.id,
      { userId: req.user.userId, name: req.user.userName },
      { userId: checkerUserId, name: checkerName },
    );
    ok(res, { sessionId });
  } catch (e) { err(res, e, 400); }
}
export async function openBox(req, res) {
  try {
    const { sessionId, vesselTypeId, vesselCode } = req.body || {};
    ok(res, await Dispatch.openBox(sessionId, req.params.id, { vesselTypeId, vesselCode }));
  } catch (e) { err(res, e, 400); }
}
export async function addBoxLine(req, res) {
  try { ok(res, await Dispatch.addBoxLine(req.params.boxId, req.body)); }
  catch (e) { err(res, e, 400); }
}
export async function removeBoxLine(req, res) {
  try { ok(res, await Dispatch.removeBoxLine(req.params.boxLineId)); }
  catch (e) { err(res, e, 400); }
}
export async function closeBox(req, res) {
  try { ok(res, await Dispatch.closeBox(req.params.boxId, req.body, req.user)); }
  catch (e) { err(res, e, e.code === 'INVALID' ? 409 : 400); }
}
export async function boxByQr(req, res) {
  try {
    const box = await Dispatch.getBoxByQr(req.params.qr);
    if (!box) return res.status(404).json({ error: 'Box not found' });
    ok(res, box);
  } catch (e) { err(res, e); }
}
export async function completePacking(req, res) {
  try { ok(res, await Dispatch.completePacking(req.params.id)); }
  catch (e) { err(res, e, 400); }
}

// ── Loading ──────────────────────────────────────────────────────────────────
export async function listVehicles(_req, res) {
  try { ok(res, await Dispatch.listVehicles()); }
  catch (e) { err(res, e); }
}
export async function listLoadingSessions(_req, res) {
  try { ok(res, await Dispatch.listLoadingSessions()); }
  catch (e) { err(res, e); }
}
export async function createLoadingSession(req, res) {
  try { ok(res, await Dispatch.createLoadingSession(req.body, req.user)); }
  catch (e) { err(res, e, 400); }
}
export async function getLoadingSession(req, res) {
  try {
    const s = await Dispatch.getLoadingSession(req.params.id);
    if (!s) return res.status(404).json({ error: 'Loading session not found' });
    ok(res, s);
  } catch (e) { err(res, e); }
}
export async function loadBox(req, res) {
  try {
    const qr = req.body?.qrToken;
    if (!qr) return res.status(400).json({ error: 'qrToken is required' });
    ok(res, await Dispatch.loadBoxByQr(req.params.id, qr, req.user));
  } catch (e) { err(res, e, e.code === 'NOT_FOUND' ? 404 : e.code === 'INVALID' ? 409 : 400); }
}
export async function removeLoadingLine(req, res) {
  try { ok(res, await Dispatch.removeLoadingLine(req.params.loadingLineId)); }
  catch (e) { err(res, e, 400); }
}
export async function closeLoadingSession(req, res) {
  try { ok(res, await Dispatch.closeLoadingSession(req.params.id)); }
  catch (e) { err(res, e, 400); }
}

// ── Setup: vessels, vehicles, BC routes/salespersons ─────────────────────────
export async function listVehiclesAll(req, res) {
  try { ok(res, await Dispatch.listVehicles(req.query.all === '1' || req.query.all === 'true')); }
  catch (e) { err(res, e); }
}
export async function saveVesselType(req, res) {
  try { ok(res, await Dispatch.saveVesselType(req.body)); }
  catch (e) { err(res, e, 400); }
}
export async function deleteVesselType(req, res) {
  try { ok(res, await Dispatch.deleteVesselType(req.params.id)); }
  catch (e) { err(res, e, 400); }
}
export async function saveVehicle(req, res) {
  try { ok(res, await Dispatch.saveVehicle(req.body)); }
  catch (e) { err(res, e, 400); }
}
export async function deleteVehicle(req, res) {
  try { ok(res, await Dispatch.deleteVehicle(req.params.id)); }
  catch (e) { err(res, e, 400); }
}
// BC-synced routes (District Group Code) + salespersons — reuse the report model.
export async function bcRoutes(req, res) {
  try { ok(res, await BcReport.listRoutes(splitCSV(req.query.companies))); }
  catch (e) { err(res, e); }
}
export async function bcSalespersons(req, res) {
  try { ok(res, await BcReport.listSalespersons(splitCSV(req.query.companies))); }
  catch (e) { err(res, e); }
}
