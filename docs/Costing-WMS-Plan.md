# Costing & WMS Integration — Phased Plan

_Last updated: 2026-06-17 · Branch: `main` (working tree)_

This plan consolidates the Costing/WMS work: what already exists, what was built in
**Phase 1 (this change)**, and the phased path for the rest. It is grounded in **live
discovery** against the WMS database (the `WMSIntegrations` repo contains no `.sql`/job
files — those objects live on the SQL Server itself).

---

## 0. Confirmed facts (from live DB discovery)

**Connection / naming**
- Single shared `mssql` pool (`server/src/db/pool.js`), DB user **`reporter`**. No separate pool — the WMS DB is reached through a **linked server**.
- The BC instance exposes **two** WMS linked-server aliases: **`FCL-WMS`** (works — `reporter` has a login-mapping) and **`FCL-WMS10`** (exists but **`reporter` has _no_ login-mapping** → "Access to the remote server is denied"). **Flipping to `FCL-WMS10` is blocked on a DBA login-mapping grant.**
- DB host: the instance's own name is **`FC-BC-DEV-DB01`** (note `FC-`, not `FCL-`), which resolves to `172.16.10.8`. `FCL-BC-DEV-DB01` does **not** resolve. Config now uses the hostname with the IP retained as a fallback block (`DB_HOST_IP`).
- `reporter` **cannot** read SQL Agent jobs (no SELECT on `msdb.dbo.sysjobs/sysschedules`) — see Phase 2 action item.

**WMS `calibra` objects that matter**
- Tables: `RecipeData`, `template_header`, `template_lines`, plus `choppings`, `choppings_sync`, `ProductionData`, `idt_transfers`, `wms_sync_batch`, `wms_sync_config`, etc.
- **Key linkage (verified):** `RecipeData.recipe` === `template_header.template_no` (same 7-char code, e.g. `1230A91` = "Mince Mutton"). 1260 distinct recipes, 641 templates, **244 overlap** today. → enables a unified **Recipe Card**.
- Stored procedures (the real "jobs" logic):
  - `usp_RunHourlySync(@ForceRun)` — orchestrator. Calls `usp_ShouldRunBatch` → creates a `wms_sync_batch` row → **Step 1** `usp_ProcessChoppingsToStaging` → **Step 2** `usp_GenerateP18Orders` → **Step 3** `usp_GenerateP17Orders` → updates counts/status (1=processed, 2=pulled-to-BC, 3=error).
  - `usp_ShouldRunBatch` — reads `wms_sync_config.batch_cycle_hours`, checks hour alignment + dedup against `wms_sync_batch`.
  - `usp_ForceRunSync` — `EXEC usp_RunHourlySync @ForceRun=1`.
  - Plus `SyncChoppings`, `SyncProductionOrders`, `GroupAndSumChoppingsSync`, `UpdateChoppingsSyncWithRecipeData`, `insertBarcodes`.

**WMS printing architecture (from `WMSIntegrations`)**
- `index.js` (port 3001) is a **central dispatcher**: receives `/print-invoice`, `/print-delivery`, `/print-order`, `/print-cheque`, `/print-receipt` and **forwards by a hardcoded per-user `switch`** to workstation print agents (e.g. `http://100.100.4.57:3001/print-invoice`).
- Each workstation runs `Services/printerService.js` → builds PDFs with `jspdf`/`jspdf-autotable`, prints via `pdf-to-printer`, moves `pdf/ → printed/`.

