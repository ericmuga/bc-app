# Warehouse downloads: current-period ETL

## Period and source selection

- Current means posting dates **on or after 2025-01-06** (slaughter uses slaughter date).
- Legacy means dates **before 2025-01-06**. RMK legacy remains in `rm-bc` on `172.16.10.9`; CM/FCL/FLM legacy remain in `fcl-bc-main` there.
- The selector has one Current source per company. Old `*-LIVE` API keys alias `*-CUR`; they are no longer separate options.
- Current reads ERP until that company's initial warehouse load is complete, then automatically reads its FCLWHS mirror. Report and lookup requests use the same routing rules. Streamed exports pin the selected backend for their entire duration.
- Legacy remains separate history for now. The ERP fallback is retained for initial load/warehouse connection failures; it is not a separate user-selectable source.

## Installed objects

`dbo.DL_<company>_<table>`: 17 slim report/master mirrors for each of CM, FCL, FLM, RMK (68 total). Matching `DLStage_*` tables hold at most a batch. These are separate from all pre-existing warehouse materialisations and refresh jobs.

Tables cover posting groups, items, customers, vendors, G/L accounts, posted purchase invoices/receipts, posted sales invoices/credit memos, G/L entries, item ledger entries, value entries and slaughter data. Only required report/filter/lookup columns, primary keys, date and source rowversion are copied.

`DL_TableState` records the committed watermark, current window, last primary-key cursor, initial-load completion, processed-row count, freshness and errors. `DL_CompanyState` records readiness and last complete refresh. `DL_Run` records orchestration outcomes. Warehouse Sync Center shows per-company and per-table progress and the Agent job.

## Scheduling and consistency

SQL Agent job **BC Downloads - ERP to FCLWHS (2 hourly)** calls `dbo.Refresh_DownloadWarehouse @BatchSize=5000` at 00:15, 02:15, … (warehouse server time). SQL Agent prevents overlapping job instances; a session application lock also prevents concurrent orchestrator calls. Failed jobs retry twice at 10-minute intervals. A first backfill may exceed two hours; the next schedule does not start an overlapping load.

Masters load first, followed by document headers/lines and ledgers. A failure in one company is logged and other companies continue. A company becomes eligible for warehouse reads only after all 17 tables have completed. Refreshes publish committed batches, not a single point-in-time snapshot of the entire ERP database; the displayed time is the last complete company refresh.

Each remote fetch uses primary-key keyset pagination, never OFFSET. ERP reads are committed, with an exclusive high rowversion bound from `MIN_ACTIVE_ROWVERSION()` in the source database so in-flight transactions are not skipped. Both inserted and edited records are upserted, including late edits to earlier current-period postings. Rows edited out of the current date range are removed from the mirror. The first load filters at the cutoff; subsequent increments inspect all changes so date movements are handled.

Remote staging happens outside the warehouse write transaction, avoiding MSDTC. Each local batch upsert and its resume cursor commit together. A failed chunk can safely be retried. Watermarks advance only after the entire fixed window completes. Stage tables are reused, not accumulated. The default is 5,000 rows, with accepted sizes 100–20,000 and a 100ms pause between batches.

Rowversion does **not** encode physical deletes or primary-key renames. These are not automatically removed by the incremental feed; posted accounting data is normally retained. A controlled mirror rebuild is needed after such source maintenance or an ERP database restore. Do not treat these mirrors as CDC or as a transactional backup. Master descriptions/posting groups do update through the ordinary incremental feed.

## Installation and recovery

From `server`:

```powershell
node src/db/installWarehouseDownloads.js
node src/db/installWarehouseDownloads.js --apply
node src/db/installWarehouseDownloads.js --apply --start
```

Without `--apply`, generates a reviewable `warehouse-downloads.sql` at repository root. Installation preflights every remote column, creates missing objects, updates the owned procedures and idempotently registers the job/schedule. Existing mirror data and checkpoints are preserved on reinstall. It does not change existing fact-table jobs or source ERP tables. Use `DOWNLOAD_ERP_LINK` to override `FC-BC-DEV-DB01`, and `BC_DB_NAME` / `WHS_DB_NAME` for database names.

For ordinary errors, resolve the reported error and use **Run now** on this Agent job; it resumes from the last committed cursor. Check both job history and table errors. For a source restore or controlled complete rebuild, stop the job, disable it temporarily, set company readiness to NULL, truncate only that company's owned DL/ DLStage mirrors and reset its table-state watermarks/cursors/initial flags, then restart the job and re-enable scheduling. Current reads use ERP during the rebuild. Never truncate source tables or unrelated warehouse facts.

## Verification

`node --test tests/legacy-reports.mjs tests/warehouse-download-etl.mjs`

The installer preflight covers all 68 mirror projections. A 100-row chunk test copied 1,042 FLM invoice lines across multiple pages. Initial bootstrap progress is available in Warehouse Sync Center. Compare bounded document/date extracts from ERP and the mirror after a company becomes ready before removing ERP fallback permanently.
