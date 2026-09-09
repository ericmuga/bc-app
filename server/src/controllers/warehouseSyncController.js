/**
 * controllers/warehouseSyncController.js
 * Warehouse Sync Center endpoints (/reporting/warehouse/*).
 * Read-only monitoring of FCLWHS ETL + a guarded "Run now" for Agent jobs.
 * Gated to admin + analyst in routes/index.js.
 */
import * as Wh from '../models/WarehouseSyncModel.js';
import logger from '../services/logger.js';

export async function getJobs(_req, res) {
  try { res.json({ jobs: await Wh.listJobs() }); }
  catch (e) { logger.error('warehouse/jobs', { error: e.message }); res.status(500).json({ error: e.message }); }
}

export async function getJobHistory(req, res) {
  try { res.json({ job: req.params.name, history: await Wh.jobHistory(req.params.name, req.query.limit) }); }
  catch (e) { logger.error('warehouse/jobHistory', { error: e.message }); res.status(500).json({ error: e.message }); }
}

export async function getProcedures(_req, res) {
  try { res.json({ procedures: await Wh.listProcedures() }); }
  catch (e) { logger.error('warehouse/procedures', { error: e.message }); res.status(500).json({ error: e.message }); }
}

export async function getFacts(_req, res) {
  try { res.json({ facts: await Wh.factFreshness() }); }
  catch (e) { logger.error('warehouse/facts', { error: e.message }); res.status(500).json({ error: e.message }); }
}

export async function runJob(req, res) {
  try {
    const result = await Wh.startJob(req.params.name);
    logger.info('warehouse/runJob', { job: req.params.name, by: req.user?.userName });
    res.json(result);
  } catch (e) {
    const status = /^Unknown job/.test(e.message) ? 404 : 500;
    logger.error('warehouse/runJob', { job: req.params.name, error: e.message });
    res.status(status).json({ error: e.message });
  }
}
