/**
 * services/wmsRecipeClient.js
 *
 * Thin HTTP client for the standalone WMS Recipe API (see the wms-recipe-api
 * repo). Used ONLY when COSTING_BACKEND=http. Native fetch (Node 18+) — no
 * extra dependency. Trusted-network by default; sends X-API-Key only if
 * WMS_API_KEY is configured.
 *
 * Every method mirrors a CostingModel / TemplatesModel signature so the models
 * can delegate transparently.
 */
import { WMS_API_BASE_URL, WMS_API_KEY } from '../config/wms.js';
import logger from './logger.js';

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (WMS_API_KEY) h['X-API-Key'] = WMS_API_KEY;
  return h;
}

function qs(params = {}) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.append(k, v);
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

async function call(method, path, { query, body } = {}) {
  const url = `${WMS_API_BASE_URL}${path}${qs(query)}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    logger.error('wmsRecipeClient: request failed', { method, url, error: e.message });
    throw new Error(`WMS Recipe API unreachable (${WMS_API_BASE_URL}): ${e.message}`);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data?.error || `WMS Recipe API ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

const company = (c) => (c ? { company: c } : {});

// ── RecipeData rows (CostingModel parity) ────────────────────────────────────
export const listRows = (filter = {}) =>
  call('GET', '/rows', { query: {
    q: filter.q, process: filter.process, outputItem: filter.outputItem,
    inputItem: filter.inputItem, recipe: filter.recipe, limit: filter.limit, company: filter.company,
  } });
export const listRecipeCodes = (c) => call('GET', '/recipe-codes', { query: company(c) });
export const listProcesses   = (c) => call('GET', '/processes', { query: company(c) });
export const getById  = (id, c) => call('GET', `/rows/${encodeURIComponent(id)}`, { query: company(c) });
export const insertRow = (body, c) => call('POST', '/rows', { query: company(c), body }).then((r) => r?.id ?? null);
export const updateRow = async (id, body, c) => {
  try { await call('PATCH', `/rows/${encodeURIComponent(id)}`, { query: company(c), body }); return 1; }
  catch (e) { if (e.status === 404) return 0; throw e; }
};
export const deleteRow = async (id, c) => {
  try { await call('DELETE', `/rows/${encodeURIComponent(id)}`, { query: company(c) }); return 1; }
  catch (e) { if (e.status === 404) return 0; throw e; }
};
export const deleteRecipe = (recipe, c) =>
  call('DELETE', `/recipe/${encodeURIComponent(recipe)}`, { query: company(c) }).then((r) => r?.deleted ?? 0);
export const bulkUpsert   = (rows, c) => call('POST', '/bulk-upsert', { query: company(c), body: { rows } });
export const replaceRecipes = (rows, c) => call('POST', '/bulk-replace', { query: company(c), body: { rows } });

// ── Templates (TemplatesModel parity) ────────────────────────────────────────
export const listHeaders = (filter = {}) =>
  call('GET', '/templates', { query: { q: filter.q, blocked: filter.blocked, limit: filter.limit } });
export const getTemplate = (no) => call('GET', `/templates/${encodeURIComponent(no)}`);
export const listLines   = (no) => call('GET', `/templates/${encodeURIComponent(no)}/lines`);
export const createHeader = (body) => call('POST', '/templates', { body });
export const updateHeader = async (id, body) => {
  try { await call('PATCH', `/templates/${encodeURIComponent(id)}`, { body }); return 1; }
  catch (e) { if (e.status === 404) return 0; throw e; }
};
export const deleteTemplate = (id) => call('DELETE', `/templates/${encodeURIComponent(id)}`);
export const createLine = (body) => call('POST', '/templates/lines', { body });
export const updateLine = async (id, body) => {
  try { await call('PATCH', `/templates/lines/${encodeURIComponent(id)}`, { body }); return 1; }
  catch (e) { if (e.status === 404) return 0; throw e; }
};
export const deleteLine = async (id) => {
  try { await call('DELETE', `/templates/lines/${encodeURIComponent(id)}`); return 1; }
  catch (e) { if (e.status === 404) return 0; throw e; }
};
export const replaceLines = (no, rows) => call('POST', `/templates/${encodeURIComponent(no)}/lines/replace`, { body: { rows } });

// ── Recipe aggregate (recipe-card full CRUD) ─────────────────────────────────
export const listRecipes  = (c, q) => call('GET', '/recipes', { query: { ...company(c), q } });
export const getRecipeCard = (code, c) => call('GET', `/recipes/${encodeURIComponent(code)}`, { query: company(c) });
export const createRecipe  = (code, rows, c) => call('POST', `/recipes/${encodeURIComponent(code)}`, { query: company(c), body: { rows } });
export const replaceRecipe = (code, rows, c) => call('PUT', `/recipes/${encodeURIComponent(code)}`, { query: company(c), body: { rows } });
export const removeRecipe  = (code, c) => call('DELETE', `/recipes/${encodeURIComponent(code)}`, { query: company(c) });

/** Reachability probe (GET /health, unauthenticated on the service). */
export async function health() {
  const base = WMS_API_BASE_URL.replace(/\/api\/recipes$/, '');
  const res = await fetch(`${base}/health`);
  return res.json();
}
