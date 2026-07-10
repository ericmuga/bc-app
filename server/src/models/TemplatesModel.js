/**
 * models/TemplatesModel.js
 *
 * CRUD against the WMS recipe-template tables via the linked server:
 *   - template_header  (id, template_no, template_name, blocked, user_id, …)
 *   - template_lines   (id, template_no, item_code, description, percentage, …)
 *
 * A template is a header + N lines, related by `template_no`.
 * Writes are individual parameterised statements (no explicit txn) to avoid
 * MSDTC promotion across the linked server — same approach as CostingModel.
 */
import { db, sql } from '../db/pool.js';
import { wmsTable } from '../config/wms.js';
import { syncTemplateLineToRecipeData } from '../services/costingSync.js';

const HDR = wmsTable('template_header');
const LIN = wmsTable('template_lines');

const STR = (n) => sql.NVarChar(n);

// ── Column whitelists + typed binders ────────────────────────────────────────
const HDR_COLS = ['template_no', 'template_name', 'blocked', 'user_id'];
const HDR_TYPES = {
  template_no:   STR(50),
  template_name: STR(255),
  blocked:       sql.TinyInt,
  user_id:       sql.BigInt,
};

const LIN_COLS = [
  'template_no', 'item_code', 'description', 'percentage', 'units_per_100',
  'type', 'main_product', 'shortcode', 'unit_measure', 'location',
];
const LIN_TYPES = {
  template_no:   STR(50),
  item_code:     STR(50),
  description:   STR(255),
  percentage:    sql.Numeric(18, 4),
  units_per_100: sql.Numeric(18, 4),
  type:          STR(50),
  main_product:  STR(10),
  shortcode:     STR(50),
  unit_measure:  STR(50),
  location:      STR(50),
};

// Columns that must be bound as numbers (NULL when blank), not strings.
const NUM_COLS = new Set(['percentage', 'units_per_100', 'blocked', 'user_id']);

function pick(row, cols) {
  const out = {};
  for (const c of cols) if (row[c] !== undefined) out[c] = row[c];
  return out;
}

function bindRow(request, row, types) {
  for (const [c, v] of Object.entries(row)) {
    const t = types[c];
    if (!t) continue;
    if (NUM_COLS.has(c)) {
      request.input(c, t, v == null || v === '' ? null : Number(v));
    } else {
      request.input(c, t, v == null ? null : String(v));
    }
  }
}

// ── Headers ──────────────────────────────────────────────────────────────────
/**
 * List template headers with optional filters.
 * @param {Object} filter { q, blocked, limit }
 */
export async function listHeaders(filter = {}) {
  const pool = await db.getPool();
  const r = pool.request();
  const where = [];

  if (filter.q) {
    r.input('q', STR(255), `%${filter.q}%`);
    where.push('(template_no LIKE @q OR template_name LIKE @q)');
  }
  if (filter.blocked === '0' || filter.blocked === '1' || filter.blocked === 0 || filter.blocked === 1) {
    r.input('blocked', sql.TinyInt, Number(filter.blocked));
    where.push('blocked = @blocked');
  }

  const limit = Math.min(Math.max(parseInt(filter.limit, 10) || 2000, 1), 20000);
  const result = await r.query(`
    SELECT TOP (${limit})
           h.id, h.template_no, h.template_name, h.blocked, h.user_id,
           h.created_at, h.updated_at,
           (SELECT COUNT(*) FROM ${LIN} l WHERE l.template_no = h.template_no) AS line_count
    FROM   ${HDR} h
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER  BY h.template_no
  `);
  return result.recordset;
}

export async function getHeaderById(id) {
  const pool = await db.getPool();
  const r = pool.request();
  r.input('id', sql.BigInt, Number(id));
  const result = await r.query(`SELECT * FROM ${HDR} WHERE id=@id`);
  return result.recordset[0] || null;
}

export async function getHeaderByNo(templateNo) {
  const pool = await db.getPool();
  const r = pool.request();
  r.input('no', STR(50), templateNo);
  const result = await r.query(`SELECT TOP 1 * FROM ${HDR} WHERE template_no=@no`);
  return result.recordset[0] || null;
}

/** Full template = header + its lines. */
export async function getTemplate(templateNo) {
  const header = await getHeaderByNo(templateNo);
  if (!header) return null;
  const lines = await listLines(templateNo);
  return { ...header, lines };
}

export async function createHeader(body) {
  const row = pick(body, HDR_COLS);
  if (!row.template_no) throw new Error('template_no is required');
  if (!row.template_name) throw new Error('template_name is required');
  if (row.blocked === undefined || row.blocked === null || row.blocked === '') row.blocked = 0;

  const existing = await getHeaderByNo(row.template_no);
  if (existing) throw new Error(`Template "${row.template_no}" already exists`);

  const cols = Object.keys(row);
  const pool = await db.getPool();
  const r = pool.request();
  bindRow(r, row, HDR_TYPES);
  await r.query(`
    INSERT INTO ${HDR} (${cols.map(c => `[${c}]`).join(', ')}, [created_at], [updated_at])
    VALUES (${cols.map(c => `@${c}`).join(', ')}, GETDATE(), GETDATE())
  `);
  return getHeaderByNo(row.template_no);
}

