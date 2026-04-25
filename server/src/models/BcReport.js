/**
 * models/BcReport.js
 * Queries BC tables directly for sales reporting.
 */
import { bcDb, bcSql as sql } from '../db/bcPool.js';
import { db as appDb } from '../db/pool.js';
import { bcTable, extCol, resolveCompanies, ALL_COMPANIES } from '../services/bcTables.js';
import logger from '../services/logger.js';

const DEFAULT_DOC_TYPES = ['invoice', 'credit', 'unposted', 'pda'];
const REPORT_DIMENSIONS = ['postingGroup', 'sector', 'salesperson', 'route'];
const WEEK_DIMENSIONS = ['postingGroup', 'sector'];
const FOREIGN_GEN_BUS = `'FOREIGN','B FOREIGN'`;
const MONDAY_ANCHOR = '19000101';

const sectorCol = extCol('Sector');
const thirdPartyCol = extCol('Third Party');
const byProductCol = extCol('Is Byproduct');
const routeCodeCol = extCol('Route Code');
const lineWeightCol = extCol('Line Weight');

function snapshotRequestParameters(req) {
  return Object.fromEntries(
    Object.entries(req.parameters || {}).map(([key, meta]) => [key, meta.value])
  );
}

async function executeLoggedQuery(req, querySql, context) {
  logger.info('bc-report query', {
    ...context,
    sql: querySql,
    params: snapshotRequestParameters(req),
  });
  return req.query(querySql);
}

