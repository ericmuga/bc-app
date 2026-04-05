/**
 * models/BcReport.js
 * Queries BC tables directly for sales reporting.
 *
 * Report types:  postingGroup | sector | salesperson | route
 * Filters:       companies, dateFrom, dateTo, docTypes,
 *                thirdParty (null|0|1), genBusPGs (string[])
 *
 * Returns flat rows: { Company, GroupKey, DocType, DocCount, Qty, Amount }
 * Frontend pivots these into a matrix and handles Net/Sales/Credits view.
 */
import { bcDb, bcSql as sql } from '../db/bcPool.js';
import { bcTable, extCol, resolveCompanies } from '../services/bcTables.js';

const DEFAULT_DOC_TYPES = ['invoice', 'credit', 'unposted', 'pda'];

// ── Dimension factories ───────────────────────────────────────────────────────

/**
 * Posting Group – normalize by stripping the company prefix before '-'
 * so that JF-SAUSAGE (FCL) and BF-SAUSAGE (CM) both become SAUSAGE.
 */
const postingGroupDim = {
  extraJoin:   '',
  selectExpr:  `ISNULL(
                  CASE WHEN CHARINDEX('-', l.[Posting Group]) > 0
                       THEN SUBSTRING(l.[Posting Group],
                              CHARINDEX('-', l.[Posting Group]) + 1,
                              LEN(l.[Posting Group]))
                       ELSE NULLIF(l.[Posting Group], '')
                  END, '(Blank)')`,
  groupByExpr: `l.[Posting Group]`,
};

/** Sector – join CustomerExt for the Sector extension field */
function makeSectorDim(companyId) {
  const custExtTable = bcTable(companyId, 'Customer', { coreExt: true });
  const sectorCol    = extCol('Sector');
  return {
    extraJoin:   `LEFT JOIN ${custExtTable} cx ON cx.[No_] = h.[Sell-to Customer No_]`,
    selectExpr:  `ISNULL(NULLIF(cx.${sectorCol}, ''), '(Blank)')`,
    groupByExpr: `cx.${sectorCol}`,
  };
}

/** Salesperson – join Salesperson_Purchaser for display name */
function makeSalespersonDim(companyId) {
  const spTable = bcTable(companyId, 'Salesperson_Purchaser');
  return {
    extraJoin:   `LEFT JOIN ${spTable} sp ON sp.[Code] = h.[Salesperson Code]`,
    selectExpr:  `ISNULL(NULLIF(sp.[Name], ''), ISNULL(NULLIF(h.[Salesperson Code], ''), '(Blank)'))`,
    groupByExpr: `h.[Salesperson Code], sp.[Name]`,
  };
}

/** Route – group by Location Code on the header */
const routeDim = {
  extraJoin:   '',
  selectExpr:  `ISNULL(NULLIF(h.[Location Code], ''), '(Blank)')`,
  groupByExpr: `h.[Location Code]`,
};

function getDim(reportType, companyId) {
  switch (reportType) {
    case 'sector':      return makeSectorDim(companyId);
    case 'salesperson': return makeSalespersonDim(companyId);
    case 'route':       return routeDim;
    default:            return postingGroupDim;   // postingGroup
  }
}

// ── WHERE / JOIN fragments built from optional filters ────────────────────────

function buildItemJoin(tables, thirdParty) {
  if (thirdParty == null) return '';
  return `LEFT JOIN ${tables.itemExt} ix ON ix.[No_] = l.[No_]`;
}

function buildItemWhere(tables, thirdParty) {
  if (thirdParty == null) return '';
  const col = extCol('Third Party');
  const val = thirdParty ? 1 : 0;
  return `AND ISNULL(ix.${col}, 0) = ${val}`;
}

const FOREIGN_GEN_BUS = `'FOREIGN','B FOREIGN'`;

/**
 * genBusMode: 'all' | 'foreign' | 'local'
 *   foreign → IN ('FOREIGN','B FOREIGN')
 *   local   → NOT IN ('FOREIGN','B FOREIGN')
 */
function buildGenBusWhere(genBusMode) {
  if (!genBusMode || genBusMode === 'all') return '';
  if (genBusMode === 'foreign') return `AND h.[Gen_ Bus_ Posting Group] IN (${FOREIGN_GEN_BUS})`;
  if (genBusMode === 'local')   return `AND h.[Gen_ Bus_ Posting Group] NOT IN (${FOREIGN_GEN_BUS})`;
  return '';
}