export async function updateHeader(id, body) {
  const row = pick(body, HDR_COLS);
  const cols = Object.keys(row);
  if (!cols.length) return 0;
  const pool = await db.getPool();
  const r = pool.request();
  r.input('id', sql.BigInt, Number(id));
  bindRow(r, row, HDR_TYPES);
  const result = await r.query(`
    UPDATE ${HDR} SET ${cols.map(c => `[${c}]=@${c}`).join(', ')}, [updated_at]=GETDATE()
    WHERE id=@id
  `);
  return result.rowsAffected[0] || 0;
}

/** Delete a header and all its lines (by template_no). */
export async function deleteTemplate(id) {
  const header = await getHeaderById(id);
  if (!header) return { header: 0, lines: 0 };
  const pool = await db.getPool();

  const dl = pool.request();
  dl.input('no', STR(50), header.template_no);
  const linesRes = await dl.query(`DELETE FROM ${LIN} WHERE template_no=@no`);

  const dh = pool.request();
  dh.input('id', sql.BigInt, Number(id));
  const hdrRes = await dh.query(`DELETE FROM ${HDR} WHERE id=@id`);

  return { header: hdrRes.rowsAffected[0] || 0, lines: linesRes.rowsAffected[0] || 0 };
}

// ── Lines ────────────────────────────────────────────────────────────────────
export async function listLines(templateNo) {
  const pool = await db.getPool();
  const r = pool.request();
  r.input('no', STR(50), templateNo);
  const result = await r.query(`
    SELECT id, template_no, item_code, description, percentage, units_per_100,
           type, main_product, shortcode, unit_measure, location, created_at, updated_at
    FROM   ${LIN} WHERE template_no=@no ORDER BY id
  `);
  return result.recordset;
}

export async function createLine(body) {
  const row = pick(body, LIN_COLS);
  if (!row.template_no) throw new Error('template_no is required');
  if (!row.item_code) throw new Error('item_code is required');
  const cols = Object.keys(row);
  const pool = await db.getPool();
  const r = pool.request();
  bindRow(r, row, LIN_TYPES);
  await r.query(`
    INSERT INTO ${LIN} (${cols.map(c => `[${c}]`).join(', ')}, [created_at], [updated_at])
    VALUES (${cols.map(c => `@${c}`).join(', ')}, GETDATE(), GETDATE())
  `);
  // Propagate to the matching RecipeData row (non-fatal).
  await syncTemplateLineToRecipeData(row);
  return { ok: true };
}

/** Fetch a single line by id (used by the RecipeData sync after an update). */
async function getLineById(id) {
  const pool = await db.getPool();
  const r = pool.request();
  r.input('id', sql.BigInt, Number(id));
  const result = await r.query(`SELECT * FROM ${LIN} WHERE id=@id`);
  return result.recordset[0] || null;
}

export async function updateLine(id, body) {
  const row = pick(body, LIN_COLS);
  const cols = Object.keys(row);
  if (!cols.length) return 0;
  const pool = await db.getPool();
  const r = pool.request();
  r.input('id', sql.BigInt, Number(id));
  bindRow(r, row, LIN_TYPES);
  const result = await r.query(`
    UPDATE ${LIN} SET ${cols.map(c => `[${c}]=@${c}`).join(', ')}, [updated_at]=GETDATE()
    WHERE id=@id
  `);
  // Sync the freshly-updated line (re-read for the full template_no + item_code).
  if (result.rowsAffected[0]) {
    const full = await getLineById(id);
    if (full) await syncTemplateLineToRecipeData(full);
  }
  return result.rowsAffected[0] || 0;
}

export async function deleteLine(id) {
  const pool = await db.getPool();
  const r = pool.request();
  r.input('id', sql.BigInt, Number(id));
  const result = await r.query(`DELETE FROM ${LIN} WHERE id=@id`);
  return result.rowsAffected[0] || 0;
}

/**
 * Replace ALL lines of a template: delete every existing line for `templateNo`,
 * then insert the uploaded rows. The header is left untouched.
 * Returns { deleted, inserted, errors:[{rowIndex,error}] }.
 */
export async function replaceLines(templateNo, rows) {
  if (!templateNo) throw new Error('template_no is required');
  const pool = await db.getPool();

  const del = pool.request();
  del.input('no', STR(50), templateNo);
  const delRes = await del.query(`DELETE FROM ${LIN} WHERE template_no=@no`);
  const deleted = delRes.rowsAffected[0] || 0;

  let inserted = 0;
  const errors = [];
  const list = Array.isArray(rows) ? rows : [];
  for (let i = 0; i < list.length; i++) {
    try {
      const row = pick({ ...list[i], template_no: templateNo }, LIN_COLS);
      if (!row.item_code) throw new Error('item_code is required');
      const cols = Object.keys(row);
      const r = pool.request();
      bindRow(r, row, LIN_TYPES);
      await r.query(`
        INSERT INTO ${LIN} (${cols.map(c => `[${c}]`).join(', ')}, [created_at], [updated_at])
        VALUES (${cols.map(c => `@${c}`).join(', ')}, GETDATE(), GETDATE())
      `);
      // Propagate each replaced line to RecipeData (non-fatal).
      await syncTemplateLineToRecipeData(row);
      inserted++;
    } catch (e) {
      errors.push({ rowIndex: i, error: e.message });
    }
  }
  return { deleted, inserted, errors };
}

export const TEMPLATE_HEADER_COLUMNS = HDR_COLS;
export const TEMPLATE_LINE_COLUMNS = LIN_COLS;
