# Dispatch assembly sessions and chiller out-tray

## Setup and routing

Run `node src/db/migrateDispatchChillers.js` from `server` (also included in startup and full migration). This is additive: session history, assembly audit events, per-line revision/batch/pieces, and a chiller movement ledger. No opening stock is created.

Dispatch Setup retains the CHILLERSCODE mappings. **Refresh BC item rules** refreshes barcode and unit metadata and enforces inventory posting group **JF-SAUSAGE → CHILLER U / Part B**, company by company. BC dispatch imports run this refresh too. The rule also updates the Part No_ extension field on unshipped BC sales orders (document type 1), never quotes or posted documents. Existing unassembled dispatch lines are rerouted; affected orders return to registry confirmation so the changed Part B is reviewed. Assembled/packing history is preserved. Mapping edits cannot move JF-SAUSAGE out of U.

The existing **packer** role is the assembler role. **Bypass assignment** permits chiller selection without supervisor assignment; registry confirmation is still required. It was enabled for the requested workflow on 24 September 2026. Turning it off restores per-part assignment enforcement.

## Assembler workflow

1. Start assembly. The server creates one open session per assembler and persists its UTC start time. The visible elapsed timer survives reload/login; end the session explicitly.
2. Choose Pending assembly, select a chiller and use shipment date/customer/order filters. Open an order in the responsive modal.
3. Pending and already assembled lines are separate. Scan a barcode/item number or select a line.
4. PC/non-weight lines require integer pieces. Weighted lines require weight in the order UOM and integer pieces. Every completion requires a 4- or 5-character alphanumeric batch.
5. Quantity differences reveal a default reason: short supply below the order quantity, weight difference above it. The assembler may choose either reason when appropriate.
6. Mark the line assembled. All lines in the order part must be completed before the part is automatically marked assembled, including lines in other chillers. The whole order becomes assembled after its parts are complete.
7. Completed lines require **Correct / reassemble** plus an explanation. Only their original assembler or a supervisor/admin may correct them, and only before packing starts. Revision checks reject stale/double submissions. The earlier entry stays in the audit report; its stock issue is reversed and the corrected issue is recorded atomically.

Reports → **My assemblies** lists the user's sessions, duration, orders, line counts, corrections and detailed entries. Chiller attendants/supervisors can view all assemblers' sessions. Existing pre-session lines show their legacy saved values, but no historical sessions or stock issues are fabricated.

## Out-tray and future inbound transfers

**Chiller movements** is a separate menu for attendants/supervisors/admins. Each completed assembly writes a negative movement in BC base units, using the order's company and the BC item/unit conversion. Corrections write a positive reversal followed by the replacement issue. Batch, operator, order, part and session audit are linked. BC quantity-on-hand and opening stock are not imported or deducted again.

The attendant view shows gross issues, reversals and **net out** with CSV extraction. These are outbound totals, not available stock balances. Completed history is not imported into the out-tray retroactively.

The attendant listings support searchable dropdowns on text columns and exact numeric filters on quantities. Assembly activity can be filtered by shipment or assembly date, and the out-tray uses movement dates. Date ranges include both endpoints; assembly timestamps use Nairobi dates. Apply/refresh loads out-tray totals for the selected range, and Clear filters resets the selection. CSV extraction respects both the chiller selection and column filters. Assembly session reports also provide assembler and detailed-entry filters alongside their existing date range.

WMS inbound is deliberately unconnected. `DispatchChillerInboundSource` provides disabled source configuration for the separate server/database, starting point and cursor. Movement source-system/source-entry fields and a unique index provide deduplication for that future feed. No WMS endpoint, credentials, starting point or opening quantity is assumed.

## Validation

- `node --test tests/dispatch-sessions.mjs tests/dispatch-chillers.mjs`
- `node src/db/testDispatchSessions.js` from `server`: opt-in database integration check; creates uniquely named fixture orders and removes all fixture data in cleanup.
- Client Vite production build.
