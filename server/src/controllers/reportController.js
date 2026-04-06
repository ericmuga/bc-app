/**
 * controllers/reportController.js
 * Handlers for BC direct-query reporting endpoints.
 * All routes require admin or analyst role (enforced in routes/index.js).
 */
import * as BcReport from '../models/BcReport.js';
import { ALL_COMPANIES } from '../services/bcTables.js';
import logger from '../services/logger.js';

const VALID_REPORT_TYPES = ['postingGroup', 'sector', 'salesperson', 'route', 'weekOnWeek', 'productPerformance'];
const VALID_WEEK_DIMENSIONS = ['postingGroup', 'sector'];

export function listCompanies(_req, res) {
  return res.json(ALL_COMPANIES.map(id => ({ id, label: id })));
}

/**
 * GET /api/bc-reports/run
 * Query params:
 *   type        postingGroup | sector | salesperson | route
 *   companies   comma-separated  (optional, default=all)
 *   dateFrom    YYYY-MM-DD
 *   dateTo      YYYY-MM-DD
 *   docTypes    comma-separated  (optional, default=all)
 *   thirdParty  0 | 1           (optional, default=all)
 *   genBusPGs   comma-separated (optional, default=all)
 */
export async function runReport(req, res) {
  try {
    const { type, dateFrom, dateTo } = req.query;

    if (!type || !VALID_REPORT_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_REPORT_TYPES.join(', ')}` });
    }
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ error: 'dateFrom and dateTo are required' });
    }

    const splitCSV = (v) => v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
    const dimension = VALID_WEEK_DIMENSIONS.includes(req.query.dimension)
      ? req.query.dimension
      : 'postingGroup';
    const daysOfWeek = splitCSV(req.query.daysOfWeek)
      .map((d) => parseInt(d, 10))
      .filter((d) => d >= 1 && d <= 7);

    const thirdPartyRaw = req.query.thirdParty;
    const thirdParty = thirdPartyRaw != null && thirdPartyRaw !== ''
      ? parseInt(thirdPartyRaw, 10)
      : null;

    const genBusMode = ['foreign','local'].includes(req.query.genBusMode)
      ? req.query.genBusMode : 'all';

    const result = await BcReport.runReport(type, {
      companies:  splitCSV(req.query.companies),
      dateFrom,
      dateTo,
      docTypes:   splitCSV(req.query.docTypes),
      dimension,
      daysOfWeek,
      thirdParty,
      genBusMode,
      customerQuery: req.query.customerQuery?.trim() || '',
      itemQuery: req.query.itemQuery?.trim() || '',
    });

    return res.json(result);
  } catch (err) {
    logger.error('bc-reports/run error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

function slicerHandler(fn) {
  return async (req, res) => {
    try {
      const companies = req.query.companies
        ? req.query.companies.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      const data = await fn(companies);
      return res.json(data);
    } catch (err) {
      logger.error(`bc-reports slicer error`, { error: err.message });
      return res.status(500).json({ error: err.message });
    }
  };
}

export const listPostingGroups      = slicerHandler(BcReport.listPostingGroups);
export const listSectors            = slicerHandler(BcReport.listSectors);
export const listGenBusPostingGroups = slicerHandler(BcReport.listGenBusPostingGroups);
export const listSalespersons       = slicerHandler(BcReport.listSalespersons);
export const listRoutes             = slicerHandler(BcReport.listRoutes);
