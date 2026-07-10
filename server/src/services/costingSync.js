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
 *  - No transactions (avoids MSDTC promotion across the linked server).
 *  - Disable at runtime with COSTING_SYNC_ENABLED=false.
 *
 * template_lines shape produced per recipe:
 *  - ONE main-product line for the recipe's output_item:
 *      main_product='Yes', units_per_100=100, percentage=100, from output_* cols
 *  - ONE input line per RecipeData input_item (input_item !== output_item):
 *      main_product='No', units_per_100=percentage=input_item_qt_per, input_* cols
 *  - shortcode = recipe + item_code (no separator); unit_measure carries the
 *    item's real UOM (blank inputs inherit the recipe's UOM);
 *    type defaults ''. All NOT NULL columns are always populated.
 *
 * Line-set equality (uploads / replaces): replaceTemplateLinesForRecipe and
 * replaceRecipeDataForTemplate DELETE every existing row for the recipe on the
 * mirror side, then rebuild it, so both tables stay in lock-step after a bulk
 * replace.
 */
import { db, sql } from '../db/pool.js';
import { wmsTable, resolveWmsDb, WMS_DB } from '../config/wms.js';
import logger from './logger.js';

// Both tables live in calibra (FCL). template_lines has no per-company variant.
const RECIPE = wmsTable('RecipeData');
const LINES  = wmsTable('template_lines');
const HEADER = wmsTable('template_header');

// template_lines.type is NOT NULL. Input lines are 'Intake'; the output
// main-product line is 'Output'. DEFAULT_LINE_TYPE is only a last-resort fallback.
const TYPE_INPUT  = 'Intake';
const TYPE_OUTPUT = 'Output';
const DEFAULT_LINE_TYPE = TYPE_INPUT;

const STR = (n) => sql.NVarChar(n);
const NUM = sql.Numeric(18, 4);
const asStr = (v) => (v == null ? null : String(v));
const asNum = (v) => (v == null || v === '' ? null : Number(v));

const isEnabled = () =>
  String(process.env.COSTING_SYNC_ENABLED ?? 'true').toLowerCase() !== 'false';

// Templates are FCL/calibra only — skip sync for any other WMS company DB.
const isCalibra = (company) => resolveWmsDb(company) === WMS_DB;

// shortcode = shortened-recipe + item_code (no separator).
// The recipe's leading 4-digit prefix collapses to a single digit; the rest of
// the recipe code is kept as-is (e.g. 1230N76 → 3N76). Unmapped prefixes pass
// through unchanged.
const RECIPE_PREFIX_MAP = { '1210': '1', '1220': '2', '1230': '3', '1240': '4' };
function shortenRecipe(recipe) {
  const s = String(recipe ?? '');
  const mapped = RECIPE_PREFIX_MAP[s.slice(0, 4)];
  return mapped != null ? mapped + s.slice(4) : s;
}
const shortcodeOf = (templateNo, itemCode) => `${shortenRecipe(templateNo)}${itemCode}`;

// ── line descriptors from a RecipeData row ───────────────────────────────────
/** The input line for a RecipeData row (units_per_100 = percentage = qt_per). */
const inputLine = (templateNo, rr) => ({
  templateNo,
  itemCode:     rr.input_item,
  description:  asStr(rr.input_item_desc),
  // Carry the item's real UOM; if blank, inherit the recipe's own UOM.
  unitMeasure:  asStr(rr.input_item_uom) ?? asStr(rr.output_item_uom) ?? '',
  location:     asStr(rr.input_item_location),
  unitsPer100:  asNum(rr.input_item_qt_per),
  percentage:   asNum(rr.input_item_qt_per),
  mainProduct:  'No',
  type:         TYPE_INPUT,
});

/** The main-product line for a recipe's output_item (100% / 100 units). */
const mainLine = (templateNo, rr) => ({
  templateNo,
  itemCode:     rr.output_item,
  description:  asStr(rr.output_item_dec),
  unitMeasure:  asStr(rr.output_item_uom) ?? '',
  location:     asStr(rr.output_item_location),
  unitsPer100:  100,
  percentage:   100,
  mainProduct:  'Yes',
  type:         TYPE_OUTPUT,
});

