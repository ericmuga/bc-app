/**
 * controllers/reportController.js
 * Handlers for BC direct-query reporting endpoints.
 * All routes require admin or analyst role (enforced in routes/index.js).
 */
import * as BcReport from '../models/BcReport.js';
import { ALL_COMPANIES } from '../services/bcTables.js';
import logger from '../services/logger.js';
import { getOrSet, clearNamespace } from '../services/reportCache.js';

const VALID_REPORT_TYPES = ['postingGroup', 'sector', 'salesperson', 'route', 'routeWeekOnWeek', 'customer', 'customerWeekOnWeek', 'weekOnWeek', 'productPerformance', 'customerItem', 'shopPaymentSummary', 'pdaVsShop', 'postingGroupItems'];
const VALID_WEEK_DIMENSIONS = ['postingGroup', 'sector'];
const VALID_DOWNLOAD_KINDS = ['customersBlankSector', 'shipTosBlankRoute', 'salespersonsAll', 'routesBlankRegion'];

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
    const cacheQuery = { ...req.query };
    delete cacheQuery.refresh;
    const dimension = VALID_WEEK_DIMENSIONS.includes(req.query.dimension)
      ? req.query.dimension
      : 'postingGroup';

    // Comparison date ranges (replaces daysOfWeek)
    const compareFrom = req.query.compareFrom || req.query.dateFrom;
    const compareTo   = req.query.compareTo   || req.query.dateTo;
    const withFrom    = req.query.withFrom    || req.query.dateFrom;
    const withTo      = req.query.withTo      || req.query.dateTo;

    const thirdPartyRaw = req.query.thirdParty;
    const thirdParty = thirdPartyRaw != null && thirdPartyRaw !== ''
      ? parseInt(thirdPartyRaw, 10)
      : null;

    const byProductRaw = req.query.byProduct;
    const byProduct = byProductRaw != null && byProductRaw !== ''
      ? parseInt(byProductRaw, 10)
      : null;

    const genBusMode = ['foreign','local'].includes(req.query.genBusMode)
      ? req.query.genBusMode : 'all';

    const refresh = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase());
    const key = { type, query: cacheQuery, userId: req.user?.userId };
    const { value, cached } = await getOrSet('bc-report-run', key, () => BcReport.runReport(type, {
      companies:  splitCSV(req.query.companies),
      dateFrom,
      dateTo,
      docTypes:   splitCSV(req.query.docTypes),
      dimension,
      compareFrom,
      compareTo,
      withFrom,
      withTo,
      postingGroupKey: req.query.postingGroupKey || '',
      thirdParty,
      byProduct,
      genBusMode,
      sectorCodes: splitCSV(req.query.sectorCodes),
      customerNos: splitCSV(req.query.customerNos),
      itemNos: splitCSV(req.query.itemNos),
      salespersonCodes: splitCSV(req.query.salespersonCodes),
      routeCodes: splitCSV(req.query.routeCodes),
    }), { ttlMs: 10 * 60_000, refresh });
    res.set('X-Report-Cache', cached ? 'HIT' : 'MISS');
    return res.json(value);
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
      const thirdPartyRaw = req.query.thirdParty;
      const thirdParty = thirdPartyRaw != null && thirdPartyRaw !== ''
        ? parseInt(thirdPartyRaw, 10)
        : null;
      const byProductRaw = req.query.byProduct;
      const byProduct = byProductRaw != null && byProductRaw !== ''
        ? parseInt(byProductRaw, 10)
        : null;
      const refresh = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase());
      const slicerFilters = { thirdParty, byProduct };
      const { value, cached } = await getOrSet(`bc-report-slicer:${fn.name}`, { companies, slicerFilters }, () => fn(companies, slicerFilters), { ttlMs: 30 * 60_000, refresh });
      res.set('X-Report-Cache', cached ? 'HIT' : 'MISS');
      return res.json(value);
    } catch (err) {
      logger.error(`bc-reports slicer error`, { error: err.message });
      return res.status(500).json({ error: err.message });
    }
  };
}

export function clearCache(_req, res) {
  clearNamespace('bc-report-run');
  clearNamespace('bc-report-slicer');
  clearNamespace('bc-report-download');
  clearNamespace('bc-report-blank-route');
  clearNamespace('bc-report-aging');
  return res.json({ message: 'BC report cache cleared' });
}