function parseDateOnly(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function diffDaysInclusive(from, to) {
  const ms = parseDateOnly(formatDateOnly(to)) - parseDateOnly(formatDateOnly(from));
  return Math.floor(ms / 86400000) + 1;
}

function getWeekStart(date) {
  const d = parseDateOnly(formatDateOnly(date));
  const day = d.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(d, mondayOffset);
}

function normalizedPostingGroupExpr(alias = 'l') {
  return `ISNULL(
    CASE WHEN CHARINDEX('-', ${alias}.[Posting Group]) > 0
         THEN SUBSTRING(${alias}.[Posting Group],
                CHARINDEX('-', ${alias}.[Posting Group]) + 1,
                LEN(${alias}.[Posting Group]))
         ELSE NULLIF(${alias}.[Posting Group], '')
    END, '(Blank)')`;
}

function normalizedWeekdayExpr(alias = 'h') {
  return `((DATEDIFF(day, '${MONDAY_ANCHOR}', CAST(${alias}.[Posting Date] AS date)) % 7 + 7) % 7) + 1`;
}

function weekStartExpr(alias = 'h') {
  return `DATEADD(day,
    -((DATEDIFF(day, '${MONDAY_ANCHOR}', CAST(${alias}.[Posting Date] AS date)) % 7 + 7) % 7),
    CAST(${alias}.[Posting Date] AS date))`;
}

const postingGroupDim = {
  hasCx: false,
  extraJoin: '',
  selectExpr: normalizedPostingGroupExpr('l'),
  groupByExpr: normalizedPostingGroupExpr('l'),
};

function makeSectorDim() {
  const expr = `ISNULL(NULLIF(cx.${sectorCol}, ''), '(Blank)')`;
  return {
    hasCx: true,
    extraJoin: `LEFT JOIN ${'{customerExt}'} cx ON cx.[No_] = h.[Sell-to Customer No_]`,
    selectExpr: expr,
    groupByExpr: expr,
  };
}

function makeSalespersonDim() {
  const expr = `ISNULL(NULLIF(sp.[Name], ''), ISNULL(NULLIF(h.[Salesperson Code], ''), '(Blank)'))`;
  return {
    hasCx: false,
    extraJoin: `LEFT JOIN ${'{salesperson}'} sp ON sp.[Code] = h.[Salesperson Code]`,
    selectExpr: expr,
    groupByExpr: expr,
  };
}

function makeRouteDim() {
  const expr = `ISNULL(NULLIF(ste.${routeCodeCol}, ''), '(Blank)')`;
  return {
    hasCx: false,
    extraJoin: `
      LEFT JOIN ${'{shipToAddress}'} st ON st.[Customer No_] = h.[Sell-to Customer No_] AND st.[Code] = h.[Ship-to Code]
      LEFT JOIN ${'{shipToAddressExt}'} ste ON ste.[Customer No_] = h.[Sell-to Customer No_] AND ste.[Code] = h.[Ship-to Code]`,
    selectExpr: expr,
    groupByExpr: expr,
  };
}

function getDim(reportType) {
  switch (reportType) {
    case 'sector':
      return makeSectorDim();
    case 'salesperson':
      return makeSalespersonDim();
    case 'route':
      return makeRouteDim();
    default:
      return postingGroupDim;
  }
}

function resolveDimSql(reportType, tables) {
  const dim = getDim(reportType);
  return {
    extraJoin: dim.extraJoin
      .replace('{customerExt}', tables.customerExt)
      .replace('{salesperson}', tables.salesperson)
      .replace('{shipToAddress}', tables.shipToAddress)
      .replace('{shipToAddressExt}', tables.shipToAddressExt),
    selectExpr: dim.selectExpr,
    groupByExpr: dim.groupByExpr,
  };
}

function buildItemJoin(tables, thirdParty, byProduct) {
  if (thirdParty == null && byProduct == null) return '';
  return `LEFT JOIN ${tables.itemExt} ix ON ix.[No_] = l.[No_]`;
}

function buildItemWhere(thirdParty, byProduct) {
  const clauses = [];
  if (thirdParty != null) {
    const val = thirdParty ? 1 : 0;
    clauses.push(`AND ISNULL(ix.${thirdPartyCol}, 0) = ${val}`);
  }
  if (byProduct != null) {
    const val = byProduct ? 1 : 0;
    clauses.push(`AND ISNULL(ix.${byProductCol}, 0) = ${val}`);
  }
  return clauses.join('\n      ');
}

function buildGenBusFilter(genBusMode, sourceType, tables) {
  if (!genBusMode || genBusMode === 'all') {
    return { join: '', where: '' };
  }

  const inClause = genBusMode === 'foreign'
    ? `IN (${FOREIGN_GEN_BUS})`
    : `NOT IN (${FOREIGN_GEN_BUS})`;

  if (sourceType === 'pda') {
    return {
      join: `LEFT JOIN ${tables.customer} cgb ON cgb.[No_] = h.[Sell-to Customer No_]`,
      where: `AND cgb.[Gen_ Bus_ Posting Group] ${inClause}`,
    };
  }

  return {
    join: '',
    where: `AND h.[Gen_ Bus_ Posting Group] ${inClause}`,
  };
}

function buildCommonFilters(filters) {
  const clauses = [];
  if (filters.customerNos?.length) {
    clauses.push(`AND h.[Sell-to Customer No_] IN (${filters.customerNos.map((_, idx) => `@CustomerNo${idx + 1}`).join(', ')})`);
  }
  if (filters.itemNos?.length) {
    clauses.push(`AND l.[No_] IN (${filters.itemNos.map((_, idx) => `@ItemNo${idx + 1}`).join(', ')})`);
  }
  if (filters.salespersonCodes?.length) {
    clauses.push(`AND h.[Salesperson Code] IN (${filters.salespersonCodes.map((_, idx) => `@SalespersonCode${idx + 1}`).join(', ')})`);
  }
  return clauses.join('\n      ');
}

function buildRouteFilterJoinAndWhere(tables, hTable, filters) {
  if (!filters.routeCodes?.length) return { join: '', where: '' };
  const shipToCodeExpr = hTable === 'pdah' ? `c.[Ship-to Code]` : `h.[Ship-to Code]`;
  return {
    join: `LEFT JOIN ${tables.shipToAddressExt} steflt ON steflt.[Customer No_] = h.[Sell-to Customer No_] AND steflt.[Code] = ${shipToCodeExpr}`,
    where: `AND steflt.${routeCodeCol} IN (${filters.routeCodes.map((_, idx) => `@RouteCode${idx + 1}`).join(', ')})`,
  };
}

function buildSectorFilterJoinAndWhere(tables, filters, hasCx = false) {
  if (!filters.sectorCodes?.length) return { join: '', where: '' };
  return {
    join: hasCx ? '' : `LEFT JOIN ${tables.customerExt} cxsf ON cxsf.[No_] = h.[Sell-to Customer No_]`,
    where: hasCx
      ? `AND cx.${sectorCol} IN (${filters.sectorCodes.map((_, idx) => `@SectorCode${idx + 1}`).join(', ')})`
      : `AND cxsf.${sectorCol} IN (${filters.sectorCodes.map((_, idx) => `@SectorCode${idx + 1}`).join(', ')})`,
  };
}

function buildProductKeyExpr() {
  return `ISNULL(
    NULLIF(i.[Common Item No_], ''),
    NULLIF(l.[No_], '')
  )`;
}

function buildProductDescriptionExpr() {
  return `COALESCE(NULLIF(i.[Description], ''), NULLIF(l.[Description], ''), '(Blank)')`;
}

function buildQtyJoinAndExpr(tables, lTable) {
  // Posted invoice/credit lines and unposted sales lines: use Quantity (Base)
  // PDA archive lines: use Quantity (no Quantity Base field)
  const useBase = lTable === 'sinvl' || lTable === 'scml' || lTable === 'sl';
  return {
    join: '',
    qtyExpr: useBase
      ? 'CAST(l.[Quantity (Base)] AS decimal(38, 20))'
      : 'CAST(l.[Quantity] AS decimal(38, 20))',
  };
}

// For posted invoices/credit memos, multiply Amount by Currency Factor when non-zero.
// Other document types (unposted, PDA) use Amount directly.
function buildAmountExpr(hTable) {
  if (hTable === 'sinvh' || hTable === 'scmh') {
    return `CASE WHEN ISNULL(h.[Currency Factor], 0) <> 0
               THEN l.[Amount] * h.[Currency Factor]
               ELSE l.[Amount] END`;
  }
  return 'l.[Amount]';
}

function makeAggregateBlock(docLabel, sign, hTable, lTable) {
  return (companyId, dim, tables, filters) => {
    const itemJoin = buildItemJoin(tables, filters.thirdParty, filters.byProduct);
    const itemWhere = buildItemWhere(filters.thirdParty, filters.byProduct);
    const sourceType = lTable === 'pdal' ? 'pda' : 'sales';
    const genBusFilter = buildGenBusFilter(filters.genBusMode, sourceType, tables);
    const lineType = lTable === 'pdal' ? '' : 'AND l.[Type] = 2';
    const docTypeFilter = lTable === 'sl'
      ? `AND h.[Document Type] IN (1, 2)`
      : '';
    const statusFilter = hTable === 'sh'
      ? `AND h.[Status] IN (4, 5)`
      : '';
    const routeFilter = buildRouteFilterJoinAndWhere(tables, hTable, filters);
    const sectorFilter = buildSectorFilterJoinAndWhere(tables, filters, dim.hasCx);
    const extraFilters = buildCommonFilters(filters);
    const qtySpec = buildQtyJoinAndExpr(tables, lTable);
    const amountExpr = buildAmountExpr(hTable);

    return `
      SELECT '${companyId}' AS Company,
             ${dim.selectExpr} AS GroupKey,
             '${docLabel}' AS DocType,
             COUNT(DISTINCT h.[No_]) AS DocCount,
             ${sign}SUM(${qtySpec.qtyExpr}) AS Qty,
             ${sign}SUM(${amountExpr}) AS Amount
      FROM ${tables[hTable]} h
      JOIN ${tables[lTable]} l
        ON l.[Document No_] = h.[No_]
       ${lineType}
       ${lTable === 'sl' ? 'AND l.[Document Type] = h.[Document Type]' : ''}
      ${qtySpec.join}
      LEFT JOIN ${tables.customer} c ON c.[No_] = h.[Sell-to Customer No_]
      LEFT JOIN ${tables.item} i ON i.[No_] = l.[No_]
      ${dim.extraJoin}
      ${routeFilter.join}
      ${sectorFilter.join}
      ${itemJoin}
      ${genBusFilter.join}
      WHERE h.[Posting Date] BETWEEN @DateFrom AND @DateTo
        ${docTypeFilter}
        ${statusFilter}
        ${routeFilter.where}
        ${sectorFilter.where}
        ${genBusFilter.where}
        ${itemWhere}
        ${extraFilters}
      GROUP BY ${dim.groupByExpr}
    `;
  };
}

function makeFactBlock(docLabel, sign, hTable, lTable) {
  return (companyId, tables, filters) => {
    const itemJoin = buildItemJoin(tables, filters.thirdParty, filters.byProduct);
    const itemWhere = buildItemWhere(filters.thirdParty, filters.byProduct);
    const sourceType = lTable === 'pdal' ? 'pda' : 'sales';
    const genBusFilter = buildGenBusFilter(filters.genBusMode, sourceType, tables);
    const lineType = lTable === 'pdal' ? '' : 'AND l.[Type] = 2';
    const docTypeFilter = lTable === 'sl'
      ? `AND h.[Document Type] IN (1, 2)`
      : '';
    const statusFilter = hTable === 'sh'
      ? `AND h.[Status] IN (4, 5)`
      : '';
    const shipToCodeExpr = hTable === 'pdah'
      ? `c.[Ship-to Code]`
      : `h.[Ship-to Code]`;
    const routeFilter = buildRouteFilterJoinAndWhere(tables, hTable, filters);
    const sectorFilter = buildSectorFilterJoinAndWhere(tables, filters, true); // cx always joined in fact block
    const extraFilters = buildCommonFilters(filters);
    const qtySpec = buildQtyJoinAndExpr(tables, lTable);
    const amountExpr = buildAmountExpr(hTable);

    return `
      SELECT
        '${companyId}' AS Company,
        '${docLabel}' AS DocType,
        CAST(h.[Posting Date] AS date) AS PostingDate,
        ${weekStartExpr('h')} AS WeekStart,
        ${normalizedWeekdayExpr('h')} AS WeekdayNo,
        ${normalizedPostingGroupExpr('l')} AS PostingGroupKey,
        ISNULL(NULLIF(cx.${sectorCol}, ''), '(Blank)') AS SectorKey,
        ISNULL(NULLIF(dgc.[Country_Region Code], ''), '(Blank)') AS CountryRegionKey,
        ISNULL(NULLIF(ste.${routeCodeCol}, ''), '(Blank)') AS RouteKey,
        ISNULL(NULLIF(dgc.[Description], ''), '(Blank)') AS RouteDescription,
        ISNULL(NULLIF(h.[Sell-to Customer No_], ''), '(Blank)') AS CustomerNo,
        ISNULL(NULLIF(c.[Name], ''), ISNULL(NULLIF(h.[Sell-to Customer No_], ''), '(Blank)')) AS CustomerName,
        ISNULL(NULLIF(${shipToCodeExpr}, ''), '(Blank)') AS ShipToCode,
        ISNULL(NULLIF(st.[Name], ''), '(Blank)') AS ShipToName,
        ${buildProductKeyExpr()} AS ProductKey,
        ${buildProductDescriptionExpr()} AS ProductDescription,
        ${sign}${qtySpec.qtyExpr} AS Qty,
        ${sign}CAST(${amountExpr} AS decimal(38, 20)) AS Amount
      FROM ${tables[hTable]} h
      JOIN ${tables[lTable]} l
        ON l.[Document No_] = h.[No_]
       ${lineType}
       ${lTable === 'sl' ? 'AND l.[Document Type] = h.[Document Type]' : ''}
      ${qtySpec.join}
      LEFT JOIN ${tables.customer} c ON c.[No_] = h.[Sell-to Customer No_]
      LEFT JOIN ${tables.customerExt} cx ON cx.[No_] = h.[Sell-to Customer No_]
      LEFT JOIN ${tables.shipToAddress} st ON st.[Customer No_] = h.[Sell-to Customer No_] AND st.[Code] = ${shipToCodeExpr}
      LEFT JOIN ${tables.shipToAddressExt} ste ON ste.[Customer No_] = h.[Sell-to Customer No_] AND ste.[Code] = ${shipToCodeExpr}
      LEFT JOIN ${tables.districtGroupCodes} dgc ON dgc.[Code] = ste.${routeCodeCol}
      ${routeFilter.join}
      LEFT JOIN ${tables.item} i ON i.[No_] = l.[No_]
      ${itemJoin}
      ${genBusFilter.join}
      WHERE h.[Posting Date] BETWEEN @WindowStart AND @WindowEnd
        ${docTypeFilter}
        ${statusFilter}
        ${routeFilter.where}
        ${sectorFilter.where}
        ${genBusFilter.where}
        ${itemWhere}
        ${extraFilters}
    `;
  };
}

const AGGREGATE_BLOCKS = {
  invoice: makeAggregateBlock('Invoice', '', 'sinvh', 'sinvl'),
  credit: makeAggregateBlock('Credit Memo', '-', 'scmh', 'scml'),
  unposted: makeAggregateBlock('Unposted', '', 'sh', 'sl'),
  pda: makeAggregateBlock('PDA', '', 'pdah', 'pdal'),
};

// Item-level drill-down blocks (same filters as aggregate but group by item)
function makeItemDrillBlock(sign, hTable, lTable) {
  return (companyId, tables, filters) => {
    const itemJoin = buildItemJoin(tables, filters.thirdParty, filters.byProduct);
    const itemWhere = buildItemWhere(filters.thirdParty, filters.byProduct);
    const sourceType = lTable === 'pdal' ? 'pda' : 'sales';
    const genBusFilter = buildGenBusFilter(filters.genBusMode, sourceType, tables);
    const lineType = lTable === 'pdal' ? '' : 'AND l.[Type] = 2';
    const docTypeFilter = lTable === 'sl' ? `AND h.[Document Type] IN (1, 2)` : '';
    const statusFilter = hTable === 'sh' ? `AND h.[Status] IN (4, 5)` : '';
    const routeFilter = buildRouteFilterJoinAndWhere(tables, hTable, filters);
    const sectorFilter = buildSectorFilterJoinAndWhere(tables, filters, false);
    const extraFilters = buildCommonFilters(filters);
    const qtySpec = buildQtyJoinAndExpr(tables, lTable);
    const amountExpr = buildAmountExpr(hTable);
    const pgExpr = normalizedPostingGroupExpr('l');
    const itemNoExpr = buildProductKeyExpr();
    const itemDescExpr = buildProductDescriptionExpr();

    return `
      SELECT '${companyId}' AS Company,
             ${pgExpr} AS GroupKey,
             ${itemNoExpr} AS ItemNo,
             ${itemDescExpr} AS ItemDescription,
             ${sign}SUM(${qtySpec.qtyExpr}) AS Qty,
             ${sign}SUM(${amountExpr}) AS Amount
      FROM ${tables[hTable]} h
      JOIN ${tables[lTable]} l ON l.[Document No_] = h.[No_]
           ${lineType}
           ${lTable === 'sl' ? 'AND l.[Document Type] = h.[Document Type]' : ''}
      ${qtySpec.join}
      LEFT JOIN ${tables.customer} c ON c.[No_] = h.[Sell-to Customer No_]
      LEFT JOIN ${tables.item} i ON i.[No_] = l.[No_]
      ${routeFilter.join}
      ${sectorFilter.join}
      ${itemJoin}
      ${genBusFilter.join}
      WHERE h.[Posting Date] BETWEEN @DateFrom AND @DateTo
        ${docTypeFilter}
        ${statusFilter}
        ${routeFilter.where}
        ${sectorFilter.where}
        ${genBusFilter.where}
        ${itemWhere}
        ${extraFilters}
      GROUP BY ${pgExpr}, ${itemNoExpr}, ${itemDescExpr}
    `;
  };
}

const ITEM_DRILL_BLOCKS = {
  invoice: makeItemDrillBlock('', 'sinvh', 'sinvl'),
  credit: makeItemDrillBlock('-', 'scmh', 'scml'),
  unposted: makeItemDrillBlock('', 'sh', 'sl'),
  pda: makeItemDrillBlock('', 'pdah', 'pdal'),
};

const FACT_BLOCKS = {
  invoice: makeFactBlock('Invoice', '', 'sinvh', 'sinvl'),
  credit: makeFactBlock('Credit Memo', '-', 'scmh', 'scml'),
  unposted: makeFactBlock('Unposted', '', 'sh', 'sl'),
  pda: makeFactBlock('PDA', '', 'pdah', 'pdal'),
};

function makeTables(companyId) {
  return {
    sinvh: bcTable(companyId, 'Sales Invoice Header'),
    sinvl: bcTable(companyId, 'Sales Invoice Line'),
    scmh: bcTable(companyId, 'Sales Cr_Memo Header'),
    scml: bcTable(companyId, 'Sales Cr_Memo Line'),
    sh: bcTable(companyId, 'Sales Header'),
    sl: bcTable(companyId, 'Sales Line'),
    slExt: bcTable(companyId, 'Sales Line', { coreExt: true }),
    pdah: bcTable(companyId, 'PDA Order Header Archive', { ext: true }),
    pdal: bcTable(companyId, 'PDA Order Line Archive', { ext: true }),
    customer: bcTable(companyId, 'Customer'),
    customerExt: bcTable(companyId, 'Customer', { coreExt: true }),
    item: bcTable(companyId, 'Item'),
    itemExt: bcTable(companyId, 'Item', { coreExt: true }),
    salesperson: bcTable(companyId, 'Salesperson_Purchaser'),
    shipToAddress: bcTable(companyId, 'Ship-to Address'),
    shipToAddressExt: bcTable(companyId, 'Ship-to Address', { coreExt: true }),
    districtGroupCodes: bcTable(companyId, 'District Group Code', { ext: true }),
    invoicePaymentHeader: bcTable(companyId, 'Invoice Payment Header', { ext: true }),
    invoicePaymentLine: bcTable(companyId, 'Invoice Payment Line', { ext: true }),
  };
}

function buildAggregateUnionQuery(companies, docTypes, reportType, filters) {
  const segments = [];
  for (const companyId of companies) {
    const tables = makeTables(companyId);
    const dim = resolveDimSql(reportType, tables);
    for (const docType of docTypes) {
      const factory = AGGREGATE_BLOCKS[docType];
      if (factory) segments.push(factory(companyId, dim, tables, filters));
    }
  }
  return segments.length ? segments.join('\nUNION ALL\n') : null;
}

function buildFactsUnionQuery(companies, docTypes, filters) {
  const segments = [];
  for (const companyId of companies) {
    const tables = makeTables(companyId);
    for (const docType of docTypes) {
      const factory = FACT_BLOCKS[docType];
      if (factory) segments.push(factory(companyId, tables, filters));
    }
  }
  return segments.length ? segments.join('\nUNION ALL\n') : null;
}

function addCommonInputs(req, filters) {
  filters.sectorCodes?.forEach((value, idx) => req.input(`SectorCode${idx + 1}`, sql.NVarChar(50), value));
  filters.customerNos?.forEach((value, idx) => req.input(`CustomerNo${idx + 1}`, sql.NVarChar(20), value));
  filters.itemNos?.forEach((value, idx) => req.input(`ItemNo${idx + 1}`, sql.NVarChar(20), value));
  filters.salespersonCodes?.forEach((value, idx) => req.input(`SalespersonCode${idx + 1}`, sql.NVarChar(20), value));
  filters.routeCodes?.forEach((value, idx) => req.input(`RouteCode${idx + 1}`, sql.NVarChar(50), value));
}

function buildPaymentFilters(filters) {
  const clauses = [];
  if (filters.customerNos?.length) {
    clauses.push(`AND COALESCE(NULLIF(ph.[Customer No_], ''), NULLIF(sih.[Sell-to Customer No_], '')) IN (${filters.customerNos.map((_, idx) => `@CustomerNo${idx + 1}`).join(', ')})`);
  }
  if (filters.salespersonCodes?.length) {
    clauses.push(`AND ph.[Salesperson Code] IN (${filters.salespersonCodes.map((_, idx) => `@SalespersonCode${idx + 1}`).join(', ')})`);
  }
  return clauses.join('\n        ');
}

async function runBaseMatrixReport(reportType, filters) {
  const companies = resolveCompanies(filters.companies);
  const docTypes = filters.docTypes?.length
    ? filters.docTypes.filter((d) => DEFAULT_DOC_TYPES.includes(d))
    : DEFAULT_DOC_TYPES;

  if (!companies.length || !docTypes.length) return [];

  const unionSql = buildAggregateUnionQuery(companies, docTypes, reportType, {
    thirdParty: filters.thirdParty ?? null,
    byProduct: filters.byProduct ?? null,
    genBusMode: filters.genBusMode || 'all',
    sectorCodes: filters.sectorCodes || [],
    customerNos: filters.customerNos || [],
    itemNos: filters.itemNos || [],
    salespersonCodes: filters.salespersonCodes || [],
    routeCodes: filters.routeCodes || [],
  });

  const querySql = `
    SELECT Company, GroupKey, DocType,
           SUM(DocCount) AS DocCount,
           SUM(Qty) AS Qty,
           SUM(Amount) AS Amount
    FROM (${unionSql}) src
    GROUP BY Company, GroupKey, DocType
    ORDER BY Company, GroupKey, DocType
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('WindowStart', sql.Date, parseDateOnly(filters.dateFrom));
  req.input('WindowEnd', sql.Date, parseDateOnly(filters.dateTo));
  req.input('DateFrom', sql.Date, parseDateOnly(filters.dateFrom));
  req.input('DateTo', sql.Date, parseDateOnly(filters.dateTo));
  addCommonInputs(req, filters);
  const result = await executeLoggedQuery(req, querySql, {
    reportType,
    mode: 'matrix',
    companies,
    docTypes,
  });
  return result.recordset;
}

function resolveComparisonWindow(compareFrom, compareTo, withFrom, withTo) {
  const dates = [
    parseDateOnly(compareFrom),
    parseDateOnly(compareTo),
    parseDateOnly(withFrom),
    parseDateOnly(withTo),
  ];
  const windowStart = dates.reduce((a, b) => a < b ? a : b);
  const windowEnd   = dates.reduce((a, b) => a > b ? a : b);
  return { windowStart, windowEnd };
}

async function runWeekOnWeekReport(filters) {
  const companies = resolveCompanies(filters.companies);
  const docTypes = filters.docTypes?.length
    ? filters.docTypes.filter((d) => DEFAULT_DOC_TYPES.includes(d))
    : DEFAULT_DOC_TYPES;
  const dimension = WEEK_DIMENSIONS.includes(filters.dimension)
    ? filters.dimension
    : 'postingGroup';

  if (!companies.length || !docTypes.length) {
    return { rows: [], meta: {} };
  }

  const { windowStart, windowEnd } = resolveComparisonWindow(
    filters.compareFrom, filters.compareTo, filters.withFrom, filters.withTo
  );
  const factsSql = buildFactsUnionQuery(companies, docTypes, {
    thirdParty: filters.thirdParty ?? null,
    byProduct: filters.byProduct ?? null,
    genBusMode: filters.genBusMode || 'all',
    sectorCodes: filters.sectorCodes || [],
    customerNos: filters.customerNos || [],
    itemNos: filters.itemNos || [],
    salespersonCodes: filters.salespersonCodes || [],
    routeCodes: filters.routeCodes || [],
  });

  const groupExpr = dimension === 'sector' ? '[SectorKey]' : '[PostingGroupKey]';

  const querySql = `
    WITH facts AS (
      ${factsSql}
    )
    SELECT
      ${groupExpr} AS GroupKey,
      SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Qty] ELSE 0 END) AS PreviousQty,
      SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Amount] ELSE 0 END) AS PreviousAmount,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Qty] ELSE 0 END) AS CurrentQty,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Amount] ELSE 0 END) AS CurrentAmount,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Amount] ELSE 0 END)
        - SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Amount] ELSE 0 END) AS VarianceAmount,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Qty] ELSE 0 END)
        - SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Qty] ELSE 0 END) AS VarianceQty
    FROM facts
    WHERE [PostingDate] BETWEEN @WindowStart AND @WindowEnd
    GROUP BY ${groupExpr}
    HAVING ABS(SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Amount] ELSE 0 END))
        + ABS(SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Amount] ELSE 0 END))
        + ABS(SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Qty] ELSE 0 END))
        + ABS(SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Qty] ELSE 0 END)) > 0
    ORDER BY VarianceAmount DESC, GroupKey
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('WindowStart', sql.Date, windowStart);
  req.input('WindowEnd', sql.Date, windowEnd);
  req.input('CompareFrom', sql.Date, parseDateOnly(filters.compareFrom));
  req.input('CompareTo', sql.Date, parseDateOnly(filters.compareTo));
  req.input('WithFrom', sql.Date, parseDateOnly(filters.withFrom));
  req.input('WithTo', sql.Date, parseDateOnly(filters.withTo));
  addCommonInputs(req, filters);

  const result = await executeLoggedQuery(req, querySql, {
    reportType: 'weekOnWeek',
    dimension,
    companies,
    docTypes,
  });
  return {
    rows: result.recordset,
    meta: {
      dimension,
      compareFrom: filters.compareFrom,
      compareTo: filters.compareTo,
      withFrom: filters.withFrom,
      withTo: filters.withTo,
    },
  };
}


