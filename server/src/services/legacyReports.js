/**
 * services/legacyReports.js
 * ---------------------------------------------------------------------------
 * EXTENSIBLE REGISTRY for the "Reporting → Legacy Downloads" module.
 *
 * A read-only export tool over LEGACY Business Central databases. Table names
 * here were discovered by inspecting the live schemas (INFORMATION_SCHEMA) on
 * 172.16.10.9 — they use classic NAV naming: [dbo].[{Prefix}${Table Name}]
 * (NO GUID suffix, unlike the modern BC databases handled by bcTables.js).
 *
 * ─── HOW TO ADD A NEW SOURCE ────────────────────────────────────────────────
 * Push another entry onto SOURCES with { key, label, database, prefix }. The
 * `datasets: LEGACY_DATASETS` reference is shared because every company on these
 * boxes has identical table shapes. If a new DB has a different schema, give it
 * its own datasets array.
 *
 * ─── HOW TO ADD A NEW DATASET ───────────────────────────────────────────────
 * Add an entry to LEGACY_DATASETS with:
 *   key, label
 *   header       BC table for the header (alias `h`)   — required
 *   line         BC table for the lines (alias `l`)    — optional (header+line)
 *   lineJoin     ON-clause when `line` is set (defaults to l.[Document No_]=h.[No_])
 *   dateColumn   column the posting-date range filters on
 *   order        ORDER BY expression (must be deterministic for OFFSET/FETCH)
 *   columns      [{ col, as }]  explicit, whitelisted SELECT list
 *   filters      { filterKey: { col, label } }  optional equality filters
 *   summary      optional roll-up spec (see below)
 *
 * ─── HOW TO ADD A SUMMARY (roll-up) TO A DATASET ────────────────────────────
 * Give the dataset a `summary` object. It reuses the SAME source/prefix, the
 * SAME base FROM (header [+ line]) and the SAME date-range + equality filters as
 * the detail query; it only changes the SELECT into a GROUP BY roll-up:
 *   summary: {
 *     label      friendly name shown in the UI (e.g. 'Summary by Document')
 *     joins      [{ table, alias, on, type }]  optional extra whitelisted joins
 *                (e.g. LEFT JOIN the G/L Account table to pull the account name)
 *     groupBy    [{ col, as }]  columns that appear in BOTH the SELECT and the
 *                GROUP BY (the grain of one summary row)
 *     aggregates [{ expr, as }]  aggregate expressions (SUM(...), COUNT_BIG(*))
 *     order      ORDER BY expression (deterministic; used for OFFSET/FETCH)
 *   }
 * Only columns/tables named HERE are ever emitted — `mode=summary` from the
 * request just picks this pre-declared spec; it never carries SQL.
 *
 * All table/column names come from THIS file (a whitelist) — never from user
 * input. Every filter VALUE is bound as a parameter (see LegacyReportModel).
 */

// Default posting-date column shared by all header tables.
const POSTING_DATE = 'h.[Posting Date]';

