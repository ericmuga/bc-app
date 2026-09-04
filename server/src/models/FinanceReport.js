/**
 * models/FinanceReport.js
 * BC direct-query finance reports: Trial Balance, P&L, Balance Sheet.
 * Reads from the BC database (bcPool) using standard BC GL tables.
 *
 * BC GL Account Category codes:
 *   0=None  1=Assets  2=Liabilities  3=Equity
 *   4=Income  5=COGS  6=Expense  7=Tax
 *
 * BC Income_Balance:  0=Income Statement  1=Balance Sheet
 * BC Account Type:    0=Posting  1=Heading  2=Total  3=Begin-Total  4=End-Total
 */

import { bcDb, bcSql } from '../db/bcPool.js';
import { bcTable, resolveCompanies } from '../services/bcTables.js';
import { getPlDefinition, parseSpec, specMatches } from '../services/financePl.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function queryBc(querySql, params = {}) {
  const pool = await bcDb.getPool();
  const req  = pool.request();
  for (const [key, { type, value }] of Object.entries(params)) {
    req.input(key, type, value);
  }
  return req.query(querySql);
}

/** Build per-company GL Account + GL Entry joined SELECT block */
function glBlock(companyId, { selectExtra = '', whereExtra = '', groupByExtra = '', params = {} } = {}) {
  const acct  = bcTable(companyId, 'G_L Account');
  const entry = bcTable(companyId, 'G_L Entry');
  return { acct, entry, selectExtra, whereExtra, groupByExtra, params };
}

/**
 * Trial Balance
 * Returns one row per (Company, AccountNo) with:
 *   PeriodDebit, PeriodCredit, ClosingBalance
 */
export async function getTrialBalance({ companies, dateFrom, dateTo }) {
  const resolved = resolveCompanies(companies);

  const blocks = resolved.map((c) => {
    const acct  = bcTable(c, 'G_L Account');
    const entry = bcTable(c, 'G_L Entry');
    return `
      SELECT
        '${c}' AS Company,
        a.[No_]               AS AccountNo,
        RTRIM(a.[Name])       AS AccountName,
        a.[Account Type]      AS AccountType,
        a.[Account Category]  AS AccountCategory,
        a.[Income_Balance]    AS IncomeBalance,
        ISNULL(SUM(CASE WHEN e.[Posting Date] < @dateFrom THEN e.[Amount] ELSE 0 END), 0) AS OpeningBalance,
        ISNULL(SUM(CASE WHEN e.[Posting Date] >= @dateFrom AND e.[Posting Date] <= @dateTo THEN e.[Debit Amount]  ELSE 0 END), 0) AS PeriodDebit,
        ISNULL(SUM(CASE WHEN e.[Posting Date] >= @dateFrom AND e.[Posting Date] <= @dateTo THEN e.[Credit Amount] ELSE 0 END), 0) AS PeriodCredit,
        ISNULL(SUM(CASE WHEN e.[Posting Date] <= @dateTo THEN e.[Amount] ELSE 0 END), 0) AS ClosingBalance
      FROM ${acct} a
      LEFT JOIN ${entry} e ON e.[G_L Account No_] = a.[No_]
      WHERE a.[Account Type] = 0 AND a.[Blocked] = 0
      GROUP BY a.[No_], a.[Name], a.[Account Type], a.[Account Category], a.[Income_Balance]
      HAVING
        ISNULL(SUM(CASE WHEN e.[Posting Date] >= @dateFrom AND e.[Posting Date] <= @dateTo THEN e.[Debit Amount]  ELSE 0 END), 0) <> 0
        OR ISNULL(SUM(CASE WHEN e.[Posting Date] >= @dateFrom AND e.[Posting Date] <= @dateTo THEN e.[Credit Amount] ELSE 0 END), 0) <> 0
        OR ISNULL(SUM(CASE WHEN e.[Posting Date] <= @dateTo THEN e.[Amount] ELSE 0 END), 0) <> 0
    `;
  });

  const { recordset } = await queryBc(
    blocks.join('\nUNION ALL\n') + '\nORDER BY AccountNo, Company',
    {
      dateFrom: { type: bcSql.Date, value: new Date(dateFrom) },
      dateTo:   { type: bcSql.Date, value: new Date(dateTo) },
    }
  );
  return recordset;
}

/**
 * Profit & Loss
 * Income Statement accounts (Income_Balance = 0), categories 4, 5, 6, 7.
 * Returns Period (month) and YTD amounts.
 * Sign convention: Income = negative GL amount (credit) → negate for display.
 */