async function runRouteReport(filters) {
  const companies = resolveCompanies(filters.companies);
  const docTypes = filters.docTypes?.length
    ? filters.docTypes.filter((d) => DEFAULT_DOC_TYPES.includes(d))
    : DEFAULT_DOC_TYPES;

  if (!companies.length || !docTypes.length) {
    return { rows: [], meta: {} };
  }

  const factsSql = buildFactsUnionQuery(companies, docTypes, {
    thirdParty: filters.thirdParty ?? null,
    byProduct: filters.byProduct ?? null,
    genBusMode: filters.genBusMode || 'all',
    sectorCodes: filters.sectorCodes || [],
    customerNos: filters.customerNos || [],
    itemNos: filters.itemNos || [],
    salespersonCodes: filters.salespersonCodes || [],
    routeCodes: filters.routeCodes || [],
  });

  const querySql = `
    WITH facts AS (
      ${factsSql}
    )
    SELECT
      [CountryRegionKey],
      [RouteKey],
      [SectorKey],
      MAX(NULLIF([RouteDescription], '')) AS RouteDescription,
      SUM([Qty]) AS CurrentQty,
      SUM([Amount]) AS CurrentAmount
    FROM facts
    WHERE [PostingDate] BETWEEN @DateFrom AND @DateTo
    GROUP BY [CountryRegionKey], [RouteKey], [SectorKey]
    HAVING ABS(SUM([Amount])) + ABS(SUM([Qty])) > 0
    ORDER BY CurrentQty DESC, CurrentAmount DESC, CountryRegionKey, RouteKey, SectorKey
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('WindowStart', sql.Date, parseDateOnly(filters.dateFrom));
  req.input('WindowEnd', sql.Date, parseDateOnly(filters.dateTo));
  req.input('DateFrom', sql.Date, parseDateOnly(filters.dateFrom));
  req.input('DateTo', sql.Date, parseDateOnly(filters.dateTo));
  addCommonInputs(req, filters);

  const result = await executeLoggedQuery(req, querySql, {
    reportType: 'route',
    companies,
    docTypes,
  });
  return {
    rows: result.recordset,
    meta: {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    },
  };
}

async function runRouteWeekOnWeekReport(filters) {
  const companies = resolveCompanies(filters.companies);
  const docTypes = filters.docTypes?.length
    ? filters.docTypes.filter((d) => DEFAULT_DOC_TYPES.includes(d))
    : DEFAULT_DOC_TYPES;

  if (!companies.length || !docTypes.length) {
    return { rows: [], meta: {} };
  }

  const { windowStart, windowEnd } = resolveComparisonWindow(
    filters.compareFrom, filters.compareTo, filters.withFrom, filters.withTo
  );
  const factsSql = buildFactsUnionQuery(companies, docTypes, {
    thirdParty: filters.thirdParty ?? null,
    byProduct: filters.byProduct ?? null,
    genBusMode: filters.genBusMode || 'all',
    sectorCodes: filters.sectorCodes || [],
    customerNos: filters.customerNos || [],
    itemNos: filters.itemNos || [],
    salespersonCodes: filters.salespersonCodes || [],
    routeCodes: filters.routeCodes || [],
  });

  const querySql = `
    WITH facts AS (
      ${factsSql}
    )
    SELECT
      [CountryRegionKey],
      [RouteKey],
      MAX(NULLIF([RouteDescription], '')) AS RouteDescription,
      SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Qty] ELSE 0 END) AS PreviousQty,
      SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Amount] ELSE 0 END) AS PreviousAmount,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Qty] ELSE 0 END) AS CurrentQty,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Amount] ELSE 0 END) AS CurrentAmount,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Qty] ELSE 0 END)
        - SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Qty] ELSE 0 END) AS VarianceQty,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Amount] ELSE 0 END)
        - SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Amount] ELSE 0 END) AS VarianceAmount
    FROM facts
    WHERE [PostingDate] BETWEEN @WindowStart AND @WindowEnd
    GROUP BY [CountryRegionKey], [RouteKey]
    HAVING ABS(SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Amount] ELSE 0 END))
        + ABS(SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Amount] ELSE 0 END))
        + ABS(SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Qty] ELSE 0 END))
        + ABS(SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Qty] ELSE 0 END)) > 0
    ORDER BY CurrentQty DESC, CurrentAmount DESC, CountryRegionKey, RouteKey
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('WindowStart', sql.Date, windowStart);
  req.input('WindowEnd', sql.Date, windowEnd);
  req.input('CompareFrom', sql.Date, parseDateOnly(filters.compareFrom));
  req.input('CompareTo', sql.Date, parseDateOnly(filters.compareTo));
  req.input('WithFrom', sql.Date, parseDateOnly(filters.withFrom));
  req.input('WithTo', sql.Date, parseDateOnly(filters.withTo));
  addCommonInputs(req, filters);

  const result = await executeLoggedQuery(req, querySql, {
    reportType: 'routeWeekOnWeek',
    companies,
    docTypes,
  });
  return {
    rows: result.recordset,
    meta: {
      compareFrom: filters.compareFrom,
      compareTo: filters.compareTo,
      withFrom: filters.withFrom,
      withTo: filters.withTo,
    },
  };
}

