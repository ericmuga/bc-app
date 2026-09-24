# Dispatch packing

Start a packing session and select a different, active confirmer before picking an assembled order. The session timer survives a page reload. Pending, ongoing and packed tabs separate the queues. Packing uses an amber theme.

Picking an order claims it exclusively across assembly and packing. Other operators cannot claim or change it. Completion, explicit release or ending the session releases the claim. Supervisors can release abandoned claims from Dispatch Reports; browser closure alone does not release work.

Choose an active vessel, then scan or select an item. The mobile modal prefills remaining assembled pieces, quantity and batch; these can be edited. Batches require four or five alphanumeric characters. Partial boxes are supported, but cumulative quantities and pieces cannot exceed assembly. Duplicate request retries cannot insert the same contents twice. Lines are tracked by order-line identity, including repeated item numbers.

Closing a nonempty box generates its label. Once all assembled quantities and pieces are packed and every box is closed, the order is automatically fully packed. Unpacking a closed, unloaded box requires an active packing session, supervisor/admin username and password, and a reason. It preserves contents for correction, invalidates the old QR token and records the approving supervisor. Removed contents remain in the audit data and are excluded from loading and reports.

Dispatch Admin setup lets supervisors maintain vessels, assign assembler/packer/confirmer roles and refresh BC item units. Role changes require the affected user to sign in again. Unit conversion is cached per company/item/UOM; unknown KG conversions block packing rather than guessing a weight.

Dispatch Reports provides order, activity, session and claim tables, CSV exports and a tonnage chart. Filters include date, item, order, route, salesperson and operator. Packed tonnage counts closed boxes. Historical assembly entries without a recorded KG conversion remain unknown rather than being fabricated.

Report dropdowns show item/customer codes alongside names and cache choices from dispatch records for five minutes. Customer filters match number or name. Type BC expressions such as `JF*`, `*beef*`, `B2235|B2240`, or `B22??`; plain values match exactly. Item, order, customer, route, salesperson and operator filters use bound SQL parameters. Click a pending/ongoing/packed summary to narrow the order table and its CSV export.

The Sync status button opens durable history for BC dispatch imports, item-rule/barcode refreshes and UOM refreshes, including start/end times, outcomes and errors. Company cards show cached UOM counts, last refresh and missing KG conversions. This panel polls every 15 seconds while open. History starts with this release; earlier runs are not fabricated, and a running entry without an end time can indicate a server interruption. This is dispatch sync history, not the separate warehouse ETL monitor.

## Packed-line export to Imported Assemblies

Dispatch Admin → BC dispatch sync has a company selector, refresh, pull and **Push packed lines to BC** controls. Push is manual and supervisor/admin-only. It targets that company's `Imported Assemblies` extension table on live BC (`172.16.10.8/FCL` by default), never the mirror or the core Sales Line table. Override the connection with `DISPATCH_BC_HOST` / `DISPATCH_BC_DATABASE`; it uses the configured database account. No BC table is created by the app.

The payload maps OrderNo → Document No_, the original imported SortOrder → Line No_, ItemNo → Item No_, total nonvoid closed/loaded box quantity → Quantity, the last packing user's username → User ID, and the assembly variance reason → Return Reason Code. Only fully packed BC-source orders qualify. Quantities remain in the original order UOM: 12 PC exports 12, not its calculated KG. The supplied staging schema has no weight, piece-count or batch columns, so these remain in dispatch.

New rows use Executed=false, an empty Error Message, and the published BC defaults for Status, Executed At and system-user fields. System ID and creation/modification timestamps are generated for inserts. The app validates column names, types, lengths and required defaults at runtime. Until the extension is published, push reports an actionable error and records no successful exports.

Live verification on 2026-09-24 found the Imported Assemblies tables accessible for FCL, CM, FLM and RMK on `172.16.10.8/FCL`. All four currently lack SQL defaults for the required `Status` and `Executed At` columns. Export remains guarded until BC publishes those defaults or the app is given the confirmed initial values from the AL definitions. No live rows were written during this metadata check.

Exports are processed sequentially in groups of 25 orders, one BC transaction per order, with a company-wide SQL application lock and an application order lock. Original BC item/UOM/line identity is checked. Identical retries are skipped; changed pending rows previously exported by this app may be updated. Different externally-created rows, executed corrections and shipped-line changes require review. Local receipts and durable intent records prevent blind reinsertion when a previous export was interrupted and the staging row has disappeared. Exported means staged in BC, not executed by BC. A pending export intent with no BC row must be reconciled before retrying; do not delete intent records until checking BC execution.

The local additive migration creates DispatchPackedExport and DispatchPackedExportIntent. Validation: `node --test tests/dispatch-packed-export.mjs`; live insert/execution validation remains dependent on publication of the extension.

## Sync schedules

Dispatch Admin → BC dispatch sync provides separate Pull Execute orders and Push packed lines schedules for each selected company. Supervisors set Enabled and Every (minutes), then Save schedule. Whole-number intervals from 1 to 1440 minutes are supported. Saving schedules the next run one interval from the save time; disabling clears future runs, without cancelling a run already claimed.

Settings and due times persist in DispatchSyncSchedule. Existing installations default to enabled two-minute pulls and disabled two-minute pushes. The API checks due jobs every ten seconds and claims them atomically in SQL across API instances; long-running jobs can delay the next run. Existing operation locks continue to prevent overlapping pushes/pulls. Manual sync remains independent of the schedule. Schedule changes take effect without a restart once the updated API is running. Automatic pushes use the same Imported Assemblies checks and appear as scheduled in history.

Assembly and packing both offer barcode correction. Select the intended item and save to update the app and BC's item extension barcode field. Moving a barcode already assigned to another item requires the explicit reassignment checkbox. BC and application databases are separate transactions; if the application update fails after BC succeeds, the error identifies that partial outcome so the cache can be refreshed.

Schema changes run through the dispatch migrations. Validate with `node --test tests/dispatch-chillers.mjs tests/dispatch-sessions.mjs`, and the opt-in database integration scripts `node src/db/testDispatchSessions.js` and `node src/db/testDispatchPacking.js` from `server`. Integration fixtures are removed during cleanup.
