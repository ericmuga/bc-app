/**
 * models/InvoiceImportModel.js
 *
 * Pull posted BC sales invoices that are "due for scanning" into the per-company
 * InvoiceHeader/InvoiceLine tables so the security role can scan & confirm them —
 * the invoice analogue of the POS Sync Center's BC ledger pull.
 *
 * - Source: BC "Sales Invoice Header" (core) + its core-extension companion for the
 *   new barcode field (extCol('Invoice Barcode No_'), format e.g. FCL-IN00978660).
 * - Only barcoded invoices in a rolling posting-date window are imported.
 * - Idempotent by InvoiceNo (existing invoices are skipped, so no duplication);
 *   insertion reuses Invoice.insertDirect which itself guards with IF NOT EXISTS.
 * - Config lives in AppSettings (key 'invoice.import'); each run is logged to
 *   dbo.InvoiceImportLog.
 */
import { db, sql } from '../db/pool.js';
import { bcDb } from '../db/bcPool.js';
import { bcTable, extCol } from '../services/bcTables.js';
import Invoice from './Invoice.js';
import logger from '../services/logger.js';

const IMPORT_KEY = 'invoice.import';
export const DEFAULT_COMPANIES = ['FCL', 'CM', 'RMK', 'FLM'];

async function appPool() { return db.getPool(); }

// ── Config (AppSettings JSON row) ────────────────────────────────────────────
export async function getInvoiceImportConfig() {
  const pool = await appPool();
  const r = await pool.request().input('k', sql.NVarChar(100), IMPORT_KEY)
    .query(`SELECT [SettingValue] FROM [dbo].[AppSettings] WHERE [SettingKey]=@k`);
  let cfg = {};
  try { cfg = JSON.parse(r.recordset[0]?.SettingValue || '{}'); } catch { cfg = {}; }
  return {
    enabled: !!cfg.enabled,
    intervalMinutes: Math.max(1, Number(cfg.intervalMinutes) || 15),
    lookbackDays: Math.max(0, Number(cfg.lookbackDays ?? 1)),   // 1 => today + yesterday
    companies: Array.isArray(cfg.companies) && cfg.companies.length ? cfg.companies : DEFAULT_COMPANIES,
  };
}

export async function saveInvoiceImportConfig(body = {}) {
  const clean = {
    enabled: !!body.enabled,
    intervalMinutes: Math.max(1, Number(body.intervalMinutes) || 15),
    lookbackDays: Math.max(0, Number(body.lookbackDays ?? 1)),
    companies: Array.isArray(body.companies) && body.companies.length
      ? body.companies.map((c) => String(c).toUpperCase()) : DEFAULT_COMPANIES,
  };
  const pool = await appPool();
  await pool.request()
    .input('k', sql.NVarChar(100), IMPORT_KEY)
    .input('v', sql.NVarChar(sql.MAX), JSON.stringify(clean))
    .query(`
      MERGE [dbo].[AppSettings] AS t USING (SELECT @k AS SettingKey) AS s ON t.[SettingKey]=s.SettingKey
      WHEN MATCHED THEN UPDATE SET [SettingValue]=@v, [UpdatedAt]=GETUTCDATE()
      WHEN NOT MATCHED THEN INSERT ([SettingKey],[SettingValue]) VALUES (@k,@v);`);
  return getInvoiceImportConfig();
}

