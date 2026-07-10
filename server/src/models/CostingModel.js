/**
 * models/CostingModel.js
 *
 * CRUD against the WMS RecipeData table via a SQL Server linked server.
 * The linked-server alias + database live in config/wms.js (env-driven).
 *
 * Upsert key: (Process, output_item, input_item) — bulk uploads update
 * matching rows in place; rows that don't match get inserted.
 *
 * All writes are executed as individual parameterised statements (no
 * explicit transaction wrapper) to avoid MSDTC promotion across the
 * linked server.
 */
import { db, sql } from '../db/pool.js';
import { wmsTable, resolveWmsDb } from '../config/wms.js';
import { syncRecipeDataToTemplateLine, replaceTemplateLinesForRecipe } from '../services/costingSync.js';

// Table name is resolved per-call so the same CRUD serves multiple WMS
// company databases (FCL → calibra, CM → cml-calibra).
const tbl = (company) => wmsTable('RecipeData', resolveWmsDb(company));

// Whitelist of columns we accept from API callers — guards against
// surprise fields appearing in upserts.
const COLS = [
  'Process',
  'output_item',
  'recipe',
  'output_item_dec',
  'output_item_uom',
  'batch_size',
  'output_item_location',
  'input_item',
  'input_item_desc',
  'input_item_uom',
  'input_item_qt_per',
  'input_item_location',
  'process_code',
  'no_series',
  'routing',
];

const STR = (n) => sql.NVarChar(n);
const TYPES = {
  Process:              STR(255),
  output_item:          STR(255),
  recipe:               STR(255),
  output_item_dec:      STR(255),
  output_item_uom:      STR(50),
  batch_size:           sql.Float,
  output_item_location: STR(255),
  input_item:           STR(255),
  input_item_desc:      STR(255),
  input_item_uom:       STR(50),
  input_item_qt_per:    sql.Float,
  input_item_location:  STR(255),
  process_code:         STR(20),
  no_series:            STR(20),
  routing:              STR(20),
};

function pick(row) {
  const out = {};
  for (const c of COLS) {
    if (row[c] !== undefined) out[c] = row[c];
  }
  return out;
}

function bindRow(request, row) {
  for (const c of COLS) {
    const v = row[c];
    if (v === undefined) continue;
    const t = TYPES[c];
    if (t === sql.Float) {
      request.input(c, sql.Float, v == null || v === '' ? null : Number(v));
    } else {
      request.input(c, t, v == null ? null : String(v));
    }
  }
}

/**
 * List rows with optional server-side filters.
 * @param {Object} filter
 * @param {string} [filter.q]            free-text search across key columns
 * @param {string} [filter.process]
 * @param {string} [filter.outputItem]
 * @param {string} [filter.inputItem]
 * @param {string} [filter.recipe]
 * @param {number} [filter.limit]        default 2000
 */
export async function listRows(filter = {}) {
  const company = filter.company;
  const pool = await db.getPool();
  const r = pool.request();
  const where = [];

  if (filter.q) {
    r.input('q', sql.NVarChar(255), `%${filter.q}%`);
    where.push(`(Process LIKE @q OR output_item LIKE @q OR output_item_dec LIKE @q OR
                  input_item LIKE @q OR input_item_desc LIKE @q OR recipe LIKE @q)`);
  }
  if (filter.process) {
    r.input('process', sql.NVarChar(255), filter.process);
    where.push('Process = @process');
  }
  if (filter.outputItem) {
    r.input('outputItem', sql.NVarChar(255), filter.outputItem);
    where.push('output_item = @outputItem');
  }
  if (filter.inputItem) {
    r.input('inputItem', sql.NVarChar(255), filter.inputItem);
    where.push('input_item = @inputItem');
  }
  if (filter.recipe) {
    r.input('recipe', sql.NVarChar(255), filter.recipe);
    where.push('recipe = @recipe');
  }

  const limit = Math.min(Math.max(parseInt(filter.limit, 10) || 2000, 1), 20000);

  const sqlText = `
    SELECT TOP (${limit})
           id, Process, output_item, recipe, output_item_dec, output_item_uom,
           batch_size, output_item_location, input_item, input_item_desc,
           input_item_uom, input_item_qt_per, input_item_location,
           process_code, no_series, routing, created_at, updated_at
    FROM   ${tbl(company)}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER  BY recipe, Process, output_item, input_item, id
  `;
  const result = await r.query(sqlText);
  return result.recordset;
}

/** GET /api/costing/recipes — distinct recipe list (for filter dropdown / grouping). */
export async function listRecipeCodes(company) {
  const pool = await db.getPool();
  const result = await pool.request().query(`
    SELECT recipe,
           MAX(Process)         AS Process,
           MAX(output_item)     AS output_item,
           MAX(output_item_dec) AS output_item_dec,
           COUNT(*)             AS line_count
    FROM   ${tbl(company)}
    GROUP  BY recipe
    ORDER  BY recipe
  `);
  return result.recordset;
}