async function runCustomerReport(filters) {
  const companies = resolveCompanies(filters.companies);
  const docTypes = filters.docTypes?.length
    ? filters.docTypes.filter((d) => DEFAULT_DOC_TYPES.includes(d))
    : DEFAULT_DOC_TYPES;

  if (!companies.length || !docTypes.length) {
    return { rows: [], meta: {} };
  }

  const factsSql = buildFactsUnionQuery(companies, docTypes, {
    thirdParty: filters.thirdParty ?? null,
    byProduct: filters.byProduct ?? null,
    genBusMode: filters.genBusMode || 'all',
    sectorCodes: filters.sectorCodes || [],
    customerNos: filters.customerNos || [],
    itemNos: filters.itemNos || [],
    salespersonCodes: filters.salespersonCodes || [],
    routeCodes: filters.routeCodes || [],
  });

  const querySql = `
    WITH facts AS (
      ${factsSql}
    )
    SELECT
      [SectorKey],
      [CustomerNo],
      [CustomerName],
      [ShipToCode],
      MAX(NULLIF([ShipToName], '')) AS ShipToName,
      SUM([Qty]) AS CurrentQty,
      SUM([Amount]) AS CurrentAmount
    FROM facts
    WHERE [PostingDate] BETWEEN @DateFrom AND @DateTo
    GROUP BY [SectorKey], [CustomerNo], [CustomerName], [ShipToCode]
    HAVING ABS(SUM([Amount])) + ABS(SUM([Qty])) > 0
    ORDER BY SectorKey, CurrentQty DESC, CurrentAmount DESC, CustomerName, CustomerNo, ShipToCode
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('WindowStart', sql.Date, parseDateOnly(filters.dateFrom));
  req.input('WindowEnd', sql.Date, parseDateOnly(filters.dateTo));
  req.input('DateFrom', sql.Date, parseDateOnly(filters.dateFrom));
  req.input('DateTo', sql.Date, parseDateOnly(filters.dateTo));
  addCommonInputs(req, filters);

  const result = await executeLoggedQuery(req, querySql, {
    reportType: 'customer',
    companies,
    docTypes,
  });
  return {
    rows: result.recordset,
    meta: {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    },
  };
}

async function runCustomerWeekOnWeekReport(filters) {
  const companies = resolveCompanies(filters.companies);
  const docTypes = filters.docTypes?.length
    ? filters.docTypes.filter((d) => DEFAULT_DOC_TYPES.includes(d))
    : DEFAULT_DOC_TYPES;

  if (!companies.length || !docTypes.length) {
    return { rows: [], meta: {} };
  }

  const { windowStart, windowEnd } = resolveComparisonWindow(
    filters.compareFrom, filters.compareTo, filters.withFrom, filters.withTo
  );
  const factsSql = buildFactsUnionQuery(companies, docTypes, {
    thirdParty: filters.thirdParty ?? null,
    byProduct: filters.byProduct ?? null,
    genBusMode: filters.genBusMode || 'all',
    sectorCodes: filters.sectorCodes || [],
    customerNos: filters.customerNos || [],
    itemNos: filters.itemNos || [],
    salespersonCodes: filters.salespersonCodes || [],
    routeCodes: filters.routeCodes || [],
  });

  const querySql = `
    WITH facts AS (
      ${factsSql}
    )
    SELECT
      [CustomerNo],
      [CustomerName],
      [ShipToCode],
      MAX(NULLIF([ShipToName], '')) AS ShipToName,
      SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Qty] ELSE 0 END) AS PreviousQty,
      SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Amount] ELSE 0 END) AS PreviousAmount,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Qty] ELSE 0 END) AS CurrentQty,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Amount] ELSE 0 END) AS CurrentAmount,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Qty] ELSE 0 END)
        - SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Qty] ELSE 0 END) AS VarianceQty,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Amount] ELSE 0 END)
        - SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Amount] ELSE 0 END) AS VarianceAmount
    FROM facts
    WHERE [PostingDate] BETWEEN @WindowStart AND @WindowEnd
    GROUP BY [CustomerNo], [CustomerName], [ShipToCode]
    HAVING ABS(SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Amount] ELSE 0 END))
        + ABS(SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Amount] ELSE 0 END))
        + ABS(SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Qty] ELSE 0 END))
        + ABS(SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Qty] ELSE 0 END)) > 0
    ORDER BY CurrentQty DESC, CurrentAmount DESC, CustomerName, CustomerNo, ShipToCode
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('WindowStart', sql.Date, windowStart);
  req.input('WindowEnd', sql.Date, windowEnd);
  req.input('CompareFrom', sql.Date, parseDateOnly(filters.compareFrom));
  req.input('CompareTo', sql.Date, parseDateOnly(filters.compareTo));
  req.input('WithFrom', sql.Date, parseDateOnly(filters.withFrom));
  req.input('WithTo', sql.Date, parseDateOnly(filters.withTo));
  addCommonInputs(req, filters);

  const result = await executeLoggedQuery(req, querySql, {
    reportType: 'customerWeekOnWeek',
    companies,
    docTypes,
  });
  return {
    rows: result.recordset,
    meta: {
      compareFrom: filters.compareFrom,
      compareTo: filters.compareTo,
      withFrom: filters.withFrom,
      withTo: filters.withTo,
    },
  };
}

