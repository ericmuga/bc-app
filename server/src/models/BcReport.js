/**
 * models/BcReport.js
 * Queries BC tables directly for sales reporting.
 */
import { bcDb, bcSql as sql } from '../db/bcPool.js';
import { bcTable, extCol, resolveCompanies } from '../services/bcTables.js';

const DEFAULT_DOC_TYPES = ['invoice', 'credit', 'unposted', 'pda'];
const REPORT_DIMENSIONS = ['postingGroup', 'sector', 'salesperson', 'route'];
const WEEK_DIMENSIONS = ['postingGroup', 'sector'];
const FOREIGN_GEN_BUS = `'FOREIGN','B FOREIGN'`;
const MONDAY_ANCHOR = '19000101';

const sectorCol = extCol('Sector');
const thirdPartyCol = extCol('Third Party');

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
  extraJoin: '',
  selectExpr: normalizedPostingGroupExpr('l'),
  groupByExpr: 'l.[Posting Group]',
};

function makeSectorDim() {
  return {
    extraJoin: `LEFT JOIN ${'{customerExt}'} cx ON cx.[No_] = h.[Sell-to Customer No_]`,
    selectExpr: `ISNULL(NULLIF(cx.${sectorCol}, ''), '(Blank)')`,
    groupByExpr: `cx.${sectorCol}`,
  };
}

function makeSalespersonDim() {
  return {
    extraJoin: `LEFT JOIN ${'{salesperson}'} sp ON sp.[Code] = h.[Salesperson Code]`,
    selectExpr: `ISNULL(NULLIF(sp.[Name], ''), ISNULL(NULLIF(h.[Salesperson Code], ''), '(Blank)'))`,
    groupByExpr: `h.[Salesperson Code], sp.[Name]`,
  };
}

const routeDim = {
  extraJoin: '',
  selectExpr: `ISNULL(NULLIF(h.[Location Code], ''), '(Blank)')`,
  groupByExpr: `h.[Location Code]`,
};

function getDim(reportType) {
  switch (reportType) {
    case 'sector':
      return makeSectorDim();
    case 'salesperson':
      return makeSalespersonDim();
    case 'route':
      return routeDim;
    default:
      return postingGroupDim;
  }
}

function resolveDimSql(reportType, tables) {
  const dim = getDim(reportType);
  return {
    extraJoin: dim.extraJoin
      .replace('{customerExt}', tables.customerExt)
      .replace('{salesperson}', tables.salesperson),
    selectExpr: dim.selectExpr,
    groupByExpr: dim.groupByExpr,
  };
}

function buildItemJoin(tables, thirdParty) {
  if (thirdParty == null) return '';
  return `LEFT JOIN ${tables.itemExt} ix ON ix.[No_] = l.[No_]`;
}

function buildItemWhere(thirdParty) {
  if (thirdParty == null) return '';
  const val = thirdParty ? 1 : 0;
  return `AND ISNULL(ix.${thirdPartyCol}, 0) = ${val}`;
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
  if (filters.customerQuery) {
    clauses.push(`AND (
      h.[Sell-to Customer No_] LIKE @CustomerQuery
      OR ISNULL(c.[Name], '') LIKE @CustomerQuery
    )`);
  }
  if (filters.itemQuery) {
    clauses.push(`AND (
      l.[No_] LIKE @ItemQuery
      OR ISNULL(i.[Common Item No_], '') LIKE @ItemQuery
      OR ISNULL(i.[Description], l.[Description]) LIKE @ItemQuery
    )`);
  }
  return clauses.join('\n      ');
}

function buildProductKeyExpr() {
  return `ISNULL(
    NULLIF(i.[Common Item No_], ''),
    NULLIF(l.[No_], '')
  )`;
}

function buildProductDescriptionExpr() {
  return `ISNULL(NULLIF(i.[Description], ''), NULLIF(l.[Description], ''), '(Blank)')`;
}