// ── Block builders ─────────────────────────────────────────────────────────────

function makeBlock(docLabel, sign, hTable, lTable, dateField, joinLine, extraFilters) {
  return (companyId, dim, tables, rf) => {
    const itemJoin   = buildItemJoin(tables, rf.thirdParty);
    const itemWhere  = buildItemWhere(tables, rf.thirdParty);
    const genBusWhere = buildGenBusWhere(rf.genBusMode);
    const lineType   = lTable === 'pdal' ? '' : 'AND l.[Type] = 2';
    const docTypeFilter = lTable === 'sl'
      ? `AND h.[Document Type] IN (1, 2)` : '';

    return `
    SELECT '${companyId}' AS Company,
           ${dim.selectExpr} AS GroupKey,
           '${docLabel}' AS DocType,
           COUNT(DISTINCT h.[No_]) AS DocCount,
           ${sign}SUM(l.[Quantity]) AS Qty,
           ${sign}SUM(l.[Amount])   AS Amount
    FROM   ${tables[hTable]} h
    JOIN   ${tables[lTable]} l ON l.[Document No_] = h.[No_] ${lineType}
                              ${lTable === 'sl' ? 'AND l.[Document Type] = h.[Document Type]' : ''}
    ${dim.extraJoin}
    ${itemJoin}
    WHERE  h.[${dateField}] BETWEEN @DateFrom AND @DateTo
      ${docTypeFilter}
      ${genBusWhere}
      ${itemWhere}
    GROUP BY ${dim.groupByExpr}`;
  };
}

const BLOCK_DEFS = {
  invoice:  makeBlock('Invoice',    '',  'sinvh', 'sinvl', 'Posting Date',  '', ''),
  credit:   makeBlock('Credit Memo','-', 'scmh',  'scml',  'Posting Date',  '', ''),
  unposted: makeBlock('Unposted',   '',  'sh',    'sl',    'Posting Date',  '', ''),
  pda:      makeBlock('PDA',        '',  'pdah',  'pdal',  'Posting Date',  '', ''),
};

// ── Core query builder ────────────────────────────────────────────────────────