async function runCustomerItemReport(filters) {
  const companies = resolveCompanies(filters.companies);
  const docTypes = filters.docTypes?.length
    ? filters.docTypes.filter((d) => DEFAULT_DOC_TYPES.includes(d))
    : DEFAULT_DOC_TYPES;

  if (!companies.length || !docTypes.length) {
    return { rows: [], meta: {} };
  }

  const factsSql = buildFactsUnionQuery(companies, docTypes, {
    thirdParty: filters.thirdParty ?? null,
    byProduct: filters.byProduct ?? null,
    genBusMode: filters.genBusMode || 'all',
    sectorCodes: filters.sectorCodes || [],
    customerNos: filters.customerNos || [],
    itemNos: filters.itemNos || [],
    salespersonCodes: filters.salespersonCodes || [],
    routeCodes: filters.routeCodes || [],
  });

  const querySql = `
    WITH facts AS (
      ${factsSql}
    )
    SELECT
      [CustomerNo],
      [CustomerName],
      [ProductKey],
      MAX([ProductDescription]) AS ProductDescription,
      SUM([Qty]) AS CurrentQty,
      SUM([Amount]) AS CurrentAmount
    FROM facts
    WHERE [PostingDate] BETWEEN @DateFrom AND @DateTo
      AND [ProductKey] IS NOT NULL
    GROUP BY [CustomerNo], [CustomerName], [ProductKey]
    HAVING ABS(SUM([Amount])) + ABS(SUM([Qty])) > 0
    ORDER BY CurrentQty DESC, CurrentAmount DESC, CustomerName, CustomerNo, ProductKey
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('WindowStart', sql.Date, parseDateOnly(filters.dateFrom));
  req.input('WindowEnd', sql.Date, parseDateOnly(filters.dateTo));
  req.input('DateFrom', sql.Date, parseDateOnly(filters.dateFrom));
  req.input('DateTo', sql.Date, parseDateOnly(filters.dateTo));
  addCommonInputs(req, filters);

  const result = await executeLoggedQuery(req, querySql, {
    reportType: 'customerItem',
    companies,
    docTypes,
  });
  return {
    rows: result.recordset,
    meta: {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    },
  };
}

async function runShopPaymentSummary(filters) {
  const companies = resolveCompanies(filters.companies);
  if (!companies.length) {
    return { rows: [], detailRows: [], exportRows: [], meta: {} };
  }

  const summarySegments = [];
  const detailSegments = [];
  const exportSegments = [];

  for (const companyId of companies) {
    const tables = makeTables(companyId);
    const paymentFilters = buildPaymentFilters(filters);
    const paymentHeadersSql = `
      SELECT
        COALESCE(NULLIF(ph.[Customer No_], ''), NULLIF(sih.[Sell-to Customer No_], ''), '(Blank)') AS CustomerNo,
        ISNULL(NULLIF(c.[Name], ''), COALESCE(NULLIF(ph.[Customer No_], ''), NULLIF(sih.[Sell-to Customer No_], ''), '(Blank)')) AS CustomerName,
        COALESCE(NULLIF(ph.[Invoice No_], ''), NULLIF(ph.[Invoice Pre-Assigned No_], '')) AS InvoiceNo,
        ph.[No_] AS HeaderNo
      FROM ${tables.invoicePaymentHeader} ph
      LEFT JOIN ${tables.sinvh} sih ON sih.[No_] = COALESCE(NULLIF(ph.[Invoice No_], ''), NULLIF(ph.[Invoice Pre-Assigned No_], ''))
      LEFT JOIN ${tables.customer} c ON c.[No_] = COALESCE(NULLIF(ph.[Customer No_], ''), NULLIF(sih.[Sell-to Customer No_], ''))
      WHERE ph.[Posting Date] BETWEEN @DateFrom AND @DateTo
        AND ph.[Posted] = 1
        ${paymentFilters}
    `;

    summarySegments.push(`
      SELECT
        COALESCE(i.CustomerNo, p.CustomerNo) AS CustomerNo,
        COALESCE(i.CustomerName, p.CustomerName) AS CustomerName,
        ISNULL(i.InvoiceCount, 0) AS InvoiceCount,
        ISNULL(i.InvoiceLines, 0) AS InvoiceLines,
        ISNULL(i.InvoiceAmount, 0) AS InvoiceAmount,
        ISNULL(p.PaymentLines, 0) AS PaymentLines,
        ISNULL(p.PaymentAmount, 0) AS PaymentAmount
      FROM (
        SELECT
          CustomerNo,
          CustomerName,
          COUNT(DISTINCT InvoiceNo) AS InvoiceCount,
          SUM(InvoiceLineCount) AS InvoiceLines,
          SUM(InvoiceAmount) AS InvoiceAmount
        FROM (
          SELECT
            hdr.CustomerNo,
            hdr.CustomerName,
            hdr.InvoiceNo,
            COUNT(*) AS InvoiceLineCount,
            SUM(CAST(l.[Amount] AS decimal(38, 20))) AS InvoiceAmount
          FROM (${paymentHeadersSql}) hdr
          JOIN ${tables.sinvl} l ON l.[Document No_] = hdr.InvoiceNo AND l.[Type] = 2
          GROUP BY hdr.CustomerNo, hdr.CustomerName, hdr.InvoiceNo
        ) invoice_totals
        GROUP BY CustomerNo, CustomerName
      ) i
      FULL OUTER JOIN (
        SELECT
          hdr.CustomerNo,
          hdr.CustomerName,
          COUNT(*) AS PaymentLines,
          SUM(CAST(pl.[Amount] AS decimal(38, 20))) AS PaymentAmount
        FROM (${paymentHeadersSql}) hdr
        JOIN ${tables.invoicePaymentLine} pl ON pl.[Header No_] = hdr.HeaderNo
        GROUP BY hdr.CustomerNo, hdr.CustomerName
      ) p ON p.CustomerNo = i.CustomerNo AND p.CustomerName = i.CustomerName
    `);

    detailSegments.push(`
      SELECT
        hdr.CustomerNo,
        hdr.CustomerName,
        ISNULL(NULLIF(pl.[Payment Type], ''), '(Blank)') AS PaymentType,
        COUNT(*) AS PaymentLines,
        SUM(CAST(pl.[Amount] AS decimal(38, 20))) AS PaymentAmount
      FROM (${paymentHeadersSql}) hdr
      JOIN ${tables.invoicePaymentLine} pl ON pl.[Header No_] = hdr.HeaderNo
      GROUP BY hdr.CustomerNo, hdr.CustomerName, ISNULL(NULLIF(pl.[Payment Type], ''), '(Blank)')
    `);

    exportSegments.push(`
      SELECT
        '${companyId}' AS Company,
        COALESCE(NULLIF(ph.[Customer No_], ''), NULLIF(sih.[Sell-to Customer No_], ''), '(Blank)') AS CustomerNo,
        ISNULL(NULLIF(c.[Name], ''), COALESCE(NULLIF(ph.[Customer No_], ''), NULLIF(sih.[Sell-to Customer No_], ''), '(Blank)')) AS CustomerName,
        COALESCE(NULLIF(ph.[Invoice No_], ''), NULLIF(ph.[Invoice Pre-Assigned No_], ''), '(Blank)') AS InvoiceNo,
        ph.[No_] AS PaymentHeaderNo,
        NULLIF(ph.[Linked Receipt No_], '') AS LinkedReceiptNo,
        CAST(ph.[Posting Date] AS date) AS PostingDate,
        ISNULL(NULLIF(pl.[Payment Type], ''), '(Blank)') AS PaymentType,
        NULLIF(pl.[Payment Reference], '') AS PaymentReference,
        CAST(pl.[Payment Date] AS date) AS PaymentDate,
        NULLIF(pl.[Mobile No_], '') AS MobileNo,
        CAST(pl.[Amount] AS decimal(38, 20)) AS PaymentAmount
      FROM ${tables.invoicePaymentHeader} ph
      JOIN ${tables.invoicePaymentLine} pl ON pl.[Header No_] = ph.[No_]
      LEFT JOIN ${tables.sinvh} sih ON sih.[No_] = COALESCE(NULLIF(ph.[Invoice No_], ''), NULLIF(ph.[Invoice Pre-Assigned No_], ''))
      LEFT JOIN ${tables.customer} c ON c.[No_] = COALESCE(NULLIF(ph.[Customer No_], ''), NULLIF(sih.[Sell-to Customer No_], ''))
      WHERE ph.[Posting Date] BETWEEN @DateFrom AND @DateTo
        AND ph.[Posted] = 1
        ${paymentFilters}
    `);
  }

  const summarySql = `
    SELECT
      CustomerNo,
      CustomerName,
      SUM(InvoiceCount) AS InvoiceCount,
      SUM(InvoiceLines) AS InvoiceLines,
      SUM(InvoiceAmount) AS InvoiceAmount,
      SUM(PaymentLines) AS PaymentLines,
      SUM(PaymentAmount) AS PaymentAmount
    FROM (${summarySegments.join('\nUNION ALL\n')}) s
    GROUP BY CustomerNo, CustomerName
    ORDER BY SUM(PaymentAmount) DESC, SUM(InvoiceAmount) DESC, CustomerName, CustomerNo
  `;
  const detailSql = `
    SELECT
      CustomerNo,
      CustomerName,
      PaymentType,
      SUM(PaymentLines) AS PaymentLines,
      SUM(PaymentAmount) AS PaymentAmount
    FROM (${detailSegments.join('\nUNION ALL\n')}) d
    GROUP BY CustomerNo, CustomerName, PaymentType
    ORDER BY SUM(PaymentAmount) DESC, CustomerName, CustomerNo, PaymentType
  `;
  const exportSql = `
    SELECT *
    FROM (${exportSegments.join('\nUNION ALL\n')}) e
    ORDER BY PaymentAmount DESC, CustomerName, CustomerNo, PaymentType, InvoiceNo
  `;

  const pool = await bcDb.getPool();
  const summaryReq = pool.request();
  summaryReq.input('DateFrom', sql.Date, parseDateOnly(filters.dateFrom));
  summaryReq.input('DateTo', sql.Date, parseDateOnly(filters.dateTo));
  addCommonInputs(summaryReq, filters);
  const summaryResult = await executeLoggedQuery(summaryReq, summarySql, {
    reportType: 'shopPaymentSummary',
    mode: 'summary',
    companies,
  });

  const detailReq = pool.request();
  detailReq.input('DateFrom', sql.Date, parseDateOnly(filters.dateFrom));
  detailReq.input('DateTo', sql.Date, parseDateOnly(filters.dateTo));
  addCommonInputs(detailReq, filters);
  const detailResult = await executeLoggedQuery(detailReq, detailSql, {
    reportType: 'shopPaymentSummary',
    mode: 'detail',
    companies,
  });

  const exportReq = pool.request();
  exportReq.input('DateFrom', sql.Date, parseDateOnly(filters.dateFrom));
  exportReq.input('DateTo', sql.Date, parseDateOnly(filters.dateTo));
  addCommonInputs(exportReq, filters);
  const exportResult = await executeLoggedQuery(exportReq, exportSql, {
    reportType: 'shopPaymentSummary',
    mode: 'export',
    companies,
  });

  return {
    rows: summaryResult.recordset,
    detailRows: detailResult.recordset,
    exportRows: exportResult.recordset,
    meta: {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    },
  };
}

async function runProductPerformanceReport(filters) {
  const companies = resolveCompanies(filters.companies);
  const docTypes = filters.docTypes?.length
    ? filters.docTypes.filter((d) => DEFAULT_DOC_TYPES.includes(d))
    : DEFAULT_DOC_TYPES;

  if (!companies.length || !docTypes.length) {
    return { rows: [], meta: {} };
  }

  const { windowStart, windowEnd } = resolveComparisonWindow(
    filters.compareFrom, filters.compareTo, filters.withFrom, filters.withTo
  );
  const factsSql = buildFactsUnionQuery(companies, docTypes, {
    thirdParty: filters.thirdParty ?? null,
    byProduct: filters.byProduct ?? null,
    genBusMode: filters.genBusMode || 'all',
    sectorCodes: filters.sectorCodes || [],
    customerNos: filters.customerNos || [],
    itemNos: filters.itemNos || [],
    salespersonCodes: filters.salespersonCodes || [],
    routeCodes: filters.routeCodes || [],
  });

  const querySql = `
    WITH facts AS (
      ${factsSql}
    )
    SELECT
      [PostingGroupKey] AS GroupKey,
      [ProductKey],
      MAX([ProductDescription]) AS ProductDescription,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Qty] ELSE 0 END) AS CurrentQty,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Amount] ELSE 0 END) AS CurrentAmount,
      SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Qty] ELSE 0 END) AS PreviousQty,
      SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Amount] ELSE 0 END) AS PreviousAmount,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Amount] ELSE 0 END)
        - SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Amount] ELSE 0 END) AS VarianceAmount,
      SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Qty] ELSE 0 END)
        - SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Qty] ELSE 0 END) AS VarianceQty
    FROM facts
    WHERE [PostingDate] BETWEEN @WindowStart AND @WindowEnd
      AND [ProductKey] IS NOT NULL
    GROUP BY [PostingGroupKey], [ProductKey]
    HAVING ABS(SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Amount] ELSE 0 END))
        + ABS(SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Amount] ELSE 0 END))
        + ABS(SUM(CASE WHEN [PostingDate] BETWEEN @WithFrom AND @WithTo THEN [Qty] ELSE 0 END))
        + ABS(SUM(CASE WHEN [PostingDate] BETWEEN @CompareFrom AND @CompareTo THEN [Qty] ELSE 0 END)) > 0
    ORDER BY VarianceAmount DESC, GroupKey, ProductKey
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('WindowStart', sql.Date, windowStart);
  req.input('WindowEnd', sql.Date, windowEnd);
  req.input('CompareFrom', sql.Date, parseDateOnly(filters.compareFrom));
  req.input('CompareTo', sql.Date, parseDateOnly(filters.compareTo));
  req.input('WithFrom', sql.Date, parseDateOnly(filters.withFrom));
  req.input('WithTo', sql.Date, parseDateOnly(filters.withTo));
  addCommonInputs(req, filters);

  const result = await executeLoggedQuery(req, querySql, {
    reportType: 'productPerformance',
    companies,
    docTypes,
  });
  return {
    rows: result.recordset,
    meta: {
      compareFrom: filters.compareFrom,
      compareTo: filters.compareTo,
      withFrom: filters.withFrom,
      withTo: filters.withTo,
    },
  };
}

