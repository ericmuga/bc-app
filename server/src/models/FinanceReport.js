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
import { whsDb, whsSql } from '../db/whsPool.js';
import { bcTable, resolveCompanies } from '../services/bcTables.js';
import { getPlDefinition, parseSpec, specMatches } from '../services/financePl.js';
import { GL_MONTHLY_TABLE, GL_WATERMARK_TABLE } from '../services/glMonthlyEtl.js';

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
        ISNULL(SUM(CASE WHEN e.[Posting Date] >= @dateFrom AND e.[Posting Date] < DATEADD(day,1,@dateTo) THEN e.[Debit Amount]  ELSE 0 END), 0) AS PeriodDebit,
        ISNULL(SUM(CASE WHEN e.[Posting Date] >= @dateFrom AND e.[Posting Date] < DATEADD(day,1,@dateTo) THEN e.[Credit Amount] ELSE 0 END), 0) AS PeriodCredit,
        ISNULL(SUM(CASE WHEN e.[Posting Date] < DATEADD(day,1,@dateTo) THEN e.[Amount] ELSE 0 END), 0) AS ClosingBalance
      FROM ${acct} a
      -- INNER JOIN + the Posting Date upper bound lets SQL seek the (account,
      -- date) index instead of scanning all ~111M entries incl. future-dated
      -- rows. Accounts with no in-range entries net to zero and are dropped by
      -- HAVING anyway, so INNER JOIN does not change the result.
      INNER JOIN ${entry} e
        ON e.[G_L Account No_] = a.[No_]
       AND e.[Posting Date]    < DATEADD(day,1,@dateTo)
      -- Include blocked accounts: they can still carry a balance/movement, and
      -- excluding them unbalances the TB (movement + closing must net to zero).
      WHERE a.[Account Type] = 0
      GROUP BY a.[No_], a.[Name], a.[Account Type], a.[Account Category], a.[Income_Balance]
      HAVING
        ISNULL(SUM(CASE WHEN e.[Posting Date] >= @dateFrom AND e.[Posting Date] < DATEADD(day,1,@dateTo) THEN e.[Debit Amount]  ELSE 0 END), 0) <> 0
        OR ISNULL(SUM(CASE WHEN e.[Posting Date] >= @dateFrom AND e.[Posting Date] < DATEADD(day,1,@dateTo) THEN e.[Credit Amount] ELSE 0 END), 0) <> 0
        OR ISNULL(SUM(CASE WHEN e.[Posting Date] < DATEADD(day,1,@dateTo) THEN e.[Amount] ELSE 0 END), 0) <> 0
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

// ── Warehouse-backed Trial Balance (fast path) ───────────────────────────────
// Reads pre-aggregated per-account/month balances from FCLWHS.FACT_GL_MONTHLY
// instead of scanning the ~111M-row live G_L Entry. Month resolution: the period
// is [month(dateFrom) .. month(dateTo)]; opening is everything in earlier months.
// Data is as-of the last 2-hourly refresh (GLM_Watermark.RefreshedAt).

const monthStartStr = (d) => {
  const x = new Date(d);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

/** Build a parameterised Company IN (...) clause on a whs request. */
function whsCompanyIn(req, companies) {
  return resolveCompanies(companies).map((c, i) => { req.input(`co${i}`, whsSql.NVarChar(10), c); return `@co${i}`; }).join(',');
}

/** True only when every requested company has a completed refresh (watermark stamped). */
export async function isGlMonthlyBuilt(companies) {
  const resolved = resolveCompanies(companies);
  try {
    const pool = await whsDb.getPool();
    const req  = pool.request();
    const inList = whsCompanyIn(req, resolved);
    const r = await req.query(`SELECT COUNT(*) AS n FROM ${GL_WATERMARK_TABLE} WHERE Company IN (${inList}) AND RefreshedAt IS NOT NULL`);
    return (r.recordset[0]?.n || 0) >= resolved.length;
  } catch { return false; }   // table/pool missing → not built → caller falls back to live
}

/** Oldest refresh time across the requested companies (the TB "as of" instant). */
export async function getGlMonthlyAsOf(companies) {
  try {
    const pool = await whsDb.getPool();
    const req  = pool.request();
    const inList = whsCompanyIn(req, companies);
    const r = await req.query(`SELECT MIN(RefreshedAt) AS asOf FROM ${GL_WATERMARK_TABLE} WHERE Company IN (${inList})`);
    return r.recordset[0]?.asOf || null;
  } catch { return null; }
}

const addDaysStr   = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n);   return d.toISOString().slice(0, 10); };
const addMonthsStr = (s, n) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