function makeAggregateBlock(docLabel, sign, hTable, lTable) {
  return (companyId, dim, tables, filters) => {
    const itemJoin = buildItemJoin(tables, filters.thirdParty);
    const itemWhere = buildItemWhere(filters.thirdParty);
    const sourceType = lTable === 'pdal' ? 'pda' : 'sales';
    const genBusFilter = buildGenBusFilter(filters.genBusMode, sourceType, tables);
    const lineType = lTable === 'pdal' ? '' : 'AND l.[Type] = 2';
    const docTypeFilter = lTable === 'sl'
      ? `AND h.[Document Type] IN (1, 2)`
      : '';

    return `
      SELECT '${companyId}' AS Company,
             ${dim.selectExpr} AS GroupKey,
             '${docLabel}' AS DocType,
             COUNT(DISTINCT h.[No_]) AS DocCount,
             ${sign}SUM(l.[Quantity]) AS Qty,
             ${sign}SUM(l.[Amount]) AS Amount
      FROM ${tables[hTable]} h
      JOIN ${tables[lTable]} l
        ON l.[Document No_] = h.[No_]
       ${lineType}
       ${lTable === 'sl' ? 'AND l.[Document Type] = h.[Document Type]' : ''}
      LEFT JOIN ${tables.customer} c ON c.[No_] = h.[Sell-to Customer No_]
      LEFT JOIN ${tables.item} i ON i.[No_] = l.[No_]
      ${dim.extraJoin}
      ${itemJoin}
      ${genBusFilter.join}
      WHERE h.[Posting Date] BETWEEN @DateFrom AND @DateTo
        ${docTypeFilter}
        ${genBusFilter.where}
        ${itemWhere}
      GROUP BY ${dim.groupByExpr}
    `;
  };
}