async function runPdaVsShopReport(filters) {
  const companies = resolveCompanies(filters.companies);
  if (!companies.length) return { rows: [], meta: {} };

  const customerFilter = filters.customerNos?.length
    ? `AND h.[Sell-to Customer No_] IN (${filters.customerNos.map((_, i) => `@CustomerNo${i + 1}`).join(', ')})`
    : '';
  // Restrict to customers whose Customer Posting Group contains "SHOP"
  const shopFilter = `AND UPPER(ISNULL(c.[Customer Posting Group], '')) LIKE '%SHOP%'`;

  const segments = [];
  for (const companyId of companies) {
    const tables = makeTables(companyId);
    const invAmtExpr = `CASE WHEN ISNULL(h.[Currency Factor], 0) <> 0 THEN l.[Amount] * h.[Currency Factor] ELSE l.[Amount] END`;
    segments.push(`
      SELECT
        COALESCE(pda.CustomerNo, sales.CustomerNo) AS CustomerNo,
        COALESCE(pda.CustomerName, sales.CustomerName) AS CustomerName,
        ISNULL(pda.PdaQty, 0) AS PdaQty,
        ISNULL(pda.PdaAmount, 0) AS PdaAmount,
        ISNULL(sales.SalesQty, 0) AS SalesQty,
        ISNULL(sales.SalesAmount, 0) AS SalesAmount
      FROM (
        SELECT
          h.[Sell-to Customer No_] AS CustomerNo,
          ISNULL(NULLIF(c.[Name], ''), ISNULL(NULLIF(h.[Sell-to Customer No_], ''), '(Blank)')) AS CustomerName,
          SUM(CAST(l.[Quantity] AS decimal(38, 20))) AS PdaQty,
          SUM(CAST(l.[Amount] AS decimal(38, 20))) AS PdaAmount
        FROM ${tables.pdah} h
        JOIN ${tables.pdal} l ON l.[Document No_] = h.[No_]
        LEFT JOIN ${tables.customer} c ON c.[No_] = h.[Sell-to Customer No_]
        WHERE h.[Posting Date] BETWEEN @DateFrom AND @DateTo
          ${shopFilter}
          ${customerFilter}
        GROUP BY h.[Sell-to Customer No_],
                 ISNULL(NULLIF(c.[Name], ''), ISNULL(NULLIF(h.[Sell-to Customer No_], ''), '(Blank)'))
      ) pda
      FULL OUTER JOIN (
        SELECT CustomerNo, CustomerName, SUM(SalesQty) AS SalesQty, SUM(SalesAmount) AS SalesAmount
        FROM (
          SELECT
            h.[Sell-to Customer No_] AS CustomerNo,
            ISNULL(NULLIF(c.[Name], ''), ISNULL(NULLIF(h.[Sell-to Customer No_], ''), '(Blank)')) AS CustomerName,
            SUM(CAST(l.[Quantity (Base)] AS decimal(38, 20))) AS SalesQty,
            SUM(CAST(${invAmtExpr} AS decimal(38, 20))) AS SalesAmount
          FROM ${tables.sinvh} h
          JOIN ${tables.sinvl} l ON l.[Document No_] = h.[No_] AND l.[Type] = 2
          LEFT JOIN ${tables.customer} c ON c.[No_] = h.[Sell-to Customer No_]
          WHERE h.[Posting Date] BETWEEN @DateFrom AND @DateTo
            ${shopFilter}
            ${customerFilter}
          GROUP BY h.[Sell-to Customer No_],
                   ISNULL(NULLIF(c.[Name], ''), ISNULL(NULLIF(h.[Sell-to Customer No_], ''), '(Blank)'))
          UNION ALL
          SELECT
            h.[Sell-to Customer No_] AS CustomerNo,
            ISNULL(NULLIF(c.[Name], ''), ISNULL(NULLIF(h.[Sell-to Customer No_], ''), '(Blank)')) AS CustomerName,
            -SUM(CAST(l.[Quantity (Base)] AS decimal(38, 20))) AS SalesQty,
            -SUM(CAST(CASE WHEN ISNULL(h.[Currency Factor], 0) <> 0 THEN l.[Amount] * h.[Currency Factor] ELSE l.[Amount] END AS decimal(38, 20))) AS SalesAmount
          FROM ${tables.scmh} h
          JOIN ${tables.scml} l ON l.[Document No_] = h.[No_] AND l.[Type] = 2
          LEFT JOIN ${tables.customer} c ON c.[No_] = h.[Sell-to Customer No_]
          WHERE h.[Posting Date] BETWEEN @DateFrom AND @DateTo
            ${shopFilter}
            ${customerFilter}
          GROUP BY h.[Sell-to Customer No_],
                   ISNULL(NULLIF(c.[Name], ''), ISNULL(NULLIF(h.[Sell-to Customer No_], ''), '(Blank)'))
        ) all_sales
        GROUP BY CustomerNo, CustomerName
      ) sales ON sales.CustomerNo = pda.CustomerNo
    `);
  }

  const querySql = `
    SELECT
      CustomerNo,
      CustomerName,
      SUM(PdaQty)    AS PdaQty,
      SUM(PdaAmount) AS PdaAmount,
      SUM(SalesQty)    AS SalesQty,
      SUM(SalesAmount) AS SalesAmount,
      SUM(SalesQty)    - SUM(PdaQty)    AS VarianceQty,
      SUM(SalesAmount) - SUM(PdaAmount) AS VarianceAmount
    FROM (${segments.join('\nUNION ALL\n')}) all_data
    GROUP BY CustomerNo, CustomerName
    HAVING ABS(SUM(PdaQty)) + ABS(SUM(SalesQty)) > 0
    ORDER BY SUM(PdaQty) DESC, CustomerName, CustomerNo
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('DateFrom', sql.Date, parseDateOnly(filters.dateFrom));
  req.input('DateTo', sql.Date, parseDateOnly(filters.dateTo));
  filters.customerNos?.forEach((v, i) => req.input(`CustomerNo${i + 1}`, sql.NVarChar(20), v));

  const result = await executeLoggedQuery(req, querySql, { reportType: 'pdaVsShop', companies });
  return {
    rows: result.recordset,
    meta: { dateFrom: filters.dateFrom, dateTo: filters.dateTo },
  };
}

function makeBlankRouteLineBlock(docLabel, hTable, lTable) {
  return (companyId, tables, filters) => {
    const itemJoin = buildItemJoin(tables, filters.thirdParty, filters.byProduct);
    const itemWhere = buildItemWhere(filters.thirdParty, filters.byProduct);
    const sourceType = lTable === 'pdal' ? 'pda' : 'sales';
    const genBusFilter = buildGenBusFilter(filters.genBusMode, sourceType, tables);
    const lineType = lTable === 'pdal' ? '' : 'AND l.[Type] = 2';
    const docTypeFilter = lTable === 'sl' ? `AND h.[Document Type] IN (1, 2)` : '';
    const statusFilter = hTable === 'sh' ? `AND h.[Status] IN (4, 5)` : '';
    const shipToCodeExpr = hTable === 'pdah' ? `c.[Ship-to Code]` : `h.[Ship-to Code]`;
    const qtySpec = buildQtyJoinAndExpr(tables, lTable);
    const amountExpr = buildAmountExpr(hTable);
    const extraFilters = buildCommonFilters(filters);

    return `
      SELECT
        '${companyId}' AS Company,
        '${docLabel}' AS DocType,
        h.[No_] AS DocNo,
        CAST(h.[Posting Date] AS date) AS PostingDate,
        ISNULL(NULLIF(h.[Sell-to Customer No_], ''), '(Blank)') AS CustomerNo,
        ISNULL(NULLIF(c.[Name], ''), ISNULL(NULLIF(h.[Sell-to Customer No_], ''), '(Blank)')) AS CustomerName,
        ${buildProductKeyExpr()} AS ItemNo,
        ${buildProductDescriptionExpr()} AS ItemDescription,
        CAST(${qtySpec.qtyExpr} AS decimal(18,2)) AS Qty,
        CAST(${amountExpr} AS decimal(18,2)) AS Amount
      FROM ${tables[hTable]} h
      JOIN ${tables[lTable]} l
        ON l.[Document No_] = h.[No_]
           ${lineType}
           ${lTable === 'sl' ? 'AND l.[Document Type] = h.[Document Type]' : ''}
      ${qtySpec.join}
      LEFT JOIN ${tables.customer} c ON c.[No_] = h.[Sell-to Customer No_]
      LEFT JOIN ${tables.shipToAddress} st ON st.[Customer No_] = h.[Sell-to Customer No_] AND st.[Code] = ${shipToCodeExpr}
      LEFT JOIN ${tables.shipToAddressExt} ste ON ste.[Customer No_] = h.[Sell-to Customer No_] AND ste.[Code] = ${shipToCodeExpr}
      LEFT JOIN ${tables.item} i ON i.[No_] = l.[No_]
      ${itemJoin}
      ${genBusFilter.join}
      WHERE h.[Posting Date] BETWEEN @DateFrom AND @DateTo
        ${docTypeFilter}
        ${statusFilter}
        ${genBusFilter.where}
        AND ISNULL(NULLIF(ste.${routeCodeCol}, ''), '') = ''
        ${itemWhere}
        ${extraFilters}
    `;
  };
}

async function runPostingGroupItemReport(filters) {
  const companies = resolveCompanies(filters.companies);
  const docTypes = filters.docTypes?.length
    ? filters.docTypes.filter((d) => DEFAULT_DOC_TYPES.includes(d))
    : DEFAULT_DOC_TYPES;

  if (!companies.length || !docTypes.length) return [];

  const f = {
    thirdParty: filters.thirdParty ?? null,
    byProduct: filters.byProduct ?? null,
    genBusMode: filters.genBusMode || 'all',
    sectorCodes: filters.sectorCodes || [],
    customerNos: filters.customerNos || [],
    itemNos: filters.itemNos || [],
    salespersonCodes: filters.salespersonCodes || [],
    routeCodes: filters.routeCodes || [],
  };

  const segments = [];
  for (const companyId of companies) {
    const tables = makeTables(companyId);
    for (const docType of docTypes) {
      const factory = ITEM_DRILL_BLOCKS[docType];
      if (factory) segments.push(factory(companyId, tables, f));
    }
  }
  if (!segments.length) return [];

  const groupKeyFilter = filters.postingGroupKey != null && filters.postingGroupKey !== ''
    ? `WHERE GroupKey = @PostingGroupKey`
    : '';

  const querySql = `
    SELECT Company, GroupKey, ItemNo, ItemDescription,
           SUM(Qty) AS Qty, SUM(Amount) AS Amount
    FROM (${segments.join('\nUNION ALL\n')}) src
    ${groupKeyFilter}
    GROUP BY Company, GroupKey, ItemNo, ItemDescription
    HAVING ABS(SUM(Qty)) + ABS(SUM(Amount)) > 0
    ORDER BY SUM(Amount) DESC, ItemNo
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('DateFrom', sql.Date, parseDateOnly(filters.dateFrom));
  req.input('DateTo', sql.Date, parseDateOnly(filters.dateTo));
  if (filters.postingGroupKey != null && filters.postingGroupKey !== '') {
    req.input('PostingGroupKey', sql.NVarChar(100), filters.postingGroupKey);
  }
  addCommonInputs(req, f);

  const result = await executeLoggedQuery(req, querySql, {
    reportType: 'postingGroupItems',
    companies,
    docTypes,
    postingGroupKey: filters.postingGroupKey,
  });
  return result.recordset;
}

