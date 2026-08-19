/**
 * services/bcPullScheduler.js
 * Background job that periodically runs the same BC ledger pull as the Sync Center
 * ("Pull BC transfers/adjustments/sales"), for every shop that has a stock baseline
 * (watermark). Interval + enable + entry types are configurable at runtime
 * (pos.bcPull in AppSettings) and every run is logged to PosBcPullLog.
 */
import logger from './logger.js';
import {
  getBcPullConfig, shopsWithWatermark, logBcPullRun, pullBcLedgerEntries,
} from '../models/PosStockModel.js';

let handle = null;
let inFlight = false;
let lastRunAt = 0;

// One pass over every shop with a baseline. Returns a summary.
async function runPass(entryTypes, triggeredBy) {
  const shops = await shopsWithWatermark();
  logger.info('bcPull: run start', { shops: shops.length, entryTypes, triggeredBy });
  let inserted = 0, failed = 0;
  for (const s of shops) {
    const t0 = Date.now();
    try {
      const r = await pullBcLedgerEntries({ shopCode: s.shopCode, company: s.company, entryTypes, userName: triggeredBy });
      inserted += r.inserted;
      await logBcPullRun({
        shopCode: s.shopCode, company: r.company, locationCode: r.locationCode,
        fromEntryNo: r.fromEntryNo, toEntryNo: r.toEntryNo, inserted: r.inserted, skipped: r.skipped,
        skippedPosSales: r.skippedPosSales, ok: true, durationMs: Date.now() - t0, triggeredBy,
      });
    } catch (e) {
      failed++;
      await logBcPullRun({ shopCode: s.shopCode, company: s.company, locationCode: s.locationCode, ok: false, error: e.message, durationMs: Date.now() - t0, triggeredBy }).catch(() => {});
      logger.error('bcPull: shop failed', { shopCode: s.shopCode, error: e.message });
    }
  }
  return { shops: shops.length, inserted, failed };
}

async function tick() {
  if (inFlight) return;
  let cfg;
  try { cfg = await getBcPullConfig(); } catch (e) { logger.error('bcPull: config read failed', { error: e.message }); return; }
  if (!cfg.enabled) return;
  if (Date.now() - lastRunAt < cfg.intervalMinutes * 60_000) return;
  inFlight = true; lastRunAt = Date.now();
  try { await runPass(cfg.entryTypes, 'scheduler'); }
  catch (e) { logger.error('bcPull: run failed', { error: e.message }); }
  finally { inFlight = false; }
}

export function startBcPullScheduler() {
  if (handle) return;
  // Poll every 30s; tick() gates on enabled + intervalMinutes so the interval can
  // be changed live (from the Sync Center) without a server restart.
  handle = setInterval(() => { tick().catch((e) => logger.error('bcPull scheduler tick error', { error: e.message })); }, 30_000);
  logger.info('BC pull scheduler started (checks every 30s)');
}

/** Run one pass immediately regardless of the enable/interval gate (manual "run now"). */
export async function runBcPullNow() {
  if (inFlight) return { skipped: 'already running' };
  inFlight = true;
  try { const cfg = await getBcPullConfig(); return await runPass(cfg.entryTypes, 'manual'); }
  finally { inFlight = false; }
}
