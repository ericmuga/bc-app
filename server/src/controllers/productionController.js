/**
 * controllers/productionController.js
 * Production / inventory-analysis-by-location endpoints.
 */
import * as Production from '../models/ProductionModel.js';
import { getOrSet, clearNamespace } from '../services/reportCache.js';
import logger from '../services/logger.js';

/** GET /api/production/locations — configurable per-company location list */
export async function getLocations(_req, res) {
  try {
    return res.json(await Production.getLocationConfig());
  } catch (err) {
    logger.error('production/locations GET error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/** PUT /api/production/locations — save the full config (admin only) */
export async function saveLocations(req, res) {
  try {
    const config = req.body?.config ?? req.body;
    const saved = await Production.saveLocationConfig(config);
    clearNamespace('production-analysis');
    return res.json(saved);
  } catch (err) {
    logger.error('production/locations PUT error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/production/analysis?company=&dateFrom=&dateTo=&locations=&entryTypes= */
export async function analysis(req, res) {
  try {
    const { company, dateFrom, dateTo } = req.query;
    if (!company) return res.status(400).json({ error: 'company is required' });
    if (!dateFrom || !dateTo) return res.status(400).json({ error: 'dateFrom and dateTo are required' });

    const splitCSV = (v) => v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : [];
    const refresh = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase());

    const cacheKey = {
      company, dateFrom, dateTo,
      locations: req.query.locations || '',
      entryTypes: req.query.entryTypes || '',
      userId: req.user?.userId,
    };
    const { value, cached } = await getOrSet('production-analysis', cacheKey, () =>
      Production.runInventoryAnalysis({
        company,
        dateFrom,
        dateTo,
        locations: splitCSV(req.query.locations),
        entryTypes: splitCSV(req.query.entryTypes),
      }), { ttlMs: 10 * 60_000, refresh });

    res.set('X-Report-Cache', cached ? 'HIT' : 'MISS');
    return res.json(value);
  } catch (err) {
    logger.error('production/analysis error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}