/** GET /api/bc-reports/customer-aging */
export async function customerAging(req, res) {
  try {
    const { asOfDate } = req.query;
    if (!asOfDate) return res.status(400).json({ error: 'asOfDate is required' });

    const splitCSV = (v) => v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
    const refresh = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase());

    const cacheKey = { asOfDate, companies: req.query.companies || '', userId: req.user?.userId };
    const { value, cached } = await getOrSet('bc-report-aging', cacheKey, () =>
      BcReport.runCustomerAging({
        asOfDate,
        companies: splitCSV(req.query.companies),
      }), { ttlMs: 10 * 60_000, refresh });

    res.set('X-Report-Cache', cached ? 'HIT' : 'MISS');
    return res.json(value);
  } catch (err) {
    logger.error('bc-reports/customer-aging error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/bc-reports/cust-pg-mappings */
export async function listCustPgMappings(_req, res) {
  try {
    return res.json(await BcReport.listCustPgMappings());
  } catch (err) {
    logger.error('bc-reports/cust-pg-mappings GET error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/** POST / PATCH /api/bc-reports/cust-pg-mappings[/:mapId] */
export async function saveCustPgMapping(req, res) {
  try {
    const data = {
      mapId:            req.params.mapId || null,
      companyId:        String(req.body.companyId || '').trim().toUpperCase(),
      nativeGroupCode:  String(req.body.nativeGroupCode || '').trim().toUpperCase(),
      displayGroupCode: String(req.body.displayGroupCode || '').trim(),
      sortOrder:        Number(req.body.sortOrder) || 0,
    };
    if (!data.companyId)        return res.status(400).json({ error: 'companyId is required' });
    if (!data.nativeGroupCode)  return res.status(400).json({ error: 'nativeGroupCode is required' });
    if (!data.displayGroupCode) return res.status(400).json({ error: 'displayGroupCode is required' });

    const result = await BcReport.saveCustPgMapping(data);
    clearNamespace('bc-report-aging');
    return res.status(data.mapId ? 200 : 201).json(result);
  } catch (err) {
    logger.error('bc-reports/cust-pg-mappings SAVE error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/** DELETE /api/bc-reports/cust-pg-mappings/:mapId */
export async function deleteCustPgMapping(req, res) {
  try {
    await BcReport.deleteCustPgMapping(req.params.mapId);
    clearNamespace('bc-report-aging');
    return res.json({ message: 'Mapping deleted' });
  } catch (err) {
    logger.error('bc-reports/cust-pg-mappings DELETE error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function blankRouteLines(req, res) {
  try {
    const { dateFrom, dateTo } = req.query;
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ error: 'dateFrom and dateTo are required' });
    }
    const splitCSV = (v) => v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];

    const thirdPartyRaw = req.query.thirdParty;
    const thirdParty = thirdPartyRaw != null && thirdPartyRaw !== ''
      ? parseInt(thirdPartyRaw, 10) : null;

    const byProductRaw = req.query.byProduct;
    const byProduct = byProductRaw != null && byProductRaw !== ''
      ? parseInt(byProductRaw, 10) : null;

    const genBusMode = ['foreign', 'local'].includes(req.query.genBusMode)
      ? req.query.genBusMode : 'all';

    const refresh = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase());
    const cacheQuery = { ...req.query };
    delete cacheQuery.refresh;

    const { value, cached } = await getOrSet('bc-report-blank-route', { query: cacheQuery, userId: req.user?.userId }, () => BcReport.runBlankRouteLines({
      companies:        splitCSV(req.query.companies),
      dateFrom,
      dateTo,
      docTypes:         splitCSV(req.query.docTypes),
      thirdParty,
      byProduct,
      genBusMode,
      customerNos:      splitCSV(req.query.customerNos),
      itemNos:          splitCSV(req.query.itemNos),
      salespersonCodes: splitCSV(req.query.salespersonCodes),
    }), { ttlMs: 10 * 60_000, refresh });

    res.set('X-Report-Cache', cached ? 'HIT' : 'MISS');
    return res.json(value);
  } catch (err) {
    logger.error('bc-reports/blank-route-lines error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function downloadDataset(req, res) {
  try {
    const kind = String(req.query.kind || '');
    if (!VALID_DOWNLOAD_KINDS.includes(kind)) {
      return res.status(400).json({ error: `kind must be one of: ${VALID_DOWNLOAD_KINDS.join(', ')}` });
    }
    const companies = req.query.companies
      ? req.query.companies.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const refresh = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase());
    const { value, cached } = await getOrSet(`bc-report-download:${kind}`, { companies }, () => BcReport.listDownloadDataset(kind, companies), { ttlMs: 30 * 60_000, refresh });
    res.set('X-Report-Cache', cached ? 'HIT' : 'MISS');
    return res.json(value);
  } catch (err) {
    logger.error('bc-reports/download error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export const listPostingGroups      = slicerHandler(BcReport.listPostingGroups);
export const listSectors            = slicerHandler(BcReport.listSectors);
export const listGenBusPostingGroups = slicerHandler(BcReport.listGenBusPostingGroups);
export const listSalespersons       = slicerHandler(BcReport.listSalespersons);
export const listRoutes             = slicerHandler(BcReport.listRoutes);
export const listCustomers          = slicerHandler(BcReport.listCustomers);
export const listItems              = slicerHandler(BcReport.listItems);
