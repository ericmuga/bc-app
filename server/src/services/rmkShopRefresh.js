import { db } from '../db/pool.js';
import { syncCategoriesFromBc, syncItemsFromBc } from '../models/PosModel.js';
import { getStockWatermark, harmonizeStockWithBc, pullBcLedgerEntries, logBcPullRun } from '../models/PosStockModel.js';

// Stock is shared by location in POS. Seed/pull one owner for each RMK location,
// not once per customer account (several RMK customers share STR002).
export function groupRmkLocations(shops) {
  const groups = new Map();
  const skipped = [];
  for (const shop of shops) {
    const location = String(shop.LocationCode || '').trim().toUpperCase();
    if (!location) { skipped.push({ shopCode: shop.Code, reason: 'No RMK location configured' }); continue; }
    if (!groups.has(location)) groups.set(location, []);
    groups.get(location).push(shop);
  }
  return { locations: [...groups].map(([location, members]) => ({ location,
    shops: members.map(s => s.Code), owner: members.find(s => s.LastEntryNo != null)?.Code || members[0].Code,
  })), skipped };
}

export async function refreshRmkShopData() {
  const result = { items: 0, categories: 0, locations: [], skipped: [], errors: [] };
  for (const [key, sync] of [['categories', syncCategoriesFromBc], ['items', syncItemsFromBc]]) {
    const step = await sync('RMK');
    if (step.errors.length) throw new Error(`RMK ${key} refresh failed: ${step.errors.join('; ')}`);
    result[key] = step.count;
  }
  const pool = await db.getPool();
  const rows = (await pool.request().query(`SELECT s.Code,c.LocationCode,w.LastEntryNo
    FROM dbo.PosShop s JOIN dbo.PosShopCompany c ON c.ShopCode=s.Code AND c.Company='RMK' AND c.IsActive=1
    LEFT JOIN dbo.PosStockWatermark w ON w.ShopCode=s.Code AND w.SourceCompany='RMK'
    WHERE s.IsActive=1 ORDER BY s.Code`)).recordset;
  const plan = groupRmkLocations(rows);
  result.skipped = plan.skipped;
  for (const group of plan.locations) {
    const start = Date.now();
    try {
      const watermark = await getStockWatermark(group.owner, 'RMK');
      // Initial stock is the net of ALL historical BC entry types. Subsequent
      // pulls retain entry detail and avoid replaying the opening balance.
      const update = watermark
        ? await pullBcLedgerEntries({ shopCode: group.owner, company: 'RMK', userName: 'RMK shop refresh' })
        : await harmonizeStockWithBc({ shopCode: group.owner, company: 'RMK', userName: 'RMK shop refresh' });
      await logBcPullRun({ shopCode: group.owner, company: 'RMK', locationCode: group.location,
        fromEntryNo: watermark?.LastEntryNo || 0, toEntryNo: update.toEntryNo ?? update.lastEntryNo,
        inserted: update.inserted ?? update.adjustments?.length ?? 0, ok: true,
        durationMs: Date.now() - start, triggeredBy: 'RMK shop refresh' });
      result.locations.push({ ...group, mode: watermark ? 'incremental' : 'opening balance',
        lastEntryNo: update.toEntryNo ?? update.lastEntryNo, movements: update.inserted ?? update.adjustments?.length ?? 0 });
    } catch (error) { result.errors.push(`${group.location}: ${error.message}`); }
  }
  return result;
}