/** GET /api/costing/processes — distinct process list. */
export async function listProcesses(company) {
  const pool = await db.getPool();
  const result = await pool.request().query(`
    SELECT DISTINCT Process FROM ${tbl(company)} WHERE Process IS NOT NULL ORDER BY Process
  `);
  return result.recordset.map(r => r.Process);
}

export async function getById(id, company) {
  const pool = await db.getPool();
  const r = pool.request();
  r.input('id', sql.Int, Number(id));
  const result = await r.query(`SELECT * FROM ${tbl(company)} WHERE id=@id`);
  return result.recordset[0] || null;
}

/**
 * Insert one row.
 * Returns the inserted id (looked up by composite key, since OUTPUT
 * across a linked server can be unreliable).
 */
export async function insertRow(body, company) {
  const row = pick(body);
  // Required NOT NULL fields per the table DDL.
  for (const k of ['Process', 'output_item', 'output_item_uom', 'batch_size',
                   'output_item_location', 'input_item', 'input_item_uom',
                   'input_item_qt_per', 'input_item_location']) {
    if (row[k] === undefined || row[k] === null || row[k] === '') {
      throw new Error(`Missing required field: ${k}`);
    }
  }

  const cols = Object.keys(row);
  const colList  = cols.map(c => `[${c}]`).join(', ');
  const paramList = cols.map(c => `@${c}`).join(', ');

  const pool = await db.getPool();
  const r = pool.request();
  bindRow(r, row);
  await r.query(`
    INSERT INTO ${tbl(company)} (${colList}, [created_at], [updated_at])
    VALUES (${paramList}, GETDATE(), GETDATE())
  `);

  // Best-effort id lookup using the composite key.
  const lk = pool.request();
  lk.input('Process',     sql.NVarChar(255), row.Process);
  lk.input('output_item', sql.NVarChar(255), row.output_item);
  lk.input('input_item',  sql.NVarChar(255), row.input_item);
  const found = await lk.query(`
    SELECT TOP 1 id FROM ${tbl(company)}
    WHERE Process=@Process AND output_item=@output_item AND input_item=@input_item
    ORDER BY id DESC
  `);

  // Propagate to the matching template_lines row (FCL/calibra only, non-fatal).
  await syncRecipeDataToTemplateLine(row, company);

  return found.recordset[0]?.id ?? null;
}

/** Update one row by id. */
export async function updateRow(id, body, company) {
  const row = pick(body);
  const cols = Object.keys(row);
  if (!cols.length) return 0;

  const sets = cols.map(c => `[${c}]=@${c}`).join(', ');

  const pool = await db.getPool();
  const r = pool.request();
  r.input('id', sql.Int, Number(id));
  bindRow(r, row);
  const result = await r.query(`
    UPDATE ${tbl(company)}
    SET    ${sets}, [updated_at]=GETDATE()
    WHERE  id=@id
  `);

  // Sync the freshly-updated row (re-read for the full key + mapped fields).
  if (result.rowsAffected[0]) {
    const full = await getById(id, company);
    if (full) await syncRecipeDataToTemplateLine(full, company);
  }

  return result.rowsAffected[0] || 0;
}

/** Delete one row by id. */
export async function deleteRow(id, company) {
  const pool = await db.getPool();
  const r = pool.request();
  r.input('id', sql.Int, Number(id));
  const result = await r.query(`DELETE FROM ${tbl(company)} WHERE id=@id`);
  return result.rowsAffected[0] || 0;
}

/** Delete every input line of a recipe (group delete). */
export async function deleteRecipe(recipe, company) {
  const pool = await db.getPool();
  const r = pool.request();
  r.input('recipe', sql.NVarChar(255), recipe);
  const result = await r.query(`DELETE FROM ${tbl(company)} WHERE recipe=@recipe`);
  return result.rowsAffected[0] || 0;
}

/**
 * Bulk upsert. Iterates rows; for each:
 *   - if a row with the same (Process, output_item, input_item) exists, UPDATE it
 *   - otherwise INSERT a new row.
 *
 * Returns { inserted, updated, errors:[{rowIndex, error, row}] }.
 *
 * @param {Array<Object>} rows   sanitised rows (caller normalises field names)
 */
