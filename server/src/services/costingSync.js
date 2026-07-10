/**
 * services/costingSync.js
 *
 * Bidirectional, application-level sync between the two WMS recipe tables on
 * the FCL-WMS linked server (calibra database):
 *
 *     RecipeData  (BOM master)   ⇄   template_lines  (recipe-template authoring)
 *
 * Join key:  RecipeData.recipe      = template_lines.template_no
 *            RecipeData.input_item   = template_lines.item_code
 *
 * Whenever one side is upserted through the Node write paths (CostingModel /
 * TemplatesModel), the matching row on the other side is upserted here.
 *
 * Guarantees:
 *  - FCL / calibra only. Templates exist only for calibra, so writes to the CM
 *    RecipeData database (cml-calibra) are skipped.
 *  - Loop-safe: these helpers write the OPPOSITE table with raw parameterised
 *    statements — they never call back into the model functions that trigger a
 *    sync, so there is no ping-pong.
 *  - Non-fatal: every public entry point catches its own errors and logs a
 *    warning. A sync failure must never fail the primary write.
 *  - No transactions (consistent with the rest of the WMS code — avoids MSDTC
 *    promotion across the linked server).
 *  - Disable at runtime with COSTING_SYNC_ENABLED=false.
 *
 * Field mapping (RecipeData ⇄ template_lines):
 *    input_item_desc      ⇄ description
 *    input_item_uom       ⇄ unit_measure
 *    input_item_location  ⇄ location
 *    input_item_qt_per    ⇄ units_per_100
 *
 * template_lines columns with no RecipeData source (percentage, type,
 * main_product, shortcode) are DERIVED best-effort on INSERT only, and left
 * untouched on UPDATE so hand edits on the Templates page survive:
 *    main_product = 'Yes' when input_item === output_item, else 'No'
 *    type         = '' (blank — no reliable source)
 *    percentage   = NULL
 *    shortcode    = NULL
 */
import { db, sql } from '../db/pool.js';
import { wmsTable, resolveWmsDb, WMS_DB } from '../config/wms.js';
import logger from './logger.js';

// Both tables live in calibra (FCL). template_lines has no per-company variant.
const RECIPE = wmsTable('RecipeData');
const LINES  = wmsTable('template_lines');

const STR = (n) => sql.NVarChar(n);
const asStr = (v) => (v == null ? null : String(v));
const asNum = (v) => (v == null || v === '' ? null : Number(v));

const isEnabled = () =>
  String(process.env.COSTING_SYNC_ENABLED ?? 'true').toLowerCase() !== 'false';

// Templates are FCL/calibra only — skip sync for any other WMS company DB.
const isCalibra = (company) => resolveWmsDb(company) === WMS_DB;

// Fields that map straight across, keyed by the template_lines column.
// bind: 'str' | 'num' picks the SQL type + coercion.
const LINE_FROM_RECIPE = [
  { line: 'description',   recipe: 'input_item_desc',     bind: 'str', type: STR(255) },
  { line: 'unit_measure',  recipe: 'input_item_uom',      bind: 'str', type: STR(50)  },
  { line: 'location',      recipe: 'input_item_location', bind: 'str', type: STR(50)  },
  { line: 'units_per_100', recipe: 'input_item_qt_per',   bind: 'num', type: sql.Numeric(18, 4) },
];

function bindValue(request, name, spec, value) {
  request.input(name, spec.type, spec.bind === 'num' ? asNum(value) : asStr(value));
}

// ── RecipeData → template_lines ──────────────────────────────────────────────
/**
 * Upsert the template_lines row matching a RecipeData row.
 * @param {Object} recipeRow  a RecipeData row (or upsert payload). Must carry
 *                            `recipe` and `input_item`; only the mapped fields
 *                            that are present are written.
 * @param {string} [company]  WMS company; sync only runs for FCL/calibra.
 */
export async function syncRecipeDataToTemplateLine(recipeRow, company) {
  if (!isEnabled()) return;
  if (!isCalibra(company)) return;
  if (!recipeRow) return;

  const templateNo = recipeRow.recipe;
  const itemCode   = recipeRow.input_item;
  if (!templateNo || !itemCode) return;

  try {
    const pool = await db.getPool();

    const lk = pool.request();
    lk.input('t', STR(50), String(templateNo));
    lk.input('i', STR(50), String(itemCode));
    const found = await lk.query(
      `SELECT TOP 1 id FROM ${LINES} WHERE template_no=@t AND item_code=@i`
    );

    // Only sync the mapped fields the source actually provided.
    const present = LINE_FROM_RECIPE.filter((m) => recipeRow[m.recipe] !== undefined);

    if (found.recordset.length) {
      if (!present.length) return; // nothing mapped changed
      const r = pool.request();
      r.input('id', sql.BigInt, found.recordset[0].id);
      present.forEach((m) => bindValue(r, m.line, m, recipeRow[m.recipe]));
      const sets = present.map((m) => `[${m.line}]=@${m.line}`).join(', ');
      await r.query(`UPDATE ${LINES} SET ${sets}, [updated_at]=GETDATE() WHERE id=@id`);
      return;
    }

    // Insert a new line: keys + mapped fields + best-effort derived columns.
    const r = pool.request();
    r.input('template_no', STR(50), String(templateNo));
    r.input('item_code',   STR(50), String(itemCode));
    present.forEach((m) => bindValue(r, m.line, m, recipeRow[m.recipe]));
    // Derived (best-effort) — see file header.
    const mainProduct =
      recipeRow.output_item != null && String(recipeRow.input_item) === String(recipeRow.output_item)
        ? 'Yes'
        : 'No';
    r.input('main_product', STR(10), mainProduct);

    const cols = ['template_no', 'item_code', ...present.map((m) => m.line), 'main_product'];
    const vals = cols.map((c) => `@${c}`);
    await r.query(`
      INSERT INTO ${LINES} (${cols.map((c) => `[${c}]`).join(', ')}, [created_at], [updated_at])
      VALUES (${vals.join(', ')}, GETDATE(), GETDATE())
    `);
  } catch (e) {
    logger.warn('costingSync: RecipeData → template_lines failed', {
      recipe: templateNo, input_item: itemCode, error: e.message,
    });
  }
}