export async function runBlankRouteLines(filters) {
  const companies = resolveCompanies(filters.companies);
  const docTypes = filters.docTypes?.length
    ? filters.docTypes.filter((d) => DEFAULT_DOC_TYPES.includes(d))
    : DEFAULT_DOC_TYPES;

  if (!companies.length || !docTypes.length) return [];

  const blockFns = {
    invoice: makeBlankRouteLineBlock('Invoice', 'sinvh', 'sinvl'),
    credit:  makeBlankRouteLineBlock('Credit Memo', 'scmh', 'scml'),
    unposted: makeBlankRouteLineBlock('Unposted', 'sh', 'sl'),
    pda:     makeBlankRouteLineBlock('PDA', 'pdah', 'pdal'),
  };

  // routeCodes filter is intentionally omitted — we want blank-route rows regardless
  const f = {
    thirdParty:      filters.thirdParty ?? null,
    byProduct:       filters.byProduct ?? null,
    genBusMode:      filters.genBusMode || 'all',
    customerNos:     filters.customerNos || [],
    itemNos:         filters.itemNos || [],
    salespersonCodes: filters.salespersonCodes || [],
    routeCodes:      [],
  };

  const segments = [];
  for (const companyId of companies) {
    const tables = makeTables(companyId);
    for (const docType of docTypes) {
      const factory = blockFns[docType];
      if (factory) segments.push(factory(companyId, tables, f));
    }
  }

  if (!segments.length) return [];

  const querySql = `
    SELECT * FROM (
      ${segments.join('\nUNION ALL\n')}
    ) src
    WHERE NULLIF(ItemNo, '') IS NOT NULL
    ORDER BY PostingDate DESC, Company, CustomerNo, DocNo, ItemNo
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('WindowStart', sql.Date, parseDateOnly(filters.dateFrom));
  req.input('WindowEnd', sql.Date, parseDateOnly(filters.dateTo));
  req.input('DateFrom', sql.Date, parseDateOnly(filters.dateFrom));
  req.input('DateTo', sql.Date, parseDateOnly(filters.dateTo));
  addCommonInputs(req, f);

  const result = await executeLoggedQuery(req, querySql, {
    reportType: 'blankRouteLines',
    companies,
    docTypes,
  });
  return result.recordset;
}

export async function runReport(reportType, filters = {}) {
  if (reportType === 'route') {
    return runRouteReport(filters);
  }
  if (reportType === 'routeWeekOnWeek') {
    return runRouteWeekOnWeekReport(filters);
  }
  if (reportType === 'customer') {
    return runCustomerReport(filters);
  }
  if (reportType === 'customerWeekOnWeek') {
    return runCustomerWeekOnWeekReport(filters);
  }
  if (reportType === 'weekOnWeek') {
    return runWeekOnWeekReport(filters);
  }
  if (reportType === 'productPerformance') {
    return runProductPerformanceReport(filters);
  }
  if (reportType === 'customerItem') {
    return runCustomerItemReport(filters);
  }
  if (reportType === 'shopPaymentSummary') {
    return runShopPaymentSummary(filters);
  }
  if (reportType === 'pdaVsShop') {
    return runPdaVsShopReport(filters);
  }
  if (reportType === 'postingGroupItems') {
    return runPostingGroupItemReport(filters);
  }
  if (!REPORT_DIMENSIONS.includes(reportType)) {
    return [];
  }
  return runBaseMatrixReport(reportType, filters);
}

export async function listDownloadDataset(kind, companies) {
  const resolved = resolveCompanies(companies);
  if (!resolved.length) return [];

  const segments = [];
  for (const companyId of resolved) {
    const tables = makeTables(companyId);
    if (kind === 'customersBlankSector') {
      segments.push(`
        SELECT
          '${companyId}' AS Company,
          c.[No_] AS CustomerNo,
          ISNULL(NULLIF(c.[Name], ''), '(Blank)') AS CustomerName,
          ISNULL(NULLIF(cx.${sectorCol}, ''), '(Blank)') AS Sector,
          ISNULL(NULLIF(c.[Salesperson Code], ''), '(Blank)') AS SalespersonCode,
          ISNULL(NULLIF(sp.[Name], ''), '(Blank)') AS SalespersonName
        FROM ${tables.customer} c
        LEFT JOIN ${tables.customerExt} cx ON cx.[No_] = c.[No_]
        LEFT JOIN ${tables.salesperson} sp ON sp.[Code] = c.[Salesperson Code]
        WHERE NULLIF(cx.${sectorCol}, '') IS NULL
      `);
    }

    if (kind === 'shipTosBlankRoute') {
      segments.push(`
        SELECT
          '${companyId}' AS Company,
          st.[Customer No_] AS CustomerNo,
          ISNULL(NULLIF(c.[Name], ''), '(Blank)') AS CustomerName,
          st.[Code] AS ShipToCode,
          ISNULL(NULLIF(st.[Name], ''), '(Blank)') AS ShipToName,
          ISNULL(NULLIF(ste.${routeCodeCol}, ''), '(Blank)') AS RouteCode,
          ISNULL(NULLIF(dgc.[Description], ''), '(Blank)') AS RouteDescription,
          ISNULL(NULLIF(dgc.[Country_Region Code], ''), '(Blank)') AS CountryRegionCode
        FROM ${tables.shipToAddress} st
        LEFT JOIN ${tables.customer} c ON c.[No_] = st.[Customer No_]
        LEFT JOIN ${tables.shipToAddressExt} ste ON ste.[Customer No_] = st.[Customer No_] AND ste.[Code] = st.[Code]
        LEFT JOIN ${tables.districtGroupCodes} dgc ON dgc.[Code] = ste.${routeCodeCol}
        WHERE NULLIF(ste.${routeCodeCol}, '') IS NULL
      `);
    }

    if (kind === 'salespersonsAll') {
      segments.push(`
        SELECT
          '${companyId}' AS Company,
          sp.[Code] AS SalespersonCode,
          ISNULL(NULLIF(sp.[Name], ''), '(Blank)') AS SalespersonName
        FROM ${tables.salesperson} sp
        WHERE NULLIF(sp.[Code], '') IS NOT NULL
      `);
    }

    if (kind === 'routesBlankRegion') {
      segments.push(`
        SELECT
          '${companyId}' AS Company,
          dgc.[Code] AS RouteCode,
          ISNULL(NULLIF(dgc.[Description], ''), '(Blank)') AS RouteDescription,
          ISNULL(NULLIF(dgc.[Country_Region Code], ''), '(Blank)') AS CountryRegionCode
        FROM ${tables.districtGroupCodes} dgc
        WHERE NULLIF(dgc.[Code], '') IS NOT NULL
          AND NULLIF(dgc.[Country_Region Code], '') IS NULL
      `);
    }
  }

  if (!segments.length) return [];

  const orders = {
    customersBlankSector: 'CustomerName, CustomerNo',
    shipTosBlankRoute: 'CustomerName, CustomerNo, ShipToName, ShipToCode',
    salespersonsAll: 'SalespersonName, SalespersonCode',
    routesBlankRegion: 'RouteDescription, RouteCode',
  };

  const querySql = `
    SELECT *
    FROM (${segments.join('\nUNION ALL\n')}) d
    ORDER BY ${orders[kind] || '1'}
  `;
  const pool = await bcDb.getPool();
  const req = pool.request();
  const result = await executeLoggedQuery(req, querySql, { kind, companies: resolved, dataset: 'download' });
  return result.recordset;
}

export async function listPostingGroups(companies) {
  const resolved = resolveCompanies(companies);
  const blocks = [];
  for (const c of resolved) {
    const tables = [
      bcTable(c, 'Sales Invoice Line'),
      bcTable(c, 'Sales Cr_Memo Line'),
      bcTable(c, 'Sales Line'),
    ];
    tables.forEach((t) => blocks.push(
      `SELECT DISTINCT NULLIF([Posting Group], '') AS pg FROM ${t} WHERE [Type] = 2`
    ));
    blocks.push(
      `SELECT DISTINCT NULLIF([Posting Group], '') AS pg FROM ${bcTable(c, 'PDA Order Line Archive', { ext: true })}`
    );
  }
  const pool = await bcDb.getPool();
  const req = pool.request();
  const querySql = `SELECT DISTINCT pg FROM (${blocks.join(' UNION ALL ')}) x WHERE pg IS NOT NULL ORDER BY pg`;
  const result = await executeLoggedQuery(req, querySql, { slicer: 'postingGroups', companies: resolved });
  return result.recordset.map((r) => r.pg);
}

export async function listSectors(companies) {
  const resolved = resolveCompanies(companies);
  const blocks = resolved.map((c) =>
    `SELECT DISTINCT NULLIF(${sectorCol}, '') AS sec FROM ${bcTable(c, 'Customer', { coreExt: true })}`
  );
  const pool = await bcDb.getPool();
  const req = pool.request();
  const querySql = `SELECT DISTINCT sec FROM (${blocks.join(' UNION ALL ')}) x WHERE sec IS NOT NULL ORDER BY sec`;
  const result = await executeLoggedQuery(req, querySql, { slicer: 'sectors', companies: resolved });
  return result.recordset.map((r) => r.sec);
}

export async function listGenBusPostingGroups(companies) {
  const resolved = resolveCompanies(companies);
  const blocks = [];
  for (const c of resolved) {
    [bcTable(c, 'Sales Invoice Header'), bcTable(c, 'Sales Cr_Memo Header'), bcTable(c, 'Sales Header')].forEach((t) =>
      blocks.push(`SELECT DISTINCT NULLIF([Gen_ Bus_ Posting Group], '') AS gbpg FROM ${t}`)
    );
  }
  const pool = await bcDb.getPool();
  const req = pool.request();
  const querySql = `SELECT DISTINCT gbpg FROM (${blocks.join(' UNION ALL ')}) x WHERE gbpg IS NOT NULL ORDER BY gbpg`;
  const result = await executeLoggedQuery(req, querySql, { slicer: 'genBusPostingGroups', companies: resolved });
  return result.recordset.map((r) => r.gbpg);
}

export async function listSalespersons(companies) {
  const resolved = resolveCompanies(companies);

  // Collect distinct codes from the selected companies' transaction headers
  const codeBlocks = resolved.map((c) => {
    const headers = [
      bcTable(c, 'Sales Invoice Header'),
      bcTable(c, 'Sales Cr_Memo Header'),
      bcTable(c, 'Sales Header'),
      bcTable(c, 'PDA Order Header Archive', { ext: true }),
    ];
    return headers.map((h) => `
      SELECT DISTINCT NULLIF(h.[Salesperson Code], '') AS code
      FROM ${h} h
      WHERE NULLIF(h.[Salesperson Code], '') IS NOT NULL
    `).join('\nUNION ALL\n');
  });

  // Look up names across ALL companies so codes defined in one company
  // (e.g. CM3 salesperson used on FCL invoices) still get their name resolved
  const spBlocks = ALL_COMPANIES.map((c) =>
    `SELECT [Code], NULLIF([Name], '') AS [Name] FROM ${bcTable(c, 'Salesperson_Purchaser')}`
  ).join('\nUNION ALL\n');

  const querySql = `
    WITH codes AS (
      SELECT DISTINCT code FROM (${codeBlocks.join('\nUNION ALL\n')}) c WHERE code IS NOT NULL
    ),
    sp AS (
      SELECT [Code], MAX([Name]) AS [Name]
      FROM (${spBlocks}) s
      GROUP BY [Code]
    )
    SELECT c.code, sp.[Name] AS name
    FROM codes c
    LEFT JOIN sp ON sp.[Code] = c.code
    ORDER BY sp.[Name], c.code
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  const result = await executeLoggedQuery(req, querySql, { slicer: 'salespersons', companies: resolved });
  return result.recordset.map((r) => ({
    value: r.code,
    label: r.name ? `${r.code} - ${r.name}` : r.code,
    code: r.code,
    name: r.name || '',
  }));
}

export async function listRoutes(companies) {
  const resolved = resolveCompanies(companies);
  const blocks = resolved.map((c) => {
    const customer = bcTable(c, 'Customer');
    const shipToExt = bcTable(c, 'Ship-to Address', { coreExt: true });
    const districtGroupCodes = bcTable(c, 'District Group Code', { ext: true });
    const salesBlocks = [
      `SELECT h.[Sell-to Customer No_] AS customerNo, h.[Ship-to Code] AS shipToCode FROM ${bcTable(c, 'Sales Invoice Header')} h`,
      `SELECT h.[Sell-to Customer No_] AS customerNo, h.[Ship-to Code] AS shipToCode FROM ${bcTable(c, 'Sales Cr_Memo Header')} h`,
      `SELECT h.[Sell-to Customer No_] AS customerNo, h.[Ship-to Code] AS shipToCode FROM ${bcTable(c, 'Sales Header')} h`,
      `SELECT h.[Sell-to Customer No_] AS customerNo, c.[Ship-to Code] AS shipToCode
       FROM ${bcTable(c, 'PDA Order Header Archive', { ext: true })} h
       LEFT JOIN ${customer} c ON c.[No_] = h.[Sell-to Customer No_]`,
    ].join('\nUNION ALL\n');

    return `
      SELECT DISTINCT
        NULLIF(ste.${routeCodeCol}, '') AS routeCode,
        NULLIF(dgc.[Description], '') AS routeDescription,
        NULLIF(dgc.[Country_Region Code], '') AS countryRegionCode
      FROM (${salesBlocks}) rd
      LEFT JOIN ${shipToExt} ste ON ste.[Customer No_] = rd.customerNo AND ste.[Code] = rd.shipToCode
      LEFT JOIN ${districtGroupCodes} dgc ON dgc.[Code] = ste.${routeCodeCol}
      WHERE NULLIF(ste.${routeCodeCol}, '') IS NOT NULL
    `;
  });
  const pool = await bcDb.getPool();
  const req = pool.request();
  const querySql = `SELECT DISTINCT routeCode, routeDescription, countryRegionCode
     FROM (${blocks.join(' UNION ALL ')}) x
     WHERE routeCode IS NOT NULL
     ORDER BY countryRegionCode, routeDescription, routeCode`;
  const result = await executeLoggedQuery(req, querySql, { slicer: 'routes', companies: resolved });
  return result.recordset.map((r) => ({
    value: r.routeCode,
    label: [r.countryRegionCode, r.routeCode, r.routeDescription].filter(Boolean).join(' - '),
    code: r.routeCode,
    description: r.routeDescription || '',
    countryRegion: r.countryRegionCode || '',
  }));
}

