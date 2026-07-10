/**
 * controllers/costingController.js
 * REST handlers for the Costing module (linked-server: FCL-WMS.calibra.dbo.RecipeData).
 */
import * as Costing from '../models/CostingModel.js';
import logger from '../services/logger.js';

const ok  = (res, data) => res.json(data);
const err = (res, e, status = 500) => {
  logger.error('costing controller error', { error: e.message });
  res.status(status).json({ error: e.message });
};

/** GET /api/costing/rows */
export async function list(req, res) {
  try {
    const rows = await Costing.listRows({
      q:          req.query.q,
      process:    req.query.process,
      outputItem: req.query.outputItem,
      inputItem:  req.query.inputItem,
      recipe:     req.query.recipe,
      limit:      req.query.limit,
      company:    req.query.company,
    });
    ok(res, rows);
  } catch (e) { err(res, e); }
}

/** GET /api/costing/recipes */
export async function listRecipes(req, res) {
  try { ok(res, await Costing.listRecipeCodes(req.query.company)); }
  catch (e) { err(res, e); }
}

/** GET /api/costing/processes */
export async function listProcesses(req, res) {
  try { ok(res, await Costing.listProcesses(req.query.company)); }
  catch (e) { err(res, e); }
}

/** GET /api/costing/rows/:id */
export async function getOne(req, res) {
  try {
    const row = await Costing.getById(req.params.id, req.query.company);
    if (!row) return res.status(404).json({ error: 'Row not found' });
    ok(res, row);
  } catch (e) { err(res, e); }
}

/** POST /api/costing/rows */
export async function create(req, res) {
  try {
    const id = await Costing.insertRow(req.body, req.query.company);
    ok(res, { id });
  } catch (e) { err(res, e, 400); }
}

/** PATCH /api/costing/rows/:id */
export async function update(req, res) {
  try {
    const affected = await Costing.updateRow(req.params.id, req.body, req.query.company);
    if (!affected) return res.status(404).json({ error: 'Row not found' });
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}

/** DELETE /api/costing/rows/:id */
export async function remove(req, res) {
  try {
    const affected = await Costing.deleteRow(req.params.id, req.query.company);
    if (!affected) return res.status(404).json({ error: 'Row not found' });
    ok(res, { ok: true });
  } catch (e) { err(res, e); }
}

/** DELETE /api/costing/recipes/:recipe */
export async function removeRecipe(req, res) {
  try {
    const affected = await Costing.deleteRecipe(req.params.recipe, req.query.company);
    ok(res, { deleted: affected });
  } catch (e) { err(res, e); }
}

/** POST /api/costing/bulk-upsert  body: { rows: [...] } */
export async function bulkUpsert(req, res) {
  try {
    if (!Array.isArray(req.body?.rows) || !req.body.rows.length) {
      return res.status(400).json({ error: 'rows array required' });
    }
    const result = await Costing.bulkUpsert(req.body.rows, req.query.company);
    ok(res, result);
  } catch (e) { err(res, e, 400); }
}

/** POST /api/costing/bulk-replace  body: { rows: [...] }
 *  Replaces every recipe present in the payload (delete-then-insert). */
export async function bulkReplace(req, res) {
  try {
    if (!Array.isArray(req.body?.rows) || !req.body.rows.length) {
      return res.status(400).json({ error: 'rows array required' });
    }
    ok(res, await Costing.replaceRecipes(req.body.rows, req.query.company));
  } catch (e) { err(res, e, 400); }
}

/** GET /api/costing/columns — for client-side template builder. */
export function listColumns(_req, res) {
  ok(res, Costing.COSTING_COLUMNS);
}
