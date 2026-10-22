/**
 * controllers/retailMtdController.js
 * Retail MTD sales report + its Region/Category/Sector dimension config.
 */
import * as RetailMtdReport from '../models/RetailMtdReport.js';

export async function getSummary(req, res) {
  try {
    const { asOfDate } = req.query;
    res.json(await RetailMtdReport.summary({ asOfDate }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function listDimensionConfig(req, res) {
  try {
    res.json(await RetailMtdReport.listDimensionConfig(req.query.dimensionType));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function saveDimensionConfig(req, res) {
  try {
    const result = await RetailMtdReport.saveDimensionConfig({ ...req.body, configId: req.params.configId || req.body.configId });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

export async function deleteDimensionConfig(req, res) {
  try {
    await RetailMtdReport.deleteDimensionConfig(req.params.configId);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}