function makeFactBlock(docLabel, sign, hTable, lTable) {
  return (companyId, tables, filters) => {
    const itemJoin = buildItemJoin(tables, filters.thirdParty);
    const itemWhere = buildItemWhere(filters.thirdParty);
    const sourceType = lTable === 'pdal' ? 'pda' : 'sales';
    const genBusFilter = buildGenBusFilter(filters.genBusMode, sourceType, tables);
    const lineType = lTable === 'pdal' ? '' : 'AND l.[Type] = 2';
    const docTypeFilter = lTable === 'sl'
      ? `AND h.[Document Type] IN (1, 2)`
      : '';
    const extraFilters = buildCommonFilters(filters);

    return `
      SELECT
        '${companyId}' AS Company,
        '${docLabel}' AS DocType,
        CAST(h.[Posting Date] AS date) AS PostingDate,
        ${weekStartExpr('h')} AS WeekStart,
        ${normalizedWeekdayExpr('h')} AS WeekdayNo,
        ${normalizedPostingGroupExpr('l')} AS PostingGroupKey,
        ISNULL(NULLIF(cx.${sectorCol}, ''), '(Blank)') AS SectorKey,
        ISNULL(NULLIF(h.[Sell-to Customer No_], ''), '(Blank)') AS CustomerNo,
        ISNULL(NULLIF(c.[Name], ''), ISNULL(NULLIF(h.[Sell-to Customer No_], ''), '(Blank)')) AS CustomerName,
        ${buildProductKeyExpr()} AS ProductKey,
        ${buildProductDescriptionExpr()} AS ProductDescription,
        ${sign}CAST(l.[Quantity] AS decimal(38, 20)) AS Qty,
        ${sign}CAST(l.[Amount] AS decimal(38, 20)) AS Amount
      FROM ${tables[hTable]} h
      JOIN ${tables[lTable]} l
        ON l.[Document No_] = h.[No_]
       ${lineType}
       ${lTable === 'sl' ? 'AND l.[Document Type] = h.[Document Type]' : ''}
      LEFT JOIN ${tables.customer} c ON c.[No_] = h.[Sell-to Customer No_]
      LEFT JOIN ${tables.customerExt} cx ON cx.[No_] = h.[Sell-to Customer No_]
      LEFT JOIN ${tables.item} i ON i.[No_] = l.[No_]
      ${itemJoin}
      ${genBusFilter.join}
      WHERE h.[Posting Date] BETWEEN @WindowStart AND @WindowEnd
        ${docTypeFilter}
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
    pdah: bcTable(companyId, 'PDA Order Header Archive', { ext: true }),
    pdal: bcTable(companyId, 'PDA Order Line Archive', { ext: true }),
    customer: bcTable(companyId, 'Customer'),
    customerExt: bcTable(companyId, 'Customer', { coreExt: true }),
    item: bcTable(companyId, 'Item'),
    itemExt: bcTable(companyId, 'Item', { coreExt: true }),
    salesperson: bcTable(companyId, 'Salesperson_Purchaser'),
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
  if (filters.customerQuery) {
    req.input('CustomerQuery', sql.NVarChar(120), `%${filters.customerQuery}%`);
  }
  if (filters.itemQuery) {
    req.input('ItemQuery', sql.NVarChar(120), `%${filters.itemQuery}%`);
  }
}

async function runBaseMatrixReport(reportType, filters) {
  const companies = resolveCompanies(filters.companies);
  const docTypes = filters.docTypes?.length
    ? filters.docTypes.filter((d) => DEFAULT_DOC_TYPES.includes(d))
    : DEFAULT_DOC_TYPES;

  if (!companies.length || !docTypes.length) return [];

  const unionSql = buildAggregateUnionQuery(companies, docTypes, reportType, {
    thirdParty: filters.thirdParty ?? null,
    genBusMode: filters.genBusMode || 'all',
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
  req.input('DateFrom', sql.Date, parseDateOnly(filters.dateFrom));
  req.input('DateTo', sql.Date, parseDateOnly(filters.dateTo));
  const result = await req.query(querySql);
  return result.recordset;
}

function resolveWeekComparisonRange(dateFrom, dateTo) {
  const from = parseDateOnly(dateFrom);
  const to = parseDateOnly(dateTo);
  const latestWeekStart = getWeekStart(to);
  const previousWeekStart = addDays(latestWeekStart, -7);
  const dateSpan = diffDaysInclusive(from, to);

  return {
    currentWeekStart: latestWeekStart,
    currentWeekEnd: addDays(latestWeekStart, 6),
    previousWeekStart,
    previousWeekEnd: addDays(previousWeekStart, 6),
    usesLatestTwoWeeksOnly: dateSpan > 14,
  };
}

async function runWeekOnWeekReport(filters) {
  const companies = resolveCompanies(filters.companies);
  const docTypes = filters.docTypes?.length
    ? filters.docTypes.filter((d) => DEFAULT_DOC_TYPES.includes(d))
    : DEFAULT_DOC_TYPES;
  const dimension = WEEK_DIMENSIONS.includes(filters.dimension)
    ? filters.dimension
    : 'postingGroup';
  const selectedDays = filters.daysOfWeek?.length
    ? filters.daysOfWeek.filter((d) => d >= 1 && d <= 7)
    : [1, 2, 3, 4, 5, 6, 7];

  if (!companies.length || !docTypes.length) {
    return { rows: [], meta: {} };
  }

  const comparison = resolveWeekComparisonRange(filters.dateFrom, filters.dateTo);
  const factsSql = buildFactsUnionQuery(companies, docTypes, {
    thirdParty: filters.thirdParty ?? null,
    genBusMode: filters.genBusMode || 'all',
    customerQuery: filters.customerQuery || '',
    itemQuery: filters.itemQuery || '',
  });

  const dayParams = selectedDays.map((_, idx) => `@Day${idx + 1}`).join(', ');
  const groupExpr = dimension === 'sector' ? '[SectorKey]' : '[PostingGroupKey]';

  const querySql = `
    WITH facts AS (
      ${factsSql}
    )
    SELECT
      ${groupExpr} AS GroupKey,
      SUM(CASE WHEN [WeekStart] = @PreviousWeekStart THEN [Qty] ELSE 0 END) AS PreviousQty,
      SUM(CASE WHEN [WeekStart] = @PreviousWeekStart THEN [Amount] ELSE 0 END) AS PreviousAmount,
      SUM(CASE WHEN [WeekStart] = @CurrentWeekStart THEN [Qty] ELSE 0 END) AS CurrentQty,
      SUM(CASE WHEN [WeekStart] = @CurrentWeekStart THEN [Amount] ELSE 0 END) AS CurrentAmount,
      SUM(CASE WHEN [WeekStart] = @CurrentWeekStart THEN [Amount] ELSE 0 END)
        - SUM(CASE WHEN [WeekStart] = @PreviousWeekStart THEN [Amount] ELSE 0 END) AS VarianceAmount,
      SUM(CASE WHEN [WeekStart] = @CurrentWeekStart THEN [Qty] ELSE 0 END)
        - SUM(CASE WHEN [WeekStart] = @PreviousWeekStart THEN [Qty] ELSE 0 END) AS VarianceQty
    FROM facts
    WHERE [WeekStart] IN (@PreviousWeekStart, @CurrentWeekStart)
      AND [WeekdayNo] IN (${dayParams})
    GROUP BY ${groupExpr}
    HAVING ABS(SUM(CASE WHEN [WeekStart] = @PreviousWeekStart THEN [Amount] ELSE 0 END))
        + ABS(SUM(CASE WHEN [WeekStart] = @CurrentWeekStart THEN [Amount] ELSE 0 END))
        + ABS(SUM(CASE WHEN [WeekStart] = @PreviousWeekStart THEN [Qty] ELSE 0 END))
        + ABS(SUM(CASE WHEN [WeekStart] = @CurrentWeekStart THEN [Qty] ELSE 0 END)) > 0
    ORDER BY VarianceAmount DESC, GroupKey
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('WindowStart', sql.Date, comparison.previousWeekStart);
  req.input('WindowEnd', sql.Date, comparison.currentWeekEnd);
  req.input('PreviousWeekStart', sql.Date, comparison.previousWeekStart);
  req.input('CurrentWeekStart', sql.Date, comparison.currentWeekStart);
  addCommonInputs(req, filters);
  selectedDays.forEach((day, idx) => req.input(`Day${idx + 1}`, sql.Int, day));

  const result = await req.query(querySql);
  return {
    rows: result.recordset,
    meta: {
      dimension,
      selectedDays,
      currentWeekStart: formatDateOnly(comparison.currentWeekStart),
      currentWeekEnd: formatDateOnly(comparison.currentWeekEnd),
      previousWeekStart: formatDateOnly(comparison.previousWeekStart),
      previousWeekEnd: formatDateOnly(comparison.previousWeekEnd),
      usesLatestTwoWeeksOnly: comparison.usesLatestTwoWeeksOnly,
    },
  };
}

function resolvePerformancePeriods(dateFrom, dateTo) {
  const currentFrom = parseDateOnly(dateFrom);
  const currentTo = parseDateOnly(dateTo);
  const spanDays = diffDaysInclusive(currentFrom, currentTo);
  const previousTo = addDays(currentFrom, -1);
  const previousFrom = addDays(previousTo, -(spanDays - 1));
  return { currentFrom, currentTo, previousFrom, previousTo, spanDays };
}

async function runProductPerformanceReport(filters) {
  const companies = resolveCompanies(filters.companies);
  const docTypes = filters.docTypes?.length
    ? filters.docTypes.filter((d) => DEFAULT_DOC_TYPES.includes(d))
    : DEFAULT_DOC_TYPES;

  if (!companies.length || !docTypes.length) {
    return { rows: [], meta: {} };
  }

  const periods = resolvePerformancePeriods(filters.dateFrom, filters.dateTo);
  const factsSql = buildFactsUnionQuery(companies, docTypes, {
    thirdParty: filters.thirdParty ?? null,
    genBusMode: filters.genBusMode || 'all',
    customerQuery: filters.customerQuery || '',
    itemQuery: filters.itemQuery || '',
  });

  const querySql = `
    WITH facts AS (
      ${factsSql}
    )
    SELECT
      [PostingGroupKey] AS GroupKey,
      [ProductKey],
      MAX([ProductDescription]) AS ProductDescription,
      SUM(CASE WHEN [PostingDate] BETWEEN @CurrentFrom AND @CurrentTo THEN [Qty] ELSE 0 END) AS CurrentQty,
      SUM(CASE WHEN [PostingDate] BETWEEN @CurrentFrom AND @CurrentTo THEN [Amount] ELSE 0 END) AS CurrentAmount,
      SUM(CASE WHEN [PostingDate] BETWEEN @PreviousFrom AND @PreviousTo THEN [Qty] ELSE 0 END) AS PreviousQty,
      SUM(CASE WHEN [PostingDate] BETWEEN @PreviousFrom AND @PreviousTo THEN [Amount] ELSE 0 END) AS PreviousAmount,
      SUM(CASE WHEN [PostingDate] BETWEEN @CurrentFrom AND @CurrentTo THEN [Amount] ELSE 0 END)
        - SUM(CASE WHEN [PostingDate] BETWEEN @PreviousFrom AND @PreviousTo THEN [Amount] ELSE 0 END) AS VarianceAmount,
      SUM(CASE WHEN [PostingDate] BETWEEN @CurrentFrom AND @CurrentTo THEN [Qty] ELSE 0 END)
        - SUM(CASE WHEN [PostingDate] BETWEEN @PreviousFrom AND @PreviousTo THEN [Qty] ELSE 0 END) AS VarianceQty
    FROM facts
    WHERE [PostingDate] BETWEEN @PreviousFrom AND @CurrentTo
      AND [ProductKey] IS NOT NULL
    GROUP BY [PostingGroupKey], [ProductKey]
    HAVING ABS(SUM(CASE WHEN [PostingDate] BETWEEN @CurrentFrom AND @CurrentTo THEN [Amount] ELSE 0 END))
        + ABS(SUM(CASE WHEN [PostingDate] BETWEEN @PreviousFrom AND @PreviousTo THEN [Amount] ELSE 0 END))
        + ABS(SUM(CASE WHEN [PostingDate] BETWEEN @CurrentFrom AND @CurrentTo THEN [Qty] ELSE 0 END))
        + ABS(SUM(CASE WHEN [PostingDate] BETWEEN @PreviousFrom AND @PreviousTo THEN [Qty] ELSE 0 END)) > 0
    ORDER BY VarianceAmount DESC, GroupKey, ProductKey
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('WindowStart', sql.Date, periods.previousFrom);
  req.input('WindowEnd', sql.Date, periods.currentTo);
  req.input('PreviousFrom', sql.Date, periods.previousFrom);
  req.input('PreviousTo', sql.Date, periods.previousTo);
  req.input('CurrentFrom', sql.Date, periods.currentFrom);
  req.input('CurrentTo', sql.Date, periods.currentTo);
  addCommonInputs(req, filters);

  const result = await req.query(querySql);
  return {
    rows: result.recordset,
    meta: {
      currentFrom: formatDateOnly(periods.currentFrom),
      currentTo: formatDateOnly(periods.currentTo),
      previousFrom: formatDateOnly(periods.previousFrom),
      previousTo: formatDateOnly(periods.previousTo),
      spanDays: periods.spanDays,
    },
  };
}

export async function runReport(reportType, filters = {}) {
  if (reportType === 'weekOnWeek') {
    return runWeekOnWeekReport(filters);
  }
  if (reportType === 'productPerformance') {
    return runProductPerformanceReport(filters);
  }
  if (!REPORT_DIMENSIONS.includes(reportType)) {
    return [];
  }
  return runBaseMatrixReport(reportType, filters);
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
  const result = await pool.request().query(
    `SELECT DISTINCT pg FROM (${blocks.join(' UNION ALL ')}) x WHERE pg IS NOT NULL ORDER BY pg`
  );
  return result.recordset.map((r) => r.pg);
}

export async function listSectors(companies) {
  const resolved = resolveCompanies(companies);
  const blocks = resolved.map((c) =>
    `SELECT DISTINCT NULLIF(${sectorCol}, '') AS sec FROM ${bcTable(c, 'Customer', { coreExt: true })}`
  );
  const pool = await bcDb.getPool();
  const result = await pool.request().query(
    `SELECT DISTINCT sec FROM (${blocks.join(' UNION ALL ')}) x WHERE sec IS NOT NULL ORDER BY sec`
  );
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
  const result = await pool.request().query(
    `SELECT DISTINCT gbpg FROM (${blocks.join(' UNION ALL ')}) x WHERE gbpg IS NOT NULL ORDER BY gbpg`
  );
  return result.recordset.map((r) => r.gbpg);
}

export async function listSalespersons(companies) {
  const resolved = resolveCompanies(companies);
  const blocks = resolved.map((c) => {
    const sp = bcTable(c, 'Salesperson_Purchaser');
    return `SELECT DISTINCT NULLIF([Code], '') AS code, NULLIF([Name], '') AS name FROM ${sp}`;
  });
  const pool = await bcDb.getPool();
  const result = await pool.request().query(
    `SELECT DISTINCT code, name FROM (${blocks.join(' UNION ALL ')}) x WHERE code IS NOT NULL ORDER BY name`
  );
  return result.recordset;
}

export async function listRoutes(companies) {
  const resolved = resolveCompanies(companies);
  const blocks = [];
  for (const c of resolved) {
    [bcTable(c, 'Sales Invoice Header'), bcTable(c, 'Sales Header')].forEach((t) =>
      blocks.push(`SELECT DISTINCT NULLIF([Location Code], '') AS loc FROM ${t}`)
    );
  }
  const pool = await bcDb.getPool();
  const result = await pool.request().query(
    `SELECT DISTINCT loc FROM (${blocks.join(' UNION ALL ')}) x WHERE loc IS NOT NULL ORDER BY loc`
  );
  return result.recordset.map((r) => r.loc);
}