// ── template_lines → RecipeData ──────────────────────────────────────────────
/**
 * Upsert the RecipeData row matching a template_lines row.
 * On INSERT the output-side fields (Process, output_item, batch_size, …) are
 * borrowed from an existing RecipeData row of the same recipe. If the recipe
 * has no RecipeData rows yet we cannot build a valid insert, so we skip and log.
 * @param {Object} lineRow  a template_lines row. Must carry `template_no` and
 *                         `item_code`.
 */
export async function syncTemplateLineToRecipeData(lineRow) {
  if (!isEnabled()) return;
  if (!lineRow) return;

  const recipe    = lineRow.template_no;
  const inputItem = lineRow.item_code;
  if (!recipe || !inputItem) return;

  try {
    const pool = await db.getPool();

    const lk = pool.request();
    lk.input('r', STR(255), String(recipe));
    lk.input('i', STR(255), String(inputItem));
    const found = await lk.query(
      `SELECT TOP 1 id FROM ${RECIPE} WHERE recipe=@r AND input_item=@i`
    );

    // template_lines → RecipeData mapped fields (only those provided).
    const mapped = [
      { col: 'input_item_desc',     val: lineRow.description,   bind: 'str', type: STR(255) },
      { col: 'input_item_uom',      val: lineRow.unit_measure,  bind: 'str', type: STR(50)  },
      { col: 'input_item_location', val: lineRow.location,      bind: 'str', type: STR(255) },
      { col: 'input_item_qt_per',   val: lineRow.units_per_100, bind: 'num', type: sql.Float },
    ].filter((m) => m.val !== undefined);

    if (found.recordset.length) {
      if (!mapped.length) return;
      const r = pool.request();
      r.input('id', sql.Int, found.recordset[0].id);
      mapped.forEach((m) => bindValue(r, m.col, m, m.val));
      const sets = mapped.map((m) => `[${m.col}]=@${m.col}`).join(', ');
      await r.query(`UPDATE ${RECIPE} SET ${sets}, [updated_at]=GETDATE() WHERE id=@id`);
      return;
    }

    // No matching RecipeData row — borrow the output-side fields from any
    // existing row of this recipe so the NOT NULL columns are satisfied.
    const br = pool.request();
    br.input('r', STR(255), String(recipe));
    const donor = await br.query(`
      SELECT TOP 1 Process, output_item, output_item_dec, output_item_uom,
             batch_size, output_item_location, process_code, no_series, routing
      FROM ${RECIPE} WHERE recipe=@r ORDER BY id
    `);
    if (!donor.recordset.length) {
      logger.warn('costingSync: skip template_lines → RecipeData insert (no donor row for recipe)', {
        recipe, input_item: inputItem,
      });
      return;
    }
    const d = donor.recordset[0];

    const r = pool.request();
    r.input('recipe',      STR(255), String(recipe));
    r.input('input_item',  STR(255), String(inputItem));
    // Output-side, borrowed from the donor row.
    r.input('Process',              STR(255), asStr(d.Process));
    r.input('output_item',          STR(255), asStr(d.output_item));
    r.input('output_item_dec',      STR(255), asStr(d.output_item_dec));
    r.input('output_item_uom',      STR(50),  asStr(d.output_item_uom));
    r.input('batch_size',           sql.Float, asNum(d.batch_size) ?? 0);
    r.input('output_item_location', STR(255), asStr(d.output_item_location));
    r.input('process_code',         STR(20),  asStr(d.process_code));
    r.input('no_series',            STR(20),  asStr(d.no_series));
    r.input('routing',              STR(20),  asStr(d.routing));
    // Input-side, from the template line (with defaults for the NOT NULL cols).
    r.input('input_item_desc',      STR(255), asStr(lineRow.description) ?? '');
    r.input('input_item_uom',       STR(50),  asStr(lineRow.unit_measure) ?? asStr(d.output_item_uom) ?? 'PC');
    r.input('input_item_qt_per',    sql.Float, asNum(lineRow.units_per_100) ?? 0);
    r.input('input_item_location',  STR(255), asStr(lineRow.location) ?? asStr(d.output_item_location) ?? '');

    await r.query(`
      INSERT INTO ${RECIPE} (
        Process, output_item, recipe, output_item_dec, output_item_uom, batch_size,
        output_item_location, input_item, input_item_desc, input_item_uom,
        input_item_qt_per, input_item_location, process_code, no_series, routing,
        created_at, updated_at
      ) VALUES (
        @Process, @output_item, @recipe, @output_item_dec, @output_item_uom, @batch_size,
        @output_item_location, @input_item, @input_item_desc, @input_item_uom,
        @input_item_qt_per, @input_item_location, @process_code, @no_series, @routing,
        GETDATE(), GETDATE()
      )
    `);
  } catch (e) {
    logger.warn('costingSync: template_lines → RecipeData failed', {
      recipe, input_item: inputItem, error: e.message,
    });
  }
}