export async function listCustomers(companies) {
  const resolved = resolveCompanies(companies);
  const blocks = resolved.map((c) => {
    const customer = bcTable(c, 'Customer');
    const headers = [
      bcTable(c, 'Sales Invoice Header'),
      bcTable(c, 'Sales Cr_Memo Header'),
      bcTable(c, 'Sales Header'),
      bcTable(c, 'PDA Order Header Archive', { ext: true }),
    ];
    return headers.map((h) => `
      SELECT DISTINCT
        NULLIF(h.[Sell-to Customer No_], '') AS no,
        NULLIF(c.[Name], '') AS name
      FROM ${h} h
      LEFT JOIN ${customer} c ON c.[No_] = h.[Sell-to Customer No_]
      WHERE NULLIF(h.[Sell-to Customer No_], '') IS NOT NULL
    `).join('\nUNION ALL\n');
  });
  const pool = await bcDb.getPool();
  const req = pool.request();
  const querySql = `SELECT DISTINCT no, name FROM (${blocks.join(' UNION ALL ')}) x WHERE no IS NOT NULL ORDER BY name, no`;
  const result = await executeLoggedQuery(req, querySql, { slicer: 'customers', companies: resolved });
  return result.recordset.map((r) => ({
    value: r.no,
    label: r.name ? `${r.no} - ${r.name}` : r.no,
    no: r.no,
    name: r.name || '',
  }));
}

export async function listItems(companies, filters = {}) {
  const resolved = resolveCompanies(companies);
  const blocks = resolved.map((c) => {
    const item = bcTable(c, 'Item');
    const itemExt = bcTable(c, 'Item', { coreExt: true });
    const lineTables = [
      { table: bcTable(c, 'Sales Invoice Line'), needsType: true, needsDocType: false },
      { table: bcTable(c, 'Sales Cr_Memo Line'), needsType: true, needsDocType: false },
      { table: bcTable(c, 'Sales Line'), needsType: true, needsDocType: false },
      { table: bcTable(c, 'PDA Order Line Archive', { ext: true }), needsType: false, needsDocType: false },
    ];
    return lineTables.map(({ table, needsType }) => `
      SELECT DISTINCT
        NULLIF(l.[No_], '') AS no,
        NULLIF(i.[Description], '') AS description
      FROM ${table} l
      LEFT JOIN ${item} i ON i.[No_] = l.[No_]
      LEFT JOIN ${itemExt} ix ON ix.[No_] = l.[No_]
      WHERE NULLIF(l.[No_], '') IS NOT NULL
        ${needsType ? 'AND l.[Type] = 2' : ''}
        ${filters.thirdParty != null ? `AND ISNULL(ix.${thirdPartyCol}, 0) = ${filters.thirdParty ? 1 : 0}` : ''}
        ${filters.byProduct != null ? `AND ISNULL(ix.${byProductCol}, 0) = ${filters.byProduct ? 1 : 0}` : ''}
    `).join('\nUNION ALL\n');
  });
  const pool = await bcDb.getPool();
  const req = pool.request();
  const querySql = `SELECT DISTINCT no, description FROM (${blocks.join(' UNION ALL ')}) x WHERE no IS NOT NULL ORDER BY description, no`;
  const result = await executeLoggedQuery(req, querySql, { slicer: 'items', companies: resolved });
  return result.recordset.map((r) => ({
    value: r.no,
    label: r.description ? `${r.no} - ${r.description}` : r.no,
    no: r.no,
    description: r.description || '',
  }));
}

// ── Customer Posting Group Mapping CRUD (app DB) ──────────────────────────────

export async function listCustPgMappings() {
  const appPool = await appDb.getPool();
  const result = await appPool.request().query(`
    SELECT [MapId], [CompanyId], [NativeGroupCode], [DisplayGroupCode], [SortOrder]
    FROM [dbo].[CustPostingGroupMap]
    ORDER BY [SortOrder], [CompanyId], [NativeGroupCode]
  `);
  return result.recordset;
}

export async function saveCustPgMapping({ mapId, companyId, nativeGroupCode, displayGroupCode, sortOrder }) {
  const appPool = await appDb.getPool();
  const req = appPool.request()
    .input('companyId',        sql.NVarChar(10),  String(companyId || '').trim().toUpperCase())
    .input('nativeGroupCode',  sql.NVarChar(100), String(nativeGroupCode || '').trim().toUpperCase())
    .input('displayGroupCode', sql.NVarChar(100), String(displayGroupCode || '').trim())
    .input('sortOrder',        sql.Int,           Number(sortOrder) || 0);

  if (mapId) {
    req.input('mapId', sql.UniqueIdentifier, mapId);
    await req.query(`
      UPDATE [dbo].[CustPostingGroupMap]
      SET [CompanyId]        = @companyId,
          [NativeGroupCode]  = @nativeGroupCode,
          [DisplayGroupCode] = @displayGroupCode,
          [SortOrder]        = @sortOrder,
          [UpdatedAt]        = GETUTCDATE()
      WHERE [MapId] = @mapId
    `);
    return { mapId };
  }
  const r = await req.query(`
    INSERT INTO [dbo].[CustPostingGroupMap]
      ([CompanyId], [NativeGroupCode], [DisplayGroupCode], [SortOrder])
    OUTPUT INSERTED.[MapId]
    VALUES (@companyId, @nativeGroupCode, @displayGroupCode, @sortOrder)
  `);
  return { mapId: r.recordset[0].MapId };
}

export async function deleteCustPgMapping(mapId) {
  const appPool = await appDb.getPool();
  await appPool.request()
    .input('mapId', sql.UniqueIdentifier, mapId)
    .query(`DELETE FROM [dbo].[CustPostingGroupMap] WHERE [MapId] = @mapId`);
}

// ── Customer Aging Report ─────────────────────────────────────────────────────

export async function runCustomerAging({ asOfDate, companies: companiesFilter }) {
  const companies = resolveCompanies(companiesFilter);
  if (!companies.length) return { rows: [], meta: { asOfDate } };

  // Load posting group display mappings from app DB
  const appPool = await appDb.getPool();
  const mapResult = await appPool.request().query(`
    SELECT [CompanyId], [NativeGroupCode], [DisplayGroupCode]
    FROM [dbo].[CustPostingGroupMap]
  `);
  const pgMap = new Map();
  for (const r of mapResult.recordset) {
    pgMap.set(`${r.CompanyId}::${r.NativeGroupCode}`, r.DisplayGroupCode);
  }

  const asOf = parseDateOnly(asOfDate);

  // Build one sub-query per company; each returns pre-bucketed rows at (PostingGroup, CustomerNo)
  const segments = [];
  for (const companyId of companies) {
    const cle      = bcTable(companyId, 'Cust_ Ledger Entry');
    const dcle     = bcTable(companyId, 'Detailed Cust_ Ledg_ Entry');
    const customer = bcTable(companyId, 'Customer');
    segments.push(`
      SELECT
        '${companyId}' AS Company,
        ISNULL(NULLIF(ae.PostingGroup, ''), '(Blank)') AS PostingGroup,
        ae.CustomerNo,
        MAX(ISNULL(NULLIF(c.[Name], ''), ae.CustomerNo)) AS CustomerName,
        SUM(CASE WHEN ae.AgeDays <= 30              THEN ae.Remaining ELSE 0 END) AS Current_,
        SUM(CASE WHEN ae.AgeDays BETWEEN 31 AND 60  THEN ae.Remaining ELSE 0 END) AS Days30,
        SUM(CASE WHEN ae.AgeDays BETWEEN 61 AND 90  THEN ae.Remaining ELSE 0 END) AS Days60,
        SUM(CASE WHEN ae.AgeDays > 90               THEN ae.Remaining ELSE 0 END) AS Days90Plus,
        SUM(ae.Remaining) AS Balance
      FROM (
        SELECT
          cle.[Customer No_]         AS CustomerNo,
          cle.[Customer Posting Group] AS PostingGroup,
          DATEDIFF(day, CAST(cle.[Posting Date] AS date), @AsOfDate) AS AgeDays,
          SUM(dcle.[Amount])         AS Remaining
        FROM ${cle} cle
        JOIN ${dcle} dcle
          ON dcle.[Cust_ Ledger Entry No_] = cle.[Entry No_]
         AND CAST(dcle.[Posting Date] AS date) <= @AsOfDate
        WHERE CAST(cle.[Posting Date] AS date) <= @AsOfDate
        GROUP BY
          cle.[Entry No_],
          cle.[Customer No_],
          cle.[Customer Posting Group],
          cle.[Posting Date]
        HAVING SUM(dcle.[Amount]) <> 0
      ) ae
      LEFT JOIN ${customer} c ON c.[No_] = ae.CustomerNo
      GROUP BY ae.PostingGroup, ae.CustomerNo
      HAVING ABS(SUM(ae.Remaining)) > 0
    `);
  }

  const querySql = `
    SELECT Company, PostingGroup, CustomerNo,
           MAX(CustomerName) AS CustomerName,
           SUM(Current_)  AS Current_,
           SUM(Days30)    AS Days30,
           SUM(Days60)    AS Days60,
           SUM(Days90Plus) AS Days90Plus,
           SUM(Balance)   AS Balance
    FROM (${segments.join('\nUNION ALL\n')}) raw
    GROUP BY Company, PostingGroup, CustomerNo
    HAVING ABS(SUM(Balance)) > 0
    ORDER BY PostingGroup, CustomerName, CustomerNo
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('AsOfDate', sql.Date, asOf);

  const result = await executeLoggedQuery(req, querySql, {
    reportType: 'customerAging',
    companies,
    asOfDate,
  });

  // Apply posting group display mapping in JS and re-aggregate if needed
  const aggMap = new Map();
  for (const row of result.recordset) {
    const mapKey     = `${row.Company}::${row.PostingGroup}`;
    const displayGroup = pgMap.get(mapKey) || row.PostingGroup;
    const aggKey     = `${displayGroup}||${row.Company}||${row.CustomerNo}`;
    if (!aggMap.has(aggKey)) {
      aggMap.set(aggKey, {
        Company:      row.Company,
        PostingGroup: displayGroup,
        CustomerNo:   row.CustomerNo,
        CustomerName: row.CustomerName,
        Current_:     Number(row.Current_)  || 0,
        Days30:       Number(row.Days30)    || 0,
        Days60:       Number(row.Days60)    || 0,
        Days90Plus:   Number(row.Days90Plus) || 0,
        Balance:      Number(row.Balance)   || 0,
      });
    } else {
      const agg = aggMap.get(aggKey);
      agg.Current_   += Number(row.Current_)  || 0;
      agg.Days30     += Number(row.Days30)    || 0;
      agg.Days60     += Number(row.Days60)    || 0;
      agg.Days90Plus += Number(row.Days90Plus) || 0;
      agg.Balance    += Number(row.Balance)   || 0;
    }
  }

  const rows = [...aggMap.values()].sort((a, b) =>
    a.PostingGroup.localeCompare(b.PostingGroup) ||
    a.CustomerName.localeCompare(b.CustomerName) ||
    a.CustomerNo.localeCompare(b.CustomerNo)
  );

  return { rows, meta: { asOfDate } };
}
