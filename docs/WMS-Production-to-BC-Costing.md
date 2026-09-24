# WMS Production → Business Central: Splitting, Auto-Generation & Costing

**Scope:** how the WMS (`FCL-WMS`, DB `calibra`) turns floor activity into the
BC production orders that carry cost — with focus on the **P00–P10 splitting**
line, the **lean-pork auto-generation** (`G1164`, `G1126`, `G1189`, `G1229`) and
its **translation to `G1291`** for costing.

> Reached from BCApp via linked server `[FCL-WMS].[calibra]`. All object names
> below are in that database unless noted. BC target company DB = `FCL`
> (`FCL1$…$23dc970e-…` tables).

---

## 1. The pipeline end-to-end

```
 Floor capture                Consolidation             Order generation                 BC ingestion            Warehouse
 ────────────                 ─────────────             ────────────────                 ────────────            ─────────
 deboned_data   ─┐                                     SyncProductionOrders  ─┐        FCL1$WMSProduction        fact_ILE_MV
  (P00–P10 split)│──►  choppings ─► choppings_sync ──► (reads choppings_sync   │──────► Order Header             (Output/
 choppings /     │     chopping_    (grouped, mapped,   × RecipeData)          │        + WMS Production         Consumption
  chopping_lines─┘      lines        recipe-joined)     usp_GenerateP17/P18…  ─┘        Journal Line            → item ledger)
```

1. **Floor capture**
   - `deboned_data` (1.09M rows) — the **deboning / splitting line**. Each row is
     a weighed piece at a **`process_code`** (0..18) with `item_code`,
     `actual_weight`/`net_weight`, `product_type` (grade), `no_of_pieces`, `batch_no`.
   - `choppings` / `chopping_lines` (0.39M / 5.6M rows) — chopping/emulsion batches
     and their weighed input/output lines (`output` flag 1=output, 0=input).

2. **Consolidation → `choppings_sync`** (`GroupAndSumChoppingsSync`,
   `SyncChoppings`, `UpdateChoppingsSyncWithRecipeData`, `usp_ProcessChoppingsToStaging`)
   - CLOSED, unsynced choppings from `sync_start_date` are summed by
     `recipe_prefix + item + output + date`.
   - **`fn_map_item_code()`** applies item substitutions from
     `wms_item_code_mapping` (e.g. `G2013→G2005`, `H131001→H231051`) so floor codes
     land on the correct standard item.
   - A production-order number is built per output, e.g.
     `P18_<recipe>…_<item>_<yymmdd>_<seq>`.

3. **Order generation → BC** (`SyncProductionOrders`)
   - Joins `choppings_sync` to **`RecipeData`** on `chopping_id = recipe` and
     `item_code = output_item`.
   - Writes **one BC production order per output**:
     - Header + output journal line (`Line No_ 1000`, `EntryType 0 = Output`,
       qty = weighed output weight).
     - Input journal lines (`EntryType 1 = Consumption`), qty scaled by the recipe:
       **`(output_weight / RecipeData.batch_size) × input_item_qt_per`**.
   - Incremental by `[Date Time] > last processed`; target tables
     `FCL1$WMSProduction Order Header$…` and `FCL1$WMS Production Journal Line$…`.

4. **Auto-generation cascade** (`usp_GenerateP17Orders`, `usp_GenerateP18Orders`, …)
   - **P18** = the chopping orders themselves (`order_type 'P18'`, routing `Chopping`).
   - **P17** = auto-generated **Spice-premixing** sub-orders: for every G-item output
     of a P18 order that has exactly **one** `Spice premixing` recipe in `RecipeData`,
     a P17 order is created (output line + recipe input lines). This is the
     "auto-generation" pattern — one captured output spawns the dependent
     sub-assembly orders so BC receives the full cost chain.

5. **BC → costing → warehouse**
   - BC posts these as item-ledger **Output (6)** and **Consumption (5)** entries,
     which flow to the warehouse `fact_ILE_MV` (Inventory Analytics / Stock Position,
     and the "Pending WMS" toggle reads the *unposted* `WMS Production Journal Line`
     with `Status=0`).

---

## 2. P00–P10 — the splitting activity

The carcass is progressively broken down along the deboning line; each stage is a
**`process_code`** in `deboned_data`. Observed volumes:

| Process code (Pnn) | Rows | Distinct items | Meaning (observed) |
|---|--:|--:|---|
| 0 (**P00**) | 29,943 | 19 | **Beheading** — carcass `G0110A` → first cuts + lean pork `G1229` (recipe `1210J01`) |
| 1–3 | ~18k | — | Early primal separation |
| 4 (**P04**) | 221,205 | 25 | Major deboning — lean-pork grades appear |
| 5 (**P05**) | 222,874 | 22 | Deboning / trimming |
| 6 (**P06**) | 255,257 | 20 | Deboning / trimming |
| 8 (**P08**) | 114,998 | 53 | Slicing (`process_code 8` = `Slicing-1570` in RecipeData) |
| 10 (**P10**) | 205,051 | 5 | Final lean-pork consolidation stage |