export async function getProfitLoss({ companies, dateFrom, dateTo, ytdFrom }) {
  const resolved = resolveCompanies(companies);

  const blocks = resolved.map((c) => {
    const acct  = bcTable(c, 'G_L Account');
    const entry = bcTable(c, 'G_L Entry');
    return `
      SELECT
        '${c}' AS Company,
        a.[No_]               AS AccountNo,
        RTRIM(a.[Name])       AS AccountName,
        a.[Account Category]  AS AccountCategory,
        ISNULL(SUM(CASE WHEN e.[Posting Date] >= @dateFrom AND e.[Posting Date] <= @dateTo THEN e.[Amount] ELSE 0 END), 0) AS PeriodAmount,
        ISNULL(SUM(CASE WHEN e.[Posting Date] >= @ytdFrom  AND e.[Posting Date] <= @dateTo THEN e.[Amount] ELSE 0 END), 0) AS YtdAmount
      FROM ${acct} a
      LEFT JOIN ${entry} e ON e.[G_L Account No_] = a.[No_]
      WHERE a.[Account Type] = 0 AND a.[Income_Balance] = 0 AND a.[Blocked] = 0
        AND a.[Account Category] IN (4, 5, 6, 7)
      GROUP BY a.[No_], a.[Name], a.[Account Category]
      HAVING
        ISNULL(SUM(CASE WHEN e.[Posting Date] >= @dateFrom AND e.[Posting Date] <= @dateTo THEN e.[Amount] ELSE 0 END), 0) <> 0
        OR ISNULL(SUM(CASE WHEN e.[Posting Date] >= @ytdFrom  AND e.[Posting Date] <= @dateTo THEN e.[Amount] ELSE 0 END), 0) <> 0
    `;
  });

  const { recordset } = await queryBc(
    blocks.join('\nUNION ALL\n') + '\nORDER BY AccountNo, Company',
    {
      dateFrom: { type: bcSql.Date, value: new Date(dateFrom) },
      dateTo:   { type: bcSql.Date, value: new Date(dateTo) },
      ytdFrom:  { type: bcSql.Date, value: new Date(ytdFrom) },
    }
  );
  return recordset;
}

/**
 * Configurable P&L STATEMENT for one company, built from its editable definition
 * (services/financePl.js). Sums G/L Entry per account over the period and buckets
 * into the definition's lines. Sign convention: each account line = -SUM(Amount)
 * so income shows positive and expenses negative; subtotals are plain sums; the
 * tax line applies its rate to its base (only when the base is a profit).
 * Returns { company, title, dateFrom, dateTo, rows[], overlaps[], unmapped }.
 */
export async function computePlStatement({ company, dateFrom, dateTo }) {
  const co = String(company || '').toUpperCase();
  const def = await getPlDefinition(co);
  const entry = bcTable(co, 'G_L Entry');
  const acct  = bcTable(co, 'G_L Account');
  const { recordset } = await queryBc(
    `SELECT e.[G_L Account No_] AS AccountNo, MAX(RTRIM(a.[Name])) AS AccountName, SUM(e.[Amount]) AS Amount
     FROM ${entry} e
     LEFT JOIN ${acct} a ON a.[No_] = e.[G_L Account No_]
     WHERE e.[Posting Date] >= @dateFrom AND e.[Posting Date] <= @dateTo
     GROUP BY e.[G_L Account No_]`,
    { dateFrom: { type: bcSql.Date, value: new Date(dateFrom) }, dateTo: { type: bcSql.Date, value: new Date(dateTo) } }
  );
  const accts = recordset.map((r) => ({ no: String(r.AccountNo).trim(), name: r.AccountName || '', amt: Number(r.Amount) || 0 }));

  const values = {};              // line key -> statement value
  const memberOf = new Map();     // accountNo -> [lineKeys] (overlap detection)
  const mapped = new Set();
  const accountsByLine = {};      // line key -> [{accountNo, name, amount}] (drill-down detail)

  // 1) Account-bucket lines (sign-flipped so income is positive).
  for (const line of def.lines) {
    if (line.kind !== 'accounts') continue;
    const ranges = parseSpec(line.spec);
    let sum = 0;
    const members = [];
    for (const a of accts) {
      if (specMatches(a.no, ranges)) {
        sum += a.amt; mapped.add(a.no);
        memberOf.set(a.no, (memberOf.get(a.no) || []).concat(line.key));
        members.push({ accountNo: a.no, name: a.name, amount: -round2(a.amt) });
      }
    }
    values[line.key] = -round2(sum);
    accountsByLine[line.key] = members.sort((x, y) => x.accountNo.localeCompare(y.accountNo));
  }
  // 2) Subtotals + tax, in definition order (depends on earlier values).
  for (const line of def.lines) {
    if (line.kind === 'subtotal') {
      values[line.key] = round2((line.of || []).reduce((s, k) => s + (values[k] || 0), 0));
    } else if (line.kind === 'tax') {
      const base = values[line.base] || 0;
      const rate = line.rate ?? def.taxRate ?? 0;
      values[line.key] = base > 0 ? -round2(base * rate) : 0;
    }
  }

  // Accounts that landed in more than one line (double-counted) — surfaced as a warning.
  const overlaps = [...memberOf.entries()]
    .filter(([, ks]) => new Set(ks).size > 1)
    .map(([account, ks]) => ({ account, lines: [...new Set(ks)] }));
  // Income-statement accounts with movement that no line captured.
  const unmapped = accts.filter((a) => !mapped.has(a.no) && a.amt !== 0).length;

  const rows = def.lines.map((l) => ({
    key: l.key, label: l.label, kind: l.kind, amount: values[l.key] ?? 0,
    spec: l.spec || null,
    accounts: l.kind === 'accounts' ? (accountsByLine[l.key] || []) : undefined,
  }));
  return { company: co, title: def.title, dateFrom, dateTo, rows, overlaps, unmapped };
}