export async function bulkUpsert(rows, company) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { inserted: 0, updated: 0, errors: [] };
  }
  const pool = await db.getPool();
  let inserted = 0;
  let updated  = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const row = pick(raw);
    // Required-key check for upserts
    if (!row.Process || !row.output_item || !row.input_item) {
      errors.push({ rowIndex: i, error: 'Process, output_item and input_item are required', row: raw });
      continue;
    }

    try {
      // Look up existing row by composite key.
      const lk = pool.request();
      lk.input('Process',     sql.NVarChar(255), row.Process);
      lk.input('output_item', sql.NVarChar(255), row.output_item);
      lk.input('input_item',  sql.NVarChar(255), row.input_item);
      const found = await lk.query(`
        SELECT TOP 1 id FROM ${tbl(company)}
        WHERE Process=@Process AND output_item=@output_item AND input_item=@input_item
      `);

      if (found.recordset.length) {
        // Update — only non-key columns
        const updateCols = Object.keys(row).filter(c => !['Process', 'output_item', 'input_item'].includes(c));
        if (updateCols.length) {
          const sets = updateCols.map(c => `[${c}]=@${c}`).join(', ');
          const u = pool.request();
          u.input('id', sql.Int, found.recordset[0].id);
          bindRow(u, row);
          await u.query(`UPDATE ${tbl(company)} SET ${sets}, [updated_at]=GETDATE() WHERE id=@id`);
        }
        updated++;
      } else {
        // Insert — apply default NOT NULL guards
        for (const k of ['output_item_uom', 'batch_size', 'output_item_location',
                         'input_item_uom', 'input_item_qt_per', 'input_item_location']) {
          if (row[k] === undefined || row[k] === null || row[k] === '') {
            throw new Error(`Missing required field: ${k}`);
          }
        }
        const cols = Object.keys(row);
        const colList   = cols.map(c => `[${c}]`).join(', ');
        const paramList = cols.map(c => `@${c}`).join(', ');
        const ins = pool.request();
        bindRow(ins, row);
        await ins.query(`
          INSERT INTO ${tbl(company)} (${colList}, [created_at], [updated_at])
          VALUES (${paramList}, GETDATE(), GETDATE())
        `);
        inserted++;
      }

      // Propagate this row to template_lines (FCL/calibra only, non-fatal).
      await syncRecipeDataToTemplateLine(row, company);
    } catch (e) {
      errors.push({ rowIndex: i, error: e.message, row: raw });
    }
  }

  return { inserted, updated, errors };
}

/**
 * Replace whole recipes. For every distinct `recipe` present in `rows`, all
 * existing rows for that recipe are DELETED, then the uploaded rows inserted.
 * Rows without a `recipe` value are rejected (we can't scope a replace).
 *
 * Returns { recipesReplaced, deleted, inserted, errors:[{rowIndex,error,row}] }.
 */
export async function replaceRecipes(rows, company) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { recipesReplaced: 0, deleted: 0, inserted: 0, errors: [] };
  }
  const pool = await db.getPool();
  const errors = [];

  // Group incoming rows by recipe (preserve original index for error reporting).
  const byRecipe = new Map();
  rows.forEach((raw, i) => {
    const recipe = raw.recipe ?? raw.Recipe;
    if (!recipe) { errors.push({ rowIndex: i, error: 'recipe is required for replace', row: raw }); return; }
    if (!byRecipe.has(recipe)) byRecipe.set(recipe, []);
    byRecipe.get(recipe).push({ raw, i });
  });

  let deleted = 0;
  let inserted = 0;
  let recipesReplaced = 0;

  for (const [recipe, items] of byRecipe.entries()) {
    try {
      // 1) Delete existing rows for this recipe.
      const del = pool.request();
      del.input('recipe', sql.NVarChar(255), recipe);
      const delRes = await del.query(`DELETE FROM ${tbl(company)} WHERE recipe=@recipe`);
      deleted += delRes.rowsAffected[0] || 0;

      // 2) Insert each uploaded row for this recipe.
      const insertedRows = [];
      for (const { raw, i } of items) {
        const row = pick(raw);
        for (const k of ['Process', 'output_item', 'output_item_uom', 'batch_size',
                         'output_item_location', 'input_item', 'input_item_uom',
                         'input_item_qt_per', 'input_item_location']) {
          if (row[k] === undefined || row[k] === null || row[k] === '') {
            throw new Error(`Row ${i}: missing required field "${k}"`);
          }
        }
        const cols = Object.keys(row);
        const ins = pool.request();
        bindRow(ins, row);
        await ins.query(`
          INSERT INTO ${tbl(company)} (${cols.map(c => `[${c}]`).join(', ')}, [created_at], [updated_at])
          VALUES (${cols.map(c => `@${c}`).join(', ')}, GETDATE(), GETDATE())
        `);
        insertedRows.push(row);
        inserted++;
      }
      // 3) Mirror to template_lines: delete every line for this template and
      //    re-insert one per RecipeData row, keeping the line sets equal.
      await replaceTemplateLinesForRecipe(recipe, insertedRows, company);
      recipesReplaced++;
    } catch (e) {
      errors.push({ rowIndex: items[0]?.i ?? -1, error: `recipe "${recipe}": ${e.message}`, row: { recipe } });
    }
  }

  return { recipesReplaced, deleted, inserted, errors };
}

export const COSTING_COLUMNS = COLS;