// ── BC reads ─────────────────────────────────────────────────────────────────
function d(x) { const dt = new Date(x); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`; }

async function readBcHeaders(company, dateFrom, dateTo) {
  const bc = await bcDb.getPool();
  const H = bcTable(company, 'Sales Invoice Header');
  const E = bcTable(company, 'Sales Invoice Header', { coreExt: true });
  const cBar = extCol('Invoice Barcode No_'), cQr = extCol('QRCodeurl'),
        cRoute = extCol('Route Code'), cEtims = extCol('CUInvoiceNo');
  const r = await bc.request()
    .input('df', sql.Date, dateFrom).input('dt', sql.Date, dateTo)
    .query(`
      SELECT h.[No_] AS InvoiceNo, CAST(h.[Posting Date] AS DATE) AS PostingDate,
             CAST(h.[Order Date] AS DATE) AS OrderDate,
             h.[Bill-to Customer No_] AS CustomerNo, h.[Bill-to Name] AS CustomerName,
             h.[Salesperson Code] AS SalespersonCode, h.[External Document No_] AS ExternalDocNo,
             h.[Location Code] AS LocationCode, h.[Ship-to Name] AS ShipToName,
             LTRIM(RTRIM(e.${cBar}))   AS Barcode,
             e.${cQr}    AS QRCodeUrl,
             e.${cRoute} AS RouteCode,
             e.${cEtims} AS EtimsInvoiceNo
      FROM ${H} h JOIN ${E} e ON e.[No_]=h.[No_]
      WHERE CAST(h.[Posting Date] AS DATE) BETWEEN @df AND @dt
        AND LTRIM(RTRIM(e.${cBar})) <> ''
      ORDER BY h.[Posting Date] DESC, h.[No_] DESC`);
  return r.recordset;
}

async function readBcLines(company, invoiceNos) {
  const bc = await bcDb.getPool();
  const L = bcTable(company, 'Sales Invoice Line');
  const byInvoice = new Map();
  const BATCH = 300;
  for (let i = 0; i < invoiceNos.length; i += BATCH) {
    const chunk = invoiceNos.slice(i, i + BATCH);
    const req = bc.request();
    chunk.forEach((no, j) => req.input(`n${j}`, sql.NVarChar(40), no));
    const r = await req.query(`
      SELECT [Document No_] AS InvoiceNo, [Line No_] AS [LineNo], [No_] AS ItemNo,
             [Description] AS Description, [Quantity] AS Quantity, [Quantity (Base)] AS QuantityBase,
             [Unit Price] AS UnitPrice, [Line Amount] AS LineAmount, [Amount Including VAT] AS LineAmountInclVat,
             [VAT Identifier] AS VatIdentifier, [Units per Parcel] AS UnitsPerParcel,
             [Unit of Measure Code] AS UnitOfMeasure, [Gen_ Prod_ Posting Group] AS PostingGroup
      FROM ${L}
      WHERE [Document No_] IN (${chunk.map((_, j) => `@n${j}`).join(',')}) AND [No_] <> ''
      ORDER BY [Line No_]`);
    for (const l of r.recordset) {
      if (!byInvoice.has(l.InvoiceNo)) byInvoice.set(l.InvoiceNo, []);
      byInvoice.get(l.InvoiceNo).push(l);
    }
  }
  return byInvoice;
}

/** InvoiceNos from this BC set that already exist locally (so we skip them). */
async function existingInvoiceNos(company, invoiceNos) {
  const pool = await appPool();
  const schema = db.getCompanySchema(company);
  const have = new Set();
  const BATCH = 500;
  for (let i = 0; i < invoiceNos.length; i += BATCH) {
    const chunk = invoiceNos.slice(i, i + BATCH);
    const req = pool.request();
    chunk.forEach((no, j) => req.input(`n${j}`, sql.NVarChar(30), no));
    const r = await req.query(
      `SELECT [InvoiceNo] FROM ${schema}.[InvoiceHeader] WHERE [InvoiceNo] IN (${chunk.map((_, j) => `@n${j}`).join(',')})`
    );
    r.recordset.forEach((x) => have.add(String(x.InvoiceNo)));
  }
  return have;
}

// ── Import one company for a date window ─────────────────────────────────────
export async function pullInvoicesForCompany(company, { dateFrom, dateTo } = {}) {
  const co = String(company).toUpperCase();
  const headers = await readBcHeaders(co, dateFrom, dateTo);
  if (!headers.length) return { company: co, scanned: 0, imported: 0, skipped: 0 };

  const nos = headers.map((h) => String(h.InvoiceNo));
  const have = await existingInvoiceNos(co, nos);
  const fresh = headers.filter((h) => !have.has(String(h.InvoiceNo)));
  if (!fresh.length) return { company: co, scanned: headers.length, imported: 0, skipped: headers.length };

  const linesByInvoice = await readBcLines(co, fresh.map((h) => String(h.InvoiceNo)));

  let imported = 0, failed = 0;
  for (const h of fresh) {
    const invoiceData = {
      invoiceNo:       h.InvoiceNo,
      customerNo:      h.CustomerNo,
      customerName:    h.CustomerName,
      salespersonCode: h.SalespersonCode,
      routeCode:       h.RouteCode,
      shipToName:      h.ShipToName,
      externalDocNo:   h.ExternalDocNo,
      orderDate:       h.OrderDate,
      postingDate:     h.PostingDate,
      invoicedAt:      h.PostingDate || new Date(),
      etimsInvoiceNo:  h.EtimsInvoiceNo,
      qrcodeUrl:       h.QRCodeUrl,
      barcode:         h.Barcode,           // the BC Invoice Barcode No_ — used for scanning
    };
    const lines = (linesByInvoice.get(String(h.InvoiceNo)) || []).map((l) => ({
      lineNo: l.LineNo, itemNo: l.ItemNo, description: l.Description,
      quantity: l.Quantity, quantityBase: l.QuantityBase, unitPrice: l.UnitPrice,
      lineAmount: l.LineAmount, lineAmountInclVat: l.LineAmountInclVat,
      vatIdentifier: l.VatIdentifier, unitsPerParcel: l.UnitsPerParcel,
      unitOfMeasure: l.UnitOfMeasure, postingGroup: l.PostingGroup,
    }));
    try { await Invoice.insertDirect(co, invoiceData, lines); imported++; }
    catch (e) { failed++; logger.warn('invoice import failed', { company: co, invoiceNo: h.InvoiceNo, error: e.message }); }
  }
  return { company: co, scanned: headers.length, imported, skipped: headers.length - fresh.length, failed };
}

/** Run the import for every configured company over the rolling window. */
export async function runInvoiceImport({ triggeredBy = 'manual', companies = null, dateFrom = null, dateTo = null } = {}) {
  const cfg = await getInvoiceImportConfig();
  const cos = companies && companies.length ? companies : cfg.companies;
  const now = new Date();
  const to = dateTo ? new Date(dateTo) : now;
  const from = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - cfg.lookbackDays);
  const df = d(from), dt = d(to);

  const results = [];
  let totalImported = 0, totalScanned = 0;
  for (const co of cos) {
    const started = new Date();
    try {
      const r = await pullInvoicesForCompany(co, { dateFrom: df, dateTo: dt });
      totalImported += r.imported; totalScanned += r.scanned;
      await logInvoiceImportRun({ company: co, dateFrom: df, dateTo: dt, scanned: r.scanned, imported: r.imported, skipped: r.skipped, ok: true, error: null, durationMs: Date.now() - started.getTime(), triggeredBy });
      results.push(r);
    } catch (e) {
      await logInvoiceImportRun({ company: co, dateFrom: df, dateTo: dt, scanned: 0, imported: 0, skipped: 0, ok: false, error: e.message, durationMs: Date.now() - started.getTime(), triggeredBy });
      results.push({ company: co, error: e.message });
      logger.error('invoice import company failed', { company: co, error: e.message });
    }
  }
  logger.info('runInvoiceImport', { triggeredBy, companies: cos, from: df, to: dt, totalScanned, totalImported });
  return { from: df, to: dt, companies: cos, totalScanned, totalImported, results };
}

// ── Run log (dbo.InvoiceImportLog) ───────────────────────────────────────────
export async function logInvoiceImportRun(row) {
  const pool = await appPool();
  await pool.request()
    .input('Company',    sql.NVarChar(20),  row.company || null)
    .input('DateFrom',   sql.NVarChar(20),  row.dateFrom || null)
    .input('DateTo',     sql.NVarChar(20),  row.dateTo || null)
    .input('Scanned',    sql.Int,           row.scanned || 0)
    .input('Imported',   sql.Int,           row.imported || 0)
    .input('Skipped',    sql.Int,           row.skipped || 0)
    .input('Ok',         sql.Bit,           row.ok ? 1 : 0)
    .input('Error',      sql.NVarChar(500), row.error || null)
    .input('DurationMs', sql.Int,           row.durationMs || 0)
    .input('TriggeredBy',sql.NVarChar(100), row.triggeredBy || null)
    .query(`INSERT INTO [dbo].[InvoiceImportLog]
      ([Company],[DateFrom],[DateTo],[Scanned],[Imported],[Skipped],[Ok],[Error],[DurationMs],[TriggeredBy],[FinishedAt])
      VALUES (@Company,@DateFrom,@DateTo,@Scanned,@Imported,@Skipped,@Ok,@Error,@DurationMs,@TriggeredBy,GETUTCDATE())`);
}

export async function listInvoiceImportRuns({ limit = 100 } = {}) {
  const pool = await appPool();
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));
  const r = await pool.request().input('lim', sql.Int, lim)
    .query(`SELECT TOP (@lim) * FROM [dbo].[InvoiceImportLog] ORDER BY [StartedAt] DESC`);
  return r.recordset.map((x) => ({
    runId: x.RunId, startedAt: x.StartedAt, finishedAt: x.FinishedAt, company: x.Company,
    dateFrom: x.DateFrom, dateTo: x.DateTo, scanned: x.Scanned, imported: x.Imported,
    skipped: x.Skipped, ok: !!x.Ok, error: x.Error, durationMs: x.DurationMs, triggeredBy: x.TriggeredBy,
  }));
}
