/**
 * services/invoiceImportScheduler.js
 *
 * Background job that pulls posted BC sales invoices (barcoded, rolling window)
 * into the per-company InvoiceHeader tables so the security role can scan/confirm
 * them. Mirrors bcPullScheduler: 30s poll, enable + interval gate, single-flight,
 * plus a manual run-now that ignores the gate. Config + run log live in
 * InvoiceImportModel (AppSettings key 'invoice.import', dbo.InvoiceImportLog).
 */
import { getInvoiceImportConfig, runInvoiceImport } from '../models/InvoiceImportModel.js';
import logger from './logger.js';

let handle = null;
let inFlight = false;
let lastRunAt = 0;

async function tick() {
  if (inFlight) return;
  let cfg;
  try { cfg = await getInvoiceImportConfig(); } catch { return; }
  if (!cfg.enabled) return;
  if (Date.now() - lastRunAt < cfg.intervalMinutes * 60_000) return;
  inFlight = true;
  lastRunAt = Date.now();
  try { await runInvoiceImport({ triggeredBy: 'scheduler' }); }
  catch (e) { logger.error('invoice import tick failed', { error: e.message }); }
  finally { inFlight = false; }
}

export function startInvoiceImportScheduler() {
  if (handle) return;
  handle = setInterval(tick, 30_000);
  logger.info('invoice import scheduler started (poll 30s)');
}

/** Manual run — ignores enable/interval gate; still single-flight. */
export async function runInvoiceImportNow(opts = {}) {
  if (inFlight) throw new Error('An invoice import is already running');
  inFlight = true;
  try { return await runInvoiceImport({ triggeredBy: 'manual', ...opts }); }
  finally { inFlight = false; }
}