// ── template_lines writers ───────────────────────────────────────────────────
async function findLineId(pool, templateNo, itemCode) {
  const lk = pool.request();
  lk.input('t', STR(50), String(templateNo));
  lk.input('i', STR(50), String(itemCode));
  const res = await lk.query(
    `SELECT TOP 1 id FROM ${LINES} WHERE template_no=@t AND item_code=@i`
  );
  return res.recordset[0]?.id ?? null;
}

/** INSERT a template_lines row — every NOT NULL column populated. */
async function insertLine(pool, line) {
  const r = pool.request();
  r.input('template_no',   STR(50),  String(line.templateNo));
  r.input('item_code',     STR(50),  String(line.itemCode));
  r.input('description',   STR(255), line.description ?? '');
  r.input('unit_measure',  STR(50),  line.unitMeasure ?? '');
  r.input('location',      STR(50),  line.location ?? '');
  r.input('units_per_100', NUM,      line.unitsPer100 ?? 0);
  r.input('percentage',    NUM,      line.percentage ?? 0);
  r.input('type',          STR(50),  line.type ?? DEFAULT_LINE_TYPE);
  r.input('main_product',  STR(10),  line.mainProduct);
  r.input('shortcode',     STR(50),  shortcodeOf(line.templateNo, line.itemCode));
  await r.query(`
    INSERT INTO ${LINES}
      (template_no, item_code, description, unit_measure, location,
       units_per_100, percentage, type, main_product, shortcode, created_at, updated_at)
    VALUES
      (@template_no, @item_code, @description, @unit_measure, @location,
       @units_per_100, @percentage, @type, @main_product, @shortcode, GETDATE(), GETDATE())
  `);
}

/** Upsert a line: update the mutable columns if present, else insert. */
async function upsertLine(pool, line) {
  const id = await findLineId(pool, line.templateNo, line.itemCode);
  if (id == null) { await insertLine(pool, line); return; }
  const r = pool.request();
  r.input('id',            sql.BigInt, id);
  r.input('description',   STR(255), line.description ?? '');
  r.input('unit_measure',  STR(50),  line.unitMeasure ?? '');
  r.input('location',      STR(50),  line.location ?? '');
  r.input('units_per_100', NUM,      line.unitsPer100 ?? 0);
  r.input('percentage',    NUM,      line.percentage ?? 0);
  r.input('main_product',  STR(10),  line.mainProduct);
  r.input('type',          STR(50),  line.type ?? DEFAULT_LINE_TYPE);
  await r.query(`
    UPDATE ${LINES}
    SET description=@description, unit_measure=@unit_measure, location=@location,
        units_per_100=@units_per_100, percentage=@percentage,
        main_product=@main_product, type=@type, updated_at=GETDATE()
    WHERE id=@id
  `);
}

/**
 * Ensure a template_header exists for `templateNo` before any line is written.
 * template_lines references template_header(template_no); a line insert against
 * a template with no header would fail. Name is seeded from the output desc.
 */
async function ensureTemplateHeader(pool, templateNo, recipeRow) {
  const chk = pool.request();
  chk.input('t', STR(50), String(templateNo));
  const found = await chk.query(`SELECT TOP 1 id FROM ${HEADER} WHERE template_no=@t`);
  if (found.recordset.length) return;
  const name =
    asStr(recipeRow?.output_item_dec) ?? asStr(recipeRow?.output_item) ?? String(templateNo);
  const ins = pool.request();
  ins.input('template_no',   STR(50),  String(templateNo));
  ins.input('template_name', STR(255), name);
  ins.input('blocked',       sql.TinyInt, 0);
  await ins.query(`
    INSERT INTO ${HEADER} (template_no, template_name, blocked, created_at, updated_at)
    VALUES (@template_no, @template_name, @blocked, GETDATE(), GETDATE())
  `);
}

/** Ensure the output_item main-product line exists (insert if missing). */
async function ensureMainProductLine(pool, templateNo, recipeRow) {
  if (!recipeRow.output_item) return;
  const id = await findLineId(pool, templateNo, recipeRow.output_item);
  if (id != null) return;
  await insertLine(pool, mainLine(templateNo, recipeRow));
}