const LEGACY_DATASETS = [
  {
    key: 'postedPurchaseInvoices',
    label: 'Posted Purchase Invoices',
    header: 'Purch_ Inv_ Header',
    line:   'Purch_ Inv_ Line',
    dateColumn: POSTING_DATE,
    order: 'h.[Posting Date] DESC, h.[No_], l.[Line No_]',
    columns: [
      { col: 'h.[No_]',                    as: 'DocumentNo' },
      { col: 'h.[Posting Date]',           as: 'PostingDate' },
      { col: 'h.[Document Date]',          as: 'DocumentDate' },
      { col: 'h.[Buy-from Vendor No_]',    as: 'VendorNo' },
      { col: 'h.[Buy-from Vendor Name]',   as: 'VendorName' },
      { col: 'h.[Pay-to Vendor No_]',      as: 'PayToVendorNo' },
      { col: 'h.[Vendor Invoice No_]',     as: 'VendorInvoiceNo' },
      { col: 'h.[Order No_]',              as: 'OrderNo' },
      { col: 'h.[Source Code]',            as: 'SourceCode' },
      { col: 'h.[Gen_ Bus_ Posting Group]',as: 'GenBusPostingGroup' },
      { col: 'l.[Line No_]',               as: 'LineNo' },
      { col: 'l.[No_]',                    as: 'ItemNo' },
      { col: 'l.[Description]',            as: 'Description' },
      { col: 'l.[Quantity]',               as: 'Quantity' },
      { col: 'l.[Quantity (Base)]',        as: 'QuantityBase' },
      { col: 'l.[Line Amount]',            as: 'LineAmount' },
      { col: 'l.[Amount]',                 as: 'Amount' },
      { col: 'l.[Amount Including VAT]',   as: 'AmountInclVAT' },
      { col: 'l.[VAT Base Amount]',        as: 'VATBaseAmount' },
      { col: 'l.[Posting Group]',          as: 'PostingGroup' },
      { col: 'l.[Gen_ Prod_ Posting Group]', as: 'GenProdPostingGroup' },
    ],
    filters: {
      documentNo: { col: 'h.[No_]',                 label: 'Document No.' },
      vendorNo:   { col: 'h.[Buy-from Vendor No_]', label: 'Vendor No.' },
    },
    summary: {
      label: 'Summary by Document',
      groupBy: [
        { col: 'h.[No_]',                  as: 'DocumentNo' },
        { col: 'h.[Posting Date]',         as: 'PostingDate' },
        { col: 'h.[Buy-from Vendor No_]',  as: 'VendorNo' },
        { col: 'h.[Buy-from Vendor Name]', as: 'VendorName' },
      ],
      aggregates: [
        { expr: 'COUNT_BIG(l.[Line No_])',        as: 'LineCount' },
        { expr: 'SUM(l.[Amount])',                as: 'TotalAmount' },
        { expr: 'SUM(l.[Amount Including VAT])',  as: 'TotalAmountInclVAT' },
      ],
      order: 'h.[Posting Date] DESC, h.[No_]',
    },
  },

  {
    key: 'postedPurchaseReceipts',
    label: 'Posted Purchase Receipts',
    header: 'Purch_ Rcpt_ Header',
    line:   'Purch_ Rcpt_ Line',
    dateColumn: POSTING_DATE,
    order: 'h.[Posting Date] DESC, h.[No_], l.[Line No_]',
    columns: [
      { col: 'h.[No_]',                  as: 'DocumentNo' },
      { col: 'h.[Posting Date]',         as: 'PostingDate' },
      { col: 'h.[Document Date]',        as: 'DocumentDate' },
      { col: 'h.[Buy-from Vendor No_]',  as: 'VendorNo' },
      { col: 'h.[Buy-from Vendor Name]', as: 'VendorName' },
      { col: 'h.[Order No_]',            as: 'OrderNo' },
      { col: 'h.[Vendor Shipment No_]',  as: 'VendorShipmentNo' },
      { col: 'h.[Source Code]',          as: 'SourceCode' },
      { col: 'l.[Line No_]',             as: 'LineNo' },
      { col: 'l.[No_]',                  as: 'ItemNo' },
      { col: 'l.[Description]',          as: 'Description' },
      { col: 'l.[Quantity]',             as: 'Quantity' },
      { col: 'l.[Quantity (Base)]',      as: 'QuantityBase' },
      { col: 'l.[Quantity Invoiced]',    as: 'QuantityInvoiced' },
      { col: 'l.[Posting Group]',        as: 'PostingGroup' },
      { col: 'l.[Gen_ Prod_ Posting Group]', as: 'GenProdPostingGroup' },
    ],
    filters: {
      documentNo: { col: 'h.[No_]',                 label: 'Receipt No.' },
      vendorNo:   { col: 'h.[Buy-from Vendor No_]', label: 'Vendor No.' },
    },
    // Purchase-receipt lines carry quantities, not amounts, so the per-document
    // "total" here is the received quantity (there is no amount column to sum).
    summary: {
      label: 'Summary by Document',
      groupBy: [
        { col: 'h.[No_]',                  as: 'DocumentNo' },
        { col: 'h.[Posting Date]',         as: 'PostingDate' },
        { col: 'h.[Buy-from Vendor No_]',  as: 'VendorNo' },
        { col: 'h.[Buy-from Vendor Name]', as: 'VendorName' },
      ],
      aggregates: [
        { expr: 'COUNT_BIG(l.[Line No_])',    as: 'LineCount' },
        { expr: 'SUM(l.[Quantity])',          as: 'TotalQuantity' },
        { expr: 'SUM(l.[Quantity (Base)])',   as: 'TotalQuantityBase' },
      ],
      order: 'h.[Posting Date] DESC, h.[No_]',
    },
  },

  {
    key: 'postedSalesInvoices',
    label: 'Posted Sales Invoices',
    header: 'Sales Invoice Header',
    line:   'Sales Invoice Line',
    dateColumn: POSTING_DATE,
    order: 'h.[Posting Date] DESC, h.[No_], l.[Line No_]',
    columns: [
      { col: 'h.[No_]',                     as: 'DocumentNo' },
      { col: 'h.[Posting Date]',            as: 'PostingDate' },
      { col: 'h.[Document Date]',           as: 'DocumentDate' },
      { col: 'h.[Sell-to Customer No_]',    as: 'CustomerNo' },
      { col: 'h.[Sell-to Customer Name]',   as: 'CustomerName' },
      { col: 'h.[Bill-to Customer No_]',    as: 'BillToCustomerNo' },
      { col: 'h.[Order No_]',               as: 'OrderNo' },
      { col: 'h.[External Document No_]',   as: 'ExternalDocumentNo' },
      { col: 'h.[Customer Posting Group]',  as: 'CustomerPostingGroup' },
      { col: 'h.[Source Code]',             as: 'SourceCode' },
      { col: 'l.[Line No_]',                as: 'LineNo' },
      { col: 'l.[No_]',                     as: 'ItemNo' },
      { col: 'l.[Description]',             as: 'Description' },
      { col: 'l.[Quantity]',                as: 'Quantity' },
      { col: 'l.[Quantity (Base)]',         as: 'QuantityBase' },
      { col: 'l.[Line Amount]',             as: 'LineAmount' },
      { col: 'l.[Amount]',                  as: 'Amount' },
      { col: 'l.[Amount Including VAT]',    as: 'AmountInclVAT' },
      { col: 'l.[VAT Base Amount]',         as: 'VATBaseAmount' },
      { col: 'l.[Posting Group]',           as: 'PostingGroup' },
    ],
    filters: {
      documentNo: { col: 'h.[No_]',                  label: 'Invoice No.' },
      customerNo: { col: 'h.[Sell-to Customer No_]', label: 'Customer No.' },
    },
    summary: {
      label: 'Summary by Document',
      groupBy: [
        { col: 'h.[No_]',                   as: 'DocumentNo' },
        { col: 'h.[Posting Date]',          as: 'PostingDate' },
        { col: 'h.[Sell-to Customer No_]',  as: 'CustomerNo' },
        { col: 'h.[Sell-to Customer Name]', as: 'CustomerName' },
      ],
      aggregates: [
        { expr: 'COUNT_BIG(l.[Line No_])',       as: 'LineCount' },
        { expr: 'SUM(l.[Amount])',               as: 'TotalAmount' },
        { expr: 'SUM(l.[Amount Including VAT])', as: 'TotalAmountInclVAT' },
      ],
      order: 'h.[Posting Date] DESC, h.[No_]',
    },
  },

  {
    key: 'glEntries',
    label: 'G/L Entries',
    header: 'G_L Entry',
    line:   null, // single-table dataset
    dateColumn: POSTING_DATE,
    order: 'h.[Entry No_]',
    columns: [
      { col: 'h.[Entry No_]',           as: 'EntryNo' },
      { col: 'h.[G_L Account No_]',     as: 'GLAccountNo' },
      { col: 'h.[Posting Date]',        as: 'PostingDate' },
      { col: 'h.[Document Type]',       as: 'DocumentType' },
      { col: 'h.[Document No_]',        as: 'DocumentNo' },
      { col: 'h.[Description]',         as: 'Description' },
      { col: 'h.[Amount]',              as: 'Amount' },
      { col: 'h.[Debit Amount]',        as: 'DebitAmount' },
      { col: 'h.[Credit Amount]',       as: 'CreditAmount' },
      { col: 'h.[Bal_ Account No_]',    as: 'BalAccountNo' },
      { col: 'h.[Gen_ Posting Type]',   as: 'GenPostingType' },
      { col: 'h.[Source Code]',         as: 'SourceCode' },
      { col: 'h.[Source Type]',         as: 'SourceType' },
      { col: 'h.[Source No_]',          as: 'SourceNo' },
      { col: 'h.[External Document No_]', as: 'ExternalDocumentNo' },
    ],
    filters: {
      documentNo:  { col: 'h.[Document No_]',   label: 'Document No.' },
      glAccountNo: { col: 'h.[G_L Account No_]', label: 'G/L Account No.' },
      sourceCode:  { col: 'h.[Source Code]',    label: 'Source Code' },
    },
    summary: {
      label: 'Summary by G/L Account',
      // LEFT JOIN the G/L Account master so entries still show even if the
      // account row is missing; [Name] is the account name "if available".
      joins: [
        { table: 'G_L Account', alias: 'ga', on: 'ga.[No_] = h.[G_L Account No_]', type: 'LEFT' },
      ],
      groupBy: [
        { col: 'h.[G_L Account No_]', as: 'GLAccountNo' },
        { col: 'ga.[Name]',           as: 'GLAccountName' },
      ],
      aggregates: [
        { expr: 'COUNT_BIG(*)',      as: 'EntryCount' },
        { expr: 'SUM(h.[Amount])',   as: 'TotalAmount' },
      ],
      order: 'h.[G_L Account No_]',
    },
  },
];