/** Live per-account Debit/Credit/Net from G/L Entry for [from, toExcl) — partial-month edges only. */
async function liveGlByAccount(companies, from, toExcl) {
  const blocks = resolveCompanies(companies).map((c) => `
    SELECT '${c}' AS Company, e.[G_L Account No_] AS AccountNo,
      MAX(RTRIM(a.[Name])) AS AccountName, MAX(a.[Account Type]) AS AccountType,
      MAX(a.[Account Category]) AS AccountCategory, MAX(a.[Income_Balance]) AS IncomeBalance,
      SUM(e.[Debit Amount]) AS Dr, SUM(e.[Credit Amount]) AS Cr, SUM(e.[Amount]) AS Net
    FROM ${bcTable(c, 'G_L Entry')} e
    INNER JOIN ${bcTable(c, 'G_L Account')} a ON a.[No_] = e.[G_L Account No_]
    WHERE e.[Posting Date] >= @from AND e.[Posting Date] < @toExcl AND a.[Account Type] = 0
    GROUP BY e.[G_L Account No_]`);
  const { recordset } = await queryBc(blocks.join('\nUNION ALL\n'), {
    from:   { type: bcSql.Date, value: new Date(from) },
    toExcl: { type: bcSql.Date, value: new Date(toExcl) },
  });
  return recordset;
}

/**
 * Trial Balance from the warehouse FACT (drop-in shape for getTrialBalance):
 * one row per (Company, AccountNo) with OpeningBalance, PeriodDebit,
 * PeriodCredit, ClosingBalance. Sums over global dimensions within each account.
 * The FACT is month-grain, so only whole calendar months inside the range come
 * from it; a partial first/last month (and the days of the first month before
 * dateFrom, which belong to the opening) are summed live from G/L Entry.
 */