// ── RecipeData → template_lines (single upsert) ──────────────────────────────
/**
 * Upsert the template_lines rows for a single RecipeData row: the input line
 * for this row, plus the output main-product line for the recipe.
 * @param {Object} recipeRow  RecipeData row/payload; needs `recipe`+`input_item`.
 * @param {string} [company]  WMS company; sync only runs for FCL/calibra.
 */
export async function syncRecipeDataToTemplateLine(recipeRow, company) {
  if (!isEnabled() || !isCalibra(company) || !recipeRow) return;
  const templateNo = recipeRow.recipe;
  const itemCode   = recipeRow.input_item;
  if (!templateNo || !itemCode) return;

  try {
    const pool = await db.getPool();
    await ensureTemplateHeader(pool, templateNo, recipeRow);

    const isMain =
      recipeRow.output_item != null && String(itemCode) === String(recipeRow.output_item);
    if (isMain) {
      // This row IS the output/main product.
      await upsertLine(pool, mainLine(templateNo, recipeRow));
    } else {
      await upsertLine(pool, inputLine(templateNo, recipeRow));
      await ensureMainProductLine(pool, templateNo, recipeRow);
    }
  } catch (e) {
    logger.warn('costingSync: RecipeData → template_lines failed', {
      recipe: templateNo, input_item: itemCode, error: e.message,
    });
  }
}

// ── RecipeData writers (for the reverse direction) ───────────────────────────
/** Fetch output-side fields to seed RecipeData inserts for a recipe (or null). */
async function fetchDonor(pool, recipe) {
  const br = pool.request();
  br.input('r', STR(255), String(recipe));
  const res = await br.query(`
    SELECT TOP 1 Process, output_item, output_item_dec, output_item_uom,
           batch_size, output_item_location, process_code, no_series, routing
    FROM ${RECIPE} WHERE recipe=@r ORDER BY id
  `);
  return res.recordset[0] || null;
}

/** INSERT one RecipeData row from a template line, borrowing output-side fields. */
async function insertRecipeData(pool, recipe, lineRow, donor) {
  const r = pool.request();
  r.input('recipe',      STR(255), String(recipe));
  r.input('input_item',  STR(255), String(lineRow.item_code));
  r.input('Process',              STR(255), asStr(donor.Process));
  r.input('output_item',          STR(255), asStr(donor.output_item));
  r.input('output_item_dec',      STR(255), asStr(donor.output_item_dec));
  r.input('output_item_uom',      STR(50),  asStr(donor.output_item_uom) ?? '');
  r.input('batch_size',           sql.Float, asNum(donor.batch_size) ?? 0);
  r.input('output_item_location', STR(255), asStr(donor.output_item_location));
  r.input('process_code',         STR(20),  asStr(donor.process_code));
  r.input('no_series',            STR(20),  asStr(donor.no_series));
  r.input('routing',              STR(20),  asStr(donor.routing));
  r.input('input_item_desc',      STR(255), asStr(lineRow.description) ?? '');
  r.input('input_item_uom',       STR(50),  asStr(lineRow.unit_measure) ?? asStr(donor.output_item_uom) ?? '');
  r.input('input_item_qt_per',    sql.Float, asNum(lineRow.units_per_100) ?? 0);
  r.input('input_item_location',  STR(255), asStr(lineRow.location) ?? asStr(donor.output_item_location) ?? '');
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
}

// ── template_lines → RecipeData (single upsert) ──────────────────────────────
/**
 * Upsert the RecipeData row matching a template_lines row. Main-product lines
 * (the output item) are skipped — they aren't inputs. On INSERT the output-side
 * fields are borrowed from an existing RecipeData row of the same recipe.
 * @param {Object} lineRow  template_lines row; needs `template_no`+`item_code`.
 */
