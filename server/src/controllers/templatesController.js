/**
 * controllers/templatesController.js
 * REST handlers for WMS recipe templates (template_header + template_lines).
 */
import * as Templates from '../models/TemplatesModel.js';
import logger from '../services/logger.js';

const ok  = (res, data) => res.json(data);
const err = (res, e, status = 500) => {
  logger.error('templates controller error', { error: e.message });
  res.status(status).json({ error: e.message });
};

/** GET /api/costing/templates */
export async function listHeaders(req, res) {
  try {
    ok(res, await Templates.listHeaders({
      q: req.query.q, blocked: req.query.blocked, limit: req.query.limit,
    }));
  } catch (e) { err(res, e); }
}

/** GET /api/costing/templates/:no — full template (header + lines) */
export async function getTemplate(req, res) {
  try {
    const tpl = await Templates.getTemplate(req.params.no);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    ok(res, tpl);
  } catch (e) { err(res, e); }
}

/** POST /api/costing/templates */
export async function createHeader(req, res) {
  try { ok(res, await Templates.createHeader(req.body)); }
  catch (e) { err(res, e, 400); }
}

/** PATCH /api/costing/templates/:id */
export async function updateHeader(req, res) {
  try {
    const n = await Templates.updateHeader(req.params.id, req.body);
    if (!n) return res.status(404).json({ error: 'Template not found' });
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}

/** DELETE /api/costing/templates/:id  (cascades lines) */
export async function deleteTemplate(req, res) {
  try { ok(res, await Templates.deleteTemplate(req.params.id)); }
  catch (e) { err(res, e); }
}

/** GET /api/costing/templates/:no/lines */
export async function listLines(req, res) {
  try { ok(res, await Templates.listLines(req.params.no)); }
  catch (e) { err(res, e); }
}

/** POST /api/costing/templates/lines */
export async function createLine(req, res) {
  try { ok(res, await Templates.createLine(req.body)); }
  catch (e) { err(res, e, 400); }
}

/** PATCH /api/costing/templates/lines/:id */
export async function updateLine(req, res) {
  try {
    const n = await Templates.updateLine(req.params.id, req.body);
    if (!n) return res.status(404).json({ error: 'Line not found' });
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}

/** POST /api/costing/templates/:no/lines/replace  body: { rows: [...] }
 *  Replaces all lines for the template (delete-then-insert). */
export async function replaceLines(req, res) {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!rows) return res.status(400).json({ error: 'rows array required' });
    ok(res, await Templates.replaceLines(req.params.no, rows));
  } catch (e) { err(res, e, 400); }
}

/** DELETE /api/costing/templates/lines/:id */
export async function deleteLine(req, res) {
  try {
    const n = await Templates.deleteLine(req.params.id);
    if (!n) return res.status(404).json({ error: 'Line not found' });
    ok(res, { ok: true });
  } catch (e) { err(res, e); }
}

/** GET /api/costing/templates/columns — for the client form builder. */
export function listColumns(_req, res) {
  ok(res, { header: Templates.TEMPLATE_HEADER_COLUMNS, lines: Templates.TEMPLATE_LINE_COLUMNS });
}