// ─── SOURCES ─────────────────────────────────────────────────────────────────
// server: same box the weekly-targets feature already reaches (172.16.10.9).
// database: the physical legacy DB. prefix: the NAV company table prefix.
const LEGACY_SERVER = process.env.LEGACY_DB_HOST || '172.16.10.9';

export const SOURCES = [
  { key: 'RMK', label: 'RMK — Rosemark (legacy)',        server: LEGACY_SERVER, database: 'rm-bc',       prefix: 'RMK', datasets: LEGACY_DATASETS },
  { key: 'FCL', label: "FCL — Farmer's Choice (legacy)", server: LEGACY_SERVER, database: 'fcl-bc-main', prefix: 'FCL', datasets: LEGACY_DATASETS },
  // fcl-bc-main also physically holds the CM and FLM companies — enabled here to
  // demonstrate how cheap adding a source is (same DB, different NAV prefix):
  { key: 'CM',  label: 'CM — Choice Meats (legacy)',     server: LEGACY_SERVER, database: 'fcl-bc-main', prefix: 'CM',  datasets: LEGACY_DATASETS },
  { key: 'FLM', label: 'FLM — Farmlands (legacy)',       server: LEGACY_SERVER, database: 'fcl-bc-main', prefix: 'FLM', datasets: LEGACY_DATASETS },
];

/** Look up a source by key. */
export function getSource(sourceKey) {
  return SOURCES.find((s) => s.key === sourceKey) || null;
}

/** Look up a dataset within a source by key. */
export function getDataset(source, datasetKey) {
  if (!source) return null;
  return source.datasets.find((d) => d.key === datasetKey) || null;
}

/**
 * Fully-qualified, safely-quoted legacy table reference:
 *   [dbo].[{prefix}${tableName}]
 * tableName comes from the registry (whitelist), never user input.
 */
export function legacyTable(prefix, tableName) {
  return `[dbo].[${prefix}$${tableName}]`;
}

/**
 * Client-facing catalogue: sources + datasets + the filter controls each
 * dataset supports (never leaks server / table names).
 */
export function catalogue() {
  return SOURCES.map((s) => ({
    key: s.key,
    label: s.label,
    datasets: s.datasets.map((d) => ({
      key: d.key,
      label: d.label,
      hasLines: !!d.line,
      hasSummary: !!d.summary,
      summaryLabel: d.summary?.label || null,
      filters: Object.entries(d.filters || {}).map(([key, meta]) => ({ key, label: meta.label })),
    })),
  }));
}