function buildUnionQuery(companies, docTypes, reportType, rf) {
  const segments = [];

  for (const companyId of companies) {
    const dim = getDim(reportType, companyId);
    const tables = {
      sinvh:   bcTable(companyId, 'Sales Invoice Header'),
      sinvl:   bcTable(companyId, 'Sales Invoice Line'),
      scmh:    bcTable(companyId, 'Sales Cr_Memo Header'),
      scml:    bcTable(companyId, 'Sales Cr_Memo Line'),
      sh:      bcTable(companyId, 'Sales Header'),
      sl:      bcTable(companyId, 'Sales Line'),
      pdah:    bcTable(companyId, 'PDA Order Header Archive', { ext: true }),
      pdal:    bcTable(companyId, 'PDA Order Line Archive',   { ext: true }),
      itemExt: bcTable(companyId, 'Item', { coreExt: true }),
    };

    for (const dt of docTypes) {
      if (BLOCK_DEFS[dt]) {
        segments.push(BLOCK_DEFS[dt](companyId, dim, tables, rf));
      }
    }
  }

  return segments.length ? segments.join('\n    UNION ALL') : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run a report.
 * @param {'postingGroup'|'sector'|'salesperson'|'route'} reportType
 * @param {object} filters
 * @param {string[]} filters.companies
 * @param {string}   filters.dateFrom      YYYY-MM-DD
 * @param {string}   filters.dateTo        YYYY-MM-DD
 * @param {string[]} filters.docTypes
 * @param {0|1|null} filters.thirdParty    null = all, 0 = own, 1 = third party
 * @param {'all'|'foreign'|'local'} filters.genBusMode
 */
export async function runReport(reportType, filters = {}) {
  const companies = resolveCompanies(filters.companies);
  const docTypes  = (filters.docTypes?.length)
    ? filters.docTypes.filter(d => DEFAULT_DOC_TYPES.includes(d))
    : DEFAULT_DOC_TYPES;

  if (!companies.length || !docTypes.length) return [];

  const rf = {
    thirdParty: filters.thirdParty ?? null,
    genBusMode: filters.genBusMode || 'all',
  };

  const unionSql = buildUnionQuery(companies, docTypes, reportType, rf);
  if (!unionSql) return [];

  const querySql = `
    SELECT Company, GroupKey, DocType,
           SUM(DocCount) AS DocCount,
           SUM(Qty)      AS Qty,
           SUM(Amount)   AS Amount
    FROM (${unionSql}) src
    GROUP BY Company, GroupKey, DocType
    ORDER BY Company, GroupKey, DocType
  `;

  const pool = await bcDb.getPool();
  const req  = pool.request();
  req.input('DateFrom', sql.Date, new Date(filters.dateFrom));
  req.input('DateTo',   sql.Date, new Date(filters.dateTo));
  const result = await req.query(querySql);
  return result.recordset;
}

// ── Slicer helpers ────────────────────────────────────────────────────────────

export async function listPostingGroups(companies) {
  const resolved = resolveCompanies(companies);
  const blocks = [];
  for (const c of resolved) {
    const tables = [
      bcTable(c, 'Sales Invoice Line'),
      bcTable(c, 'Sales Cr_Memo Line'),
      bcTable(c, 'Sales Line'),
    ];
    tables.forEach(t => blocks.push(
      `SELECT DISTINCT NULLIF([Posting Group],'') AS pg FROM ${t} WHERE [Type] = 2`
    ));
    blocks.push(
      `SELECT DISTINCT NULLIF([Posting Group],'') AS pg FROM ${bcTable(c, 'PDA Order Line Archive', { ext: true })}`
    );
  }
  const pool   = await bcDb.getPool();
  const result = await pool.request().query(
    `SELECT DISTINCT pg FROM (${blocks.join(' UNION ALL ')}) x WHERE pg IS NOT NULL ORDER BY pg`
  );
  return result.recordset.map(r => r.pg);
}

export async function listSectors(companies) {
  const resolved  = resolveCompanies(companies);
  const sectorCol = extCol('Sector');
  const blocks    = resolved.map(c =>
    `SELECT DISTINCT NULLIF(${sectorCol},'') AS sec FROM ${bcTable(c, 'Customer', { coreExt: true })}`
  );
  const pool   = await bcDb.getPool();
  const result = await pool.request().query(
    `SELECT DISTINCT sec FROM (${blocks.join(' UNION ALL ')}) x WHERE sec IS NOT NULL ORDER BY sec`
  );
  return result.recordset.map(r => r.sec);
}

export async function listGenBusPostingGroups(companies) {
  const resolved = resolveCompanies(companies);
  const blocks   = [];
  for (const c of resolved) {
    [bcTable(c, 'Sales Invoice Header'), bcTable(c, 'Sales Cr_Memo Header'), bcTable(c, 'Sales Header')].forEach(t =>
      blocks.push(`SELECT DISTINCT NULLIF([Gen_ Bus_ Posting Group],'') AS gbpg FROM ${t}`)
    );
  }
  const pool   = await bcDb.getPool();
  const result = await pool.request().query(
    `SELECT DISTINCT gbpg FROM (${blocks.join(' UNION ALL ')}) x WHERE gbpg IS NOT NULL ORDER BY gbpg`
  );
  return result.recordset.map(r => r.gbpg);
}

export async function listSalespersons(companies) {
  const resolved = resolveCompanies(companies);
  const blocks   = resolved.map(c => {
    const sp = bcTable(c, 'Salesperson_Purchaser');
    return `SELECT DISTINCT NULLIF([Code],'') AS code, NULLIF([Name],'') AS name FROM ${sp}`;
  });
  const pool   = await bcDb.getPool();
  const result = await pool.request().query(
    `SELECT DISTINCT code, name FROM (${blocks.join(' UNION ALL ')}) x WHERE code IS NOT NULL ORDER BY name`
  );
  return result.recordset;
}

export async function listRoutes(companies) {
  const resolved = resolveCompanies(companies);
  const blocks   = [];
  for (const c of resolved) {
    [bcTable(c, 'Sales Invoice Header'), bcTable(c, 'Sales Header')].forEach(t =>
      blocks.push(`SELECT DISTINCT NULLIF([Location Code],'') AS loc FROM ${t}`)
    );
  }
  const pool   = await bcDb.getPool();
  const result = await pool.request().query(
    `SELECT DISTINCT loc FROM (${blocks.join(' UNION ALL ')}) x WHERE loc IS NOT NULL ORDER BY loc`
  );
  return result.recordset.map(r => r.loc);
}
