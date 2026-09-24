/**
 * controllers/warehouseInventoryController.js
 * Inventory-movement analytics over dbo.fact_ILE_MV (FCLWHS).
 * Read-only. Gated to admin + analyst in routes/index.js.
 */
import * as Inv from '../models/WarehouseInventoryModel.js';
import logger from '../services/logger.js';

export async function getDimensions(_req, res) {
  try { res.json(await Inv.dimensions()); }
  catch (e) { logger.error('warehouse/inventory/dimensions', { error: e.message }); res.status(500).json({ error: e.message }); }
}

export async function getItems(req, res) {
  try {
    const companies = req.query.company ? String(req.query.company).split(',').map(s => s.trim()).filter(Boolean) : [];
    res.json({ items: await Inv.items({ companies }) });
  } catch (e) { logger.error('warehouse/inventory/items', { error: e.message }); res.status(500).json({ error: e.message }); }
}

export async function getStockCard(req, res) {
  try {
    const b = req.body || {};
    res.json(await Inv.stockCard({
      locations: b.locations, dateFrom: b.dateFrom, dateTo: b.dateTo,
      companies: b.companies, postingGroups: b.postingGroups, items: b.items,
      includePendingWms: b.includePendingWms,
    }));
  } catch (e) {
    const status = /Pick at least one location/.test(e.message) ? 400 : 500;
    logger.error('warehouse/inventory/stock-card', { error: e.message });
    res.status(status).json({ error: e.message });
  }
}

export async function getReport(req, res) {
  try {
    const b = req.body || {};
    const result = await Inv.report({
      dateFrom:      b.dateFrom,
      dateTo:        b.dateTo,
      companies:     b.companies,
      locations:     b.locations,
      postingGroups: b.postingGroups,
      entryTypes:    b.entryTypes,
      items:         b.items,
      groupBy:       b.groupBy,
      granularity:   b.granularity,
      sellableOnly:      b.sellableOnly,
      includePendingWms: b.includePendingWms,
    });
    res.json(result);
  } catch (e) {
    logger.error('warehouse/inventory/report', { error: e.message });
    res.status(500).json({ error: e.message });
  }
}