The **lean-pork family** is captured across these stages with a `product_type`
grade, e.g.:

| Item | Description | Seen at process codes | product_type (grades) |
|---|---|---|---|
| `G1229` | Lean Pork | 0, 4 | 1, 2 |
| `G1126` | Lean Pork (grade) | 0, 4, — | 1, 2, 3 |
| `G1164` | Lean Pork (grade) | 0, 4, 5 | 1 |
| `G1189` | Lean Pork (grade) | 0, 5 | 1, 2 |

So the *same physical lean pork* is recorded under several codes/grades depending
on where on the line and at which quality it was trimmed.

---

## 3. Lean pork → `G1291` (the costing item)

- `G1291` (**"Lean Pork"**) has **no `RecipeData` recipe of its own** and **never
  appears in `deboned_data`** — it is *not* a physically-deboned code.
- It **does** appear **153,061 times in `ProductionData`** (the generated
  production feed) and is the item that downstream recipes **consume**, e.g.
  `G2005` *Minced Lean Pork* (`M00004`, Mincing) and slicing recipes
  (`SYS-SL-*`) take `G1291` as input.

**Interpretation:** the deboning line yields lean pork under several working
codes/grades (`G1164/G1126/G1189/G1229`), but for production and **costing** they
are consolidated to the single standard item **`G1291`** when the production
orders are generated (`ProductionData`). `G1291` is therefore the **cost-carrying
"one lean pork" item**: all lean-pork output value rolls into `G1291`, and every
downstream product that uses lean pork consumes `G1291` at a standard cost.

> ⚠️ The exact consolidation rule (which grades roll to `G1291`, and any yield
> weighting) is applied by the **WMS application when it writes `ProductionData`**
> — it is *not* in a SQL proc, `RecipeData`, `splitted_weights` (empty), or
> `wms_item_code_mapping`. **Confirm the rule with the WMS app owner** before
> relying on it for standard costing; the recommended fix if it should be
> data-driven is to add the grade→`G1291` rows to `wms_item_code_mapping`
> (`fn_map_item_code` already applies that table during staging).

---

## 4. Costing implications & requirements to populate

For the MRP / BC setup ([MRP.xlsx], config packages) this means:

1. **Item master**
   - `G1291` = standard **Lean Pork** costing item (Prod. Order / manufactured or a
     cost-collector). The grades `G1164/G1126/G1189/G1229` and carcass `G0110A`
     are its upstream sources.
2. **Item categories** — add a **Lean Pork / Deboning WIP** category grouping
   `G1291` + the grade codes; carcass under Raw Materials.
3. **Routings / work centres** — model **P00–P10 as deboning operations**
   (Beheading = P00, Deboning = P04–P06, Slicing = P08, Consolidation = P10) on a
   **Deboning work centre**, so the split labour/overhead is captured per stage.
4. **BOMs** — the standard cost of `G1291` should be built from the carcass yield
   across P00–P10 (a yield BOM: carcass → lean-pork grades → `G1291`), mirroring the
   CM cutting model. Downstream product BOMs consume `G1291` (already exploded in
   `MRP_filled.xlsx`).
5. **Consolidation mapping** — if grade→`G1291` is to be governed in the DB, load
   `wms_item_code_mapping` (`G1164/G1126/G1189/G1229 → G1291`, `is_active=1`).

---

## 5. Object reference

| Object | Role |
|---|---|
| `deboned_data` | P00–P10 split capture (process_code, item, grade, weight) |
| `choppings` / `chopping_lines` | Chopping/emulsion batch capture (output/input weights) |
| `choppings_sync` | Consolidated, item-mapped, recipe-joined staging |
| `wms_item_code_mapping` / `fn_map_item_code()` | Floor-code → standard-item substitution |
| `RecipeData` | Recipe (batch_size, input_item_qt_per, Process, routing) — drives input scaling |
| `SyncProductionOrders` | Generates BC WMSProduction Order Header + Journal Lines |
| `usp_GenerateP17Orders` / `usp_GenerateP18Orders` | Auto-generate dependent sub-assembly orders (P17 spice-premix from P18) |
| `usp_RunHourlySync` / `usp_ShouldRunBatch` / `usp_ForceRunSync` | Batch scheduling wrappers |
| `ProductionData` / `generated_production_orders` | Generated production feed (where `G1291` is introduced) |
| BC `FCL1$WMSProduction Order Header` / `…WMS Production Journal Line` | BC ingestion targets → item ledger → `fact_ILE_MV` |

*Generated 2026-09-09 from live WMS metadata + recipe/deboning data.*