export async function syncTemplateLineToRecipeData(lineRow) {
  if (!isEnabled() || !lineRow) return;
  if (String(lineRow.main_product).toLowerCase() === 'yes') return; // output, not an input
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

    if (found.recordset.length) {
      const mapped = [
        { col: 'input_item_desc',     val: lineRow.description,   type: STR(255), num: false },
        { col: 'input_item_uom',      val: lineRow.unit_measure,  type: STR(50),  num: false, dflt: '' },
        { col: 'input_item_location', val: lineRow.location,      type: STR(255), num: false },
        { col: 'input_item_qt_per',   val: lineRow.units_per_100, type: sql.Float, num: true, dflt: 0 },
      ].filter((m) => m.val !== undefined);
      if (!mapped.length) return;
      const r = pool.request();
      r.input('id', sql.Int, found.recordset[0].id);
      mapped.forEach((m) => {
        if (m.num) {
          let n = asNum(m.val);
          if (n == null && m.dflt != null) n = m.dflt;
          r.input(m.col, m.type, n);
        } else {
          let s = asStr(m.val);
          if ((s == null || s === '') && m.dflt != null) s = m.dflt;
          r.input(m.col, m.type, s);
        }
      });
      const sets = mapped.map((m) => `[${m.col}]=@${m.col}`).join(', ');
      await r.query(`UPDATE ${RECIPE} SET ${sets}, [updated_at]=GETDATE() WHERE id=@id`);
      return;
    }

    const donor = await fetchDonor(pool, recipe);
    if (!donor) {
      logger.warn('costingSync: skip template_lines → RecipeData insert (no donor row for recipe)', {
        recipe, input_item: inputItem,
      });
      return;
    }
    await insertRecipeData(pool, recipe, lineRow, donor);
  } catch (e) {
    logger.warn('costingSync: template_lines → RecipeData failed', {
      recipe, input_item: inputItem, error: e.message,
    });
  }
}

// ── Replace mirrors (uploads / bulk-replace — keep line sets equal) ──────────
/**
 * Rebuild template_lines for `recipe` from its RecipeData rows: delete all
 * existing lines, then insert one main-product line (output_item) plus one input
 * line per input_item. FCL/calibra only, non-fatal.
 */
export async function replaceTemplateLinesForRecipe(recipe, recipeRows, company) {
  if (!isEnabled() || !isCalibra(company) || !recipe) return;
  const rows = (Array.isArray(recipeRows) ? recipeRows : []).filter((r) => r && r.input_item);
  try {
    const pool = await db.getPool();
    const del = pool.request();
    del.input('t', STR(50), String(recipe));
    await del.query(`DELETE FROM ${LINES} WHERE template_no=@t`);
    if (!rows.length) return;

    await ensureTemplateHeader(pool, recipe, rows[0]);
    const outputItem = rows[0].output_item;

    // Main-product line for the output item (once).
    if (outputItem) await insertLine(pool, mainLine(recipe, rows[0]));
    // Input lines — skip any row that is itself the output (already the main line).
    for (const rr of rows) {
      if (outputItem && String(rr.input_item) === String(outputItem)) continue;
      await insertLine(pool, inputLine(recipe, rr));
    }
  } catch (e) {
    logger.warn('costingSync: replace template_lines for recipe failed', { recipe, error: e.message });
  }
}

/**
 * Rebuild RecipeData for `recipe` from its template lines: capture output-side
 * fields from an existing row, delete all RecipeData rows, then insert one row
 * per INPUT line (main-product lines are skipped). Skips entirely if there is no
 * existing RecipeData row to borrow output fields from. Non-fatal.
 */
export async function replaceRecipeDataForTemplate(templateNo, lineRows) {
  if (!isEnabled() || !templateNo) return;
  const lines = (Array.isArray(lineRows) ? lineRows : []).filter(
    (l) => l && l.item_code && String(l.main_product).toLowerCase() !== 'yes'
  );
  try {
    const pool = await db.getPool();
    const donor = await fetchDonor(pool, templateNo);
    if (!donor) {
      logger.warn('costingSync: skip RecipeData replace (no donor row for recipe)', { recipe: templateNo });
      return;
    }
    const del = pool.request();
    del.input('r', STR(255), String(templateNo));
    await del.query(`DELETE FROM ${RECIPE} WHERE recipe=@r`);
    for (const ln of lines) {
      await insertRecipeData(pool, templateNo, ln, donor);
    }
  } catch (e) {
    logger.warn('costingSync: replace RecipeData for template failed', { recipe: templateNo, error: e.message });
  }
}
