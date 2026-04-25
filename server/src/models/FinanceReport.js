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