/**
 * Balance Sheet
 * Balance Sheet accounts (Income_Balance = 1), categories 1, 2, 3.
 * Balance = cumulative GL amount up to dateTo.
 */
export async function getBalanceSheet({ companies, dateTo }) {
  const resolved = resolveCompanies(companies);

  const blocks = resolved.map((c) => {
    const acct  = bcTable(c, 'G_L Account');
    const entry = bcTable(c, 'G_L Entry');
    return `
      SELECT
        '${c}' AS Company,
        a.[No_]               AS AccountNo,
        RTRIM(a.[Name])       AS AccountName,
        a.[Account Category]  AS AccountCategory,
        ISNULL(SUM(CASE WHEN e.[Posting Date] <= @dateTo THEN e.[Amount] ELSE 0 END), 0) AS Balance
      FROM ${acct} a
      LEFT JOIN ${entry} e ON e.[G_L Account No_] = a.[No_]
      WHERE a.[Account Type] = 0 AND a.[Income_Balance] = 1 AND a.[Blocked] = 0
        AND a.[Account Category] IN (1, 2, 3)
      GROUP BY a.[No_], a.[Name], a.[Account Category]
      HAVING ISNULL(SUM(CASE WHEN e.[Posting Date] <= @dateTo THEN e.[Amount] ELSE 0 END), 0) <> 0
    `;
  });

  const { recordset } = await queryBc(
    blocks.join('\nUNION ALL\n') + '\nORDER BY AccountNo, Company',
    {
      dateTo: { type: bcSql.Date, value: new Date(dateTo) },
    }
  );
  return recordset;
}

/**
 * GL Account Mapper - list all mappings from the app DB
 */
export async function listGlMappings(pool) {
  const result = await pool.request().query(`
    SELECT * FROM [dbo].[GlAccountMapper] ORDER BY [SortOrder], [Section], [AccountFrom]
  `);
  return result.recordset;
}

export async function saveGlMapping(pool, mapping) {
  const { mapId, companyId, accountFrom, accountTo, section, lineLabel, sortOrder } = mapping;
  if (mapId) {
    await pool.request()
      .input('mapId',      bcSql.UniqueIdentifier, mapId)
      .input('companyId',  bcSql.NVarChar(10),    companyId || 'ALL')
      .input('accountFrom',bcSql.NVarChar(20),    accountFrom)
      .input('accountTo',  bcSql.NVarChar(20),    accountTo || accountFrom)
      .input('section',    bcSql.NVarChar(50),    section)
      .input('lineLabel',  bcSql.NVarChar(200),   lineLabel)
      .input('sortOrder',  bcSql.Int,             sortOrder || 0)
      .query(`
        UPDATE [dbo].[GlAccountMapper]
        SET [CompanyId]=@companyId,[AccountFrom]=@accountFrom,[AccountTo]=@accountTo,
            [Section]=@section,[LineLabel]=@lineLabel,[SortOrder]=@sortOrder,[UpdatedAt]=GETUTCDATE()
        WHERE [MapId]=@mapId
      `);
    return { mapId };
  } else {
    const r = await pool.request()
      .input('companyId',  bcSql.NVarChar(10),    companyId || 'ALL')
      .input('accountFrom',bcSql.NVarChar(20),    accountFrom)
      .input('accountTo',  bcSql.NVarChar(20),    accountTo || accountFrom)
      .input('section',    bcSql.NVarChar(50),    section)
      .input('lineLabel',  bcSql.NVarChar(200),   lineLabel)
      .input('sortOrder',  bcSql.Int,             sortOrder || 0)
      .query(`
        INSERT INTO [dbo].[GlAccountMapper]
          ([CompanyId],[AccountFrom],[AccountTo],[Section],[LineLabel],[SortOrder])
        OUTPUT INSERTED.[MapId]
        VALUES (@companyId,@accountFrom,@accountTo,@section,@lineLabel,@sortOrder)
      `);
    return { mapId: r.recordset[0].MapId };
  }
}

export async function deleteGlMapping(pool, mapId) {
  await pool.request()
    .input('mapId', bcSql.UniqueIdentifier, mapId)
    .query(`DELETE FROM [dbo].[GlAccountMapper] WHERE [MapId]=@mapId`);
}