**bc-app foundations to reuse (don't reinvent)**
- `server/src/services/reportScheduler.js` — `setInterval` tick scheduler + `computeNextRunAt` (daily/weekly/monthly/interval) + per-schedule status/last-error. → basis for Phase 2.
- `server/src/services/email.js` — `sendEmail()` via nodemailer/SMTP (from Admin settings or env). → notifications.
- `ldapjs` + `AD_*` env + `services/passwordReset/adService.js` — AD access. → basis for Phase 5 SID lookup.

---

## Phase 1 — Templates CRUD + config rename ✅ (done in this change)

**Config / rename**
- `server/src/config/wms.js` — single source for the linked-server alias + DB (`WMS_LINKED_SERVER`, `WMS_DB`, `wmsTable()`).
- `server/.env` — `DB_HOST=FC-BC-DEV-DB01` + `DB_HOST_IP=172.16.10.8` fallback; `WMS_LINKED_SERVER=FCL-WMS` (comment: flip to `FCL-WMS10` after DBA grant); `WMS_DB=calibra`.
- `server/src/db/pool.js` — connects to `DB_HOST`, **auto-retries via `DB_HOST_IP`** on failure.
- `CostingModel.js` — now builds its table name from `wmsTable('RecipeData')`.

**Templates (header + lines) full CRUD**
- `server/src/models/TemplatesModel.js` — `listHeaders`, `getTemplate` (header+lines), `createHeader/updateHeader/deleteTemplate` (cascade), `listLines`, `createLine/updateLine/deleteLine`. Column whitelist + typed binders; linked-server-safe (no cross-server txn).
- `server/src/controllers/templatesController.js` + routes `/api/costing/templates/*` (role `admin|costing`).
- `client/src/services/costing.js` — `templatesApi`.
- `client/src/pages/CostingTemplatesPage.vue` — master/detail: headers list (search, status, new/edit/delete) + lines table with **per-line add / edit / delete**.
- Nav `Costing → Templates` + route `/costing/templates`.

**Also added in Phase 1 (per follow-up requests)**
- **Replace-on-upload** (delete-then-insert), each behind a **confirm box**:
  - RecipeData: `POST /api/costing/bulk-replace` (`replaceRecipes` — wipes every `recipe` in the file, re-inserts). Upload dialog now red "Replace recipes" + confirm + summary (recipesReplaced/deleted/inserted/errors).
  - Template lines: `POST /api/costing/templates/:no/lines/replace` (`replaceLines` — wipes all lines of the template, re-inserts). "Upload (replace)" button + parse (SheetJS, header aliases) + confirm.
  - (The original `bulk-upsert` is kept for non-destructive imports.)
- **Template-lines search** box (filter by item / description / type / shortcode).
- **Dark-mode hover contrast fix** — global `main.css` DataTable hover now a translucent neutral overlay (was a solid bright bg that masked row text under Chrome auto-dark). See cross-cutting item #7.

**Phase 1 remaining (next step): the unified Recipe Card**
- Replace the standalone Recipes + Templates pages with one **Recipe Card** opened by the shared code (`recipe`/`template_no`):
  - **Header**: template_no, name, blocked, batch info.
  - **Template lines** tab (from `template_lines`) — add/edit/delete.
  - **RecipeData / BOM** tab (from `RecipeData` where `recipe = code`) — add/edit/delete (reuse existing CostingModel ops).
  - Show match state: has-template-only / has-recipe-only / both; "create the missing side" action.
- Backend already supports both sides; this is mainly a new `RecipeCardPage.vue` + a small `GET /api/costing/recipe-card/:code` aggregator (header + template lines + recipe rows in one call).

---

## Phase 2 — Node-orchestrated WMS sync (replaces the SQL Agent job)

**Goal:** move scheduling + observability + notifications into Node; keep the proven T-SQL in the procs.

**Design** (extends `reportScheduler.js` into a generic job registry):
- New BCApp tables: `WmsJob` (key, description, cron/interval, proc-to-call, enabled) and `WmsJobRun` (jobKey, startedAt, finishedAt, status, rowsAffected, batchId, error).
- A `wmsSyncOrchestrator` tick (hourly) that:
  1. Calls `EXEC [<WMS>].calibra.dbo.usp_RunHourlySync @ForceRun=1` **OR** runs the steps individually (`usp_ProcessChoppingsToStaging` → `usp_GenerateP18Orders` → `usp_GenerateP17Orders`) for per-step telemetry. _Cadence is owned by Node now, not SQL Agent — `usp_ShouldRunBatch` becomes optional._
  2. Reads the resulting `wms_sync_batch` row for counts/status.
  3. Writes `WmsJobRun`; on status=3 (error) or exception → `sendEmail()` alert + in-app notification; optional success digest.
- UI under Costing → **WMS Jobs**: job list, enable/disable, **"Run now"** (→ `usp_ForceRunSync`), run history with counts and errors, links to batches.

**Action items**
- DBA: grant `reporter` membership in `msdb` `SQLAgentReaderRole` (or paste `EXEC msdb.dbo.sp_help_job` output) so we can **enumerate the existing Agent jobs** and disable the ones Node takes over.
- Confirm SMTP env (`SMTP_HOST/PORT/USER/PASS/FROM`) or Admin → SMTP is set for notifications.

---

## Phase 3 — Printing services (central dispatcher + registry)

**Goal:** keep the workstation print agents, replace the hardcoded `switch` with a **data-driven routing registry** in bc-app.

- New table `PrintRoute` (userId/username, docType [invoice|delivery|order|cheque|receipt], host, port, printerName, active). CRUD UI under Costing/Admin.
- New `server/src/services/printDispatchService.js`: look up the route for (user, docType) and `axios.post` to `http://{host}:{port}/print-{docType}`. Endpoints `POST /api/print/:docType` (and `/:user/print-:docType` for parity with the legacy agents).
- Optional: bc-app generates the PDF centrally (reuse existing `posPdfService`/`posThermalPdfService` + the `printerService.js` packing-list layout ported in) and pushes the file to a thin agent. Decide per doc type.
- Migrate the WMS workstation IP map (from `index.js`) into seed rows for `PrintRoute`.

---

## Phase 4 — Broader WMS feature migration (UI-first, phased)

_Scope note (per request): **ignore** production-order preprocessing & RabbitMQ publishing. Focus on SQL jobs + stored procs + read/printing endpoints._

Bring WMS capabilities into bc-app under Costing, each as a read-first then write feature:
1. **Transfers / IDT** (`idt_transfers`) — list/filter/export (read-only first).
2. **Choppings & staging** (`choppings`, `choppings_sync`, `ProductionData`) — viewers tied to the Phase 2 batches.
3. **Production orders P17/P18** — read views of generated orders + drill to batch.
4. **Barcodes / serials** (`insertBarcodes`, serial counter) — admin utility.
5. **QR/receipt utilities** — port `Services/QRCode.js` style helpers as needed.

Each: model (linked-server reads) → controller → service → Vue page → nav, mirroring the Costing pattern.

---

## Phase 5 — BC user-creation automation (admin-only, `[FCL]`)

**Goal:** turn the manual T-SQL user-provisioning script into an admin UI: pick a **Trainer**, enter the new user + Windows SID (auto-resolved), clone permissions.

**What the script does (to replicate as parameterised steps):**
1. Resolve `@expiryDate` from an existing reference user.
2. Delete any existing rows for the new `FARMERSCHOICE\<USER>` in `[dbo].[User]` and `RMK$User Setup` (+`$ext`).
3. Insert `[User]`, `[User Property]`.
4. Clone `[Access Control]` rows from the **Trainer's** Security ID.
5. Clone `RMK$User Setup$…$ext` and `RMK$User Setup$…` rows from the Trainer.

**Implementation**
- **AD SID via Node** (replaces `wmic useraccount where name="x" get sid`): extend `adService.js` with `getObjectSid(samAccountName)` — LDAP search on `AD_BASE_DN` for `(sAMAccountName=…)`, read `objectSid`, convert the binary SID buffer → `S-1-5-…` string. (No `wmic`/PowerShell needed.)
- New `server/src/models/BcUserProvisionModel.js`:
  - `listTrainers()` → `SELECT [User Name],[Full Name] FROM [FCL].[dbo].[User] ORDER BY [User Name]` (dropdown source).
  - `provisionUser({ username, fullName, windowsSid, trainer, expiryFromUser })` — runs steps 1–5 as **parameterised** statements inside a transaction (single instance, so a real txn is safe here — unlike the linked-server case).
- `server/src/controllers/bcUserController.js` + routes `/api/admin/bc-users/*` (**`requireRole(admin)`** only).
- Client: Admin Setup → **"Provision BC User"** — trainer `Select` (from `listTrainers`), username/full-name inputs, "Resolve SID" button (calls AD), preview of what will be cloned, confirm.

**Safeguards** (this writes to BC security tables):
- Admin-only; audit each provision (reuse `auditService`).
- Hardcode the GUID suffixes (`437dbf0e-…`, `23dc970e-…`) as constants; company prefix from config (script uses `RMK`).
- Dry-run/preview mode before commit; block if the target user already exists unless "replace" is checked.
- **Open question:** the sample script targets `RMK$User Setup`; confirm which company prefix(es) to provision (RMK only, or all four FCL/CM/FLM/RMK?).

---

## Cross-cutting action items (need you / the DBA)

| # | Item | Owner |
|---|------|-------|
| 1 | Add `reporter` **login-mapping on `FCL-WMS10`** (then flip `WMS_LINKED_SERVER`) | DBA |
| 2 | Grant `reporter` **`SQLAgentReaderRole` in `msdb`** (to enumerate/disable Agent jobs) — or paste `sp_help_job` output | DBA |
| 3 | Confirm **SMTP** settings present (env or Admin → SMTP) for job notifications | You |
| 4 | The **"[Pasted text #1]"** never reached me — if it held specific jobs/procs/endpoints beyond what I discovered, share it | You |
| 5 | Confirm **company prefix(es)** for Phase 5 user provisioning (RMK vs all) | You |
| 6 | Confirm the **unified Recipe Card** as the target UI (supersedes separate Recipes/Templates pages) | You |
| 7 | **Theme unification (contrast):** `.dark-mode` is never applied to `<html>`, so PrimeVue Aura renders its **light** components while `main.css` forces dark only on the shell + `.p-datatable`. Several pages carry ad-hoc "Chrome dark-mode fix" CSS (AuditLog, PosOrders, Till, Yield). Decide one strategy — (a) add `.dark-mode` to `<html>` and adopt PrimeVue dark tokens, or (b) commit to light components — then delete the per-page hacks. (Out of scope for this change; global hover already fixed.) | You + me |