export async function getTrialBalanceFast({ companies, dateFrom, dateTo }) {
  const startMonth = monthStartStr(dateFrom);
  const endMonth   = monthStartStr(dateTo);
  const dayAfterTo = addDaysStr(dateTo, 1);
  const headWhole  = dateFrom === startMonth;                   // starts on the 1st
  const tailWhole  = dayAfterTo === addMonthsStr(endMonth, 1);  // ends on a month end

  // Whole months served by the FACT: [factFrom .. factTo] (month starts, inclusive).
  let factFrom = headWhole ? startMonth : addMonthsStr(startMonth, 1);
  let factTo   = tailWhole ? endMonth   : addMonthsStr(endMonth, -1);
  const livePeriod = [];
  if (factFrom > factTo) {            // no whole month inside → the whole period is live
    livePeriod.push([dateFrom, dayAfterTo]);
    factFrom = factTo = null;
  } else {
    if (!headWhole) livePeriod.push([dateFrom, factFrom]);
    if (!tailWhole) livePeriod.push([endMonth, dayAfterTo]);
  }
  const liveOpening = headWhole ? null : [startMonth, dateFrom];

  const pool = await whsDb.getPool();
  const req  = pool.request()
    .input('startMonth', whsSql.Date, startMonth)
    .input('endMonth',   whsSql.Date, endMonth)
    .input('factFrom',   whsSql.Date, factFrom)
    .input('factTo',     whsSql.Date, factTo);
  const inList = whsCompanyIn(req, companies);
  const [fact, openGap, ...periodGaps] = await Promise.all([
    req.query(`
      SELECT
        Company, AccountNo,
        MAX(AccountName)     AS AccountName,
        MAX(AccountType)     AS AccountType,
        MAX(AccountCategory) AS AccountCategory,
        MAX(IncomeBalance)   AS IncomeBalance,
        ISNULL(SUM(CASE WHEN MonthStart <  @startMonth                     THEN NetAmount    ELSE 0 END), 0) AS OpeningBalance,
        ISNULL(SUM(CASE WHEN MonthStart BETWEEN @factFrom AND @factTo      THEN PeriodDebit  ELSE 0 END), 0) AS PeriodDebit,
        ISNULL(SUM(CASE WHEN MonthStart BETWEEN @factFrom AND @factTo      THEN PeriodCredit ELSE 0 END), 0) AS PeriodCredit
      FROM ${GL_MONTHLY_TABLE}
      WHERE Company IN (${inList}) AND MonthStart <= @endMonth
      GROUP BY Company, AccountNo
    `).then((r) => r.recordset),
    liveOpening ? liveGlByAccount(companies, ...liveOpening) : [],
    ...livePeriod.map(([from, toExcl]) => liveGlByAccount(companies, from, toExcl)),
  ]);

  const rows = new Map();
  const rowFor = (r) => {
    const key = `${r.Company}|${r.AccountNo}`;
    if (!rows.has(key)) rows.set(key, {
      Company: r.Company, AccountNo: r.AccountNo, AccountName: r.AccountName, AccountType: r.AccountType,
      AccountCategory: r.AccountCategory, IncomeBalance: r.IncomeBalance,
      OpeningBalance: 0, PeriodDebit: 0, PeriodCredit: 0,
    });
    return rows.get(key);
  };
  for (const r of fact) {
    const row = rowFor(r);
    row.OpeningBalance += Number(r.OpeningBalance) || 0;
    row.PeriodDebit    += Number(r.PeriodDebit)    || 0;
    row.PeriodCredit   += Number(r.PeriodCredit)   || 0;
  }
  for (const r of openGap) rowFor(r).OpeningBalance += Number(r.Net) || 0;
  for (const gap of periodGaps) for (const r of gap) {
    const row = rowFor(r);
    row.PeriodDebit  += Number(r.Dr) || 0;
    row.PeriodCredit += Number(r.Cr) || 0;
  }

  return [...rows.values()]
    .map((r) => ({
      ...r,
      OpeningBalance: round2(r.OpeningBalance),
      PeriodDebit:    round2(r.PeriodDebit),
      PeriodCredit:   round2(r.PeriodCredit),
      ClosingBalance: round2(r.OpeningBalance + r.PeriodDebit - r.PeriodCredit),
    }))
    .filter((r) => r.PeriodDebit !== 0 || r.PeriodCredit !== 0 || r.ClosingBalance !== 0)
    .sort((a, b) => a.AccountNo.localeCompare(b.AccountNo) || a.Company.localeCompare(b.Company));
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
        ISNULL(SUM(CASE WHEN e.[Posting Date] >= @dateFrom AND e.[Posting Date] < DATEADD(day,1,@dateTo) THEN e.[Amount] ELSE 0 END), 0) AS PeriodAmount,
        ISNULL(SUM(CASE WHEN e.[Posting Date] >= @ytdFrom  AND e.[Posting Date] < DATEADD(day,1,@dateTo) THEN e.[Amount] ELSE 0 END), 0) AS YtdAmount
      FROM ${acct} a
      LEFT JOIN ${entry} e ON e.[G_L Account No_] = a.[No_]
      WHERE a.[Account Type] = 0 AND a.[Income_Balance] = 0 AND a.[Blocked] = 0
        AND a.[Account Category] IN (4, 5, 6, 7)
      GROUP BY a.[No_], a.[Name], a.[Account Category]
      HAVING
        ISNULL(SUM(CASE WHEN e.[Posting Date] >= @dateFrom AND e.[Posting Date] < DATEADD(day,1,@dateTo) THEN e.[Amount] ELSE 0 END), 0) <> 0
        OR ISNULL(SUM(CASE WHEN e.[Posting Date] >= @ytdFrom  AND e.[Posting Date] < DATEADD(day,1,@dateTo) THEN e.[Amount] ELSE 0 END), 0) <> 0
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
export async function computePlStatement({ company, dateFrom, dateTo, ytdFrom }) {
  const end=new Date(dateTo);
  if(!ytdFrom)ytdFrom=`${end.getUTCFullYear()-(end.getUTCMonth()<3?1:0)}-04-01`;
  for(const date of [dateFrom,dateTo,ytdFrom])if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Enter valid report dates');
  if(dateFrom>dateTo||ytdFrom>dateTo)throw new Error('Period and YTD start must not be after the end date');
  const period=await computePlPeriod({company,dateFrom,dateTo});
  const ytd=dateFrom===ytdFrom?period:await computePlPeriod({company,dateFrom:ytdFrom,dateTo});
  return {...period,ytdFrom,rows:period.rows.map(row=>{
    const yr=ytd.rows.find(r=>r.key===row.key);
    const accounts=new Map((row.accounts||[]).map(a=>[a.accountNo,{...a,ytdAmount:0}]));
    for(const a of yr?.accounts||[]){const existing=accounts.get(a.accountNo)||{...a,amount:0};accounts.set(a.accountNo,{...existing,ytdAmount:a.amount})}
    return {...row,ytdAmount:yr?.amount||0,accounts:row.kind==='accounts'?[...accounts.values()].sort((a,b)=>a.accountNo.localeCompare(b.accountNo)):undefined};
  }),ytdOverlaps:ytd.overlaps,ytdUnmapped:ytd.unmapped};
}
async function computePlPeriod({ company, dateFrom, dateTo }) {
  const co = String(company || '').toUpperCase();
  const def = await getPlDefinition(co);
  const entry = bcTable(co, 'G_L Entry');
  const acct  = bcTable(co, 'G_L Account');
  const { recordset } = await queryBc(
    `SELECT e.[G_L Account No_] AS AccountNo, MAX(RTRIM(a.[Name])) AS AccountName, SUM(e.[Amount]) AS Amount
     FROM ${entry} e
     LEFT JOIN ${acct} a ON a.[No_] = e.[G_L Account No_]
     WHERE e.[Posting Date] >= @dateFrom AND e.[Posting Date] < DATEADD(day,1,@dateTo)
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
        members.push({ accountNo: a.no, name: a.name, amount: round2(a.amt) });
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
        ISNULL(SUM(CASE WHEN e.[Posting Date] < DATEADD(day,1,@dateTo) THEN e.[Amount] ELSE 0 END), 0) AS Balance
      FROM ${acct} a
      LEFT JOIN ${entry} e ON e.[G_L Account No_] = a.[No_]
      WHERE a.[Account Type] = 0 AND a.[Income_Balance] = 1 AND a.[Blocked] = 0
        AND a.[Account Category] IN (1, 2, 3)
      GROUP BY a.[No_], a.[Name], a.[Account Category]
      HAVING ISNULL(SUM(CASE WHEN e.[Posting Date] < DATEADD(day,1,@dateTo) THEN e.[Amount] ELSE 0 END), 0) <> 0
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
