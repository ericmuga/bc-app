/**
 * models/ArRecon.js
 * Receivables reconciliation: customer sub-ledger (Detailed Cust. Ledg. Entry)
 * vs the G/L receivables (control) accounts, live from BC.
 *
 * The control account for a customer entry is the Receivables Account of the
 * Customer Posting Group stamped on its Cust. Ledger Entry (BC keeps no G/L
 * account on the sub-ledger). Sub-ledger amounts are Amount (LCY) — the G/L is
 * always in LCY.
 *
 * Sub-ledger and G/L meet on [Transaction No_]: every posting stamps the same
 * transaction no. on its customer and G/L entries, so the transaction is the
 * one-to-one grain. A transaction whose G/L amount on the account differs from
 * its sub-ledger amount (for that account's posting groups) is a reconciling
 * item:
 *   GL only         – posted straight to the control account (journals), no
 *                     customer entry behind it.
 *   Subledger only  – customer entries with no G/L on the account, e.g. an
 *                     application across posting groups (LOCAL invoice closed
 *                     by an EXPORT payment) that moves balance between
 *                     sub-ledger groups without a G/L transfer.
 *   Amount differs  – both sides present, amounts disagree.
 */
import { bcDb, bcSql as sql } from '../db/bcPool.js';
import { bcTable, ALL_COMPANIES } from '../services/bcTables.js';
import logger from '../services/logger.js';

export const DCLE_ENTRY_TYPES = {
  0: '(blank)', 1: 'Initial Entry', 2: 'Application', 3: 'Unrealized Loss', 4: 'Unrealized Gain',
  5: 'Realized Loss', 6: 'Realized Gain', 7: 'Payment Discount', 8: 'Payment Discount (VAT Excl.)',
  9: 'Payment Discount (VAT Adjustment)', 10: 'Appln. Rounding', 11: 'Correction of Remaining Amount',
  12: 'Payment Tolerance', 13: 'Payment Discount Tolerance', 14: 'Payment Tolerance (VAT Excl.)',
  15: 'Payment Tolerance (VAT Adjustment)', 16: 'Payment Discount Tolerance (VAT Excl.)',
  17: 'Payment Discount Tolerance (VAT Adjustment)',
};
export const GL_SOURCE_TYPES = {
  0: '', 1: 'Customer', 2: 'Vendor', 3: 'Bank Account', 4: 'Fixed Asset', 5: 'IC Partner', 6: 'Employee',
};

const ITEM_CAP = 2000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function tables(company) {
  if (!ALL_COMPANIES.includes(company)) throw new Error(`Unknown company: ${company}`);
  return {
    gl:   bcTable(company, 'G_L Entry'),
    acct: bcTable(company, 'G_L Account'),
    dcle: bcTable(company, 'Detailed Cust_ Ledg_ Entry'),
    cle:  bcTable(company, 'Cust_ Ledger Entry'),
    cpg:  bcTable(company, 'Customer Posting Group'),
    cust: bcTable(company, 'Customer'),
  };
}

function dayAfter(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

async function run(context, querySql, inputs) {
  const pool = await bcDb.getPool();
  const req = pool.request();
  for (const [name, [type, value]] of Object.entries(inputs)) req.input(name, type, value);
  const t0 = Date.now();
  const result = await req.query(querySql);
  logger.info('ar-recon query', { ...context, ms: Date.now() - t0 });
  return result;
}

/** Receivables accounts of a company with the posting groups that post to each. */
export async function receivablesAccounts(company) {
  const t = tables(company);
  const { recordset } = await run({ fn: 'accounts', company }, `
    SELECT p.[Receivables Account] AS AccountNo, MAX(RTRIM(a.[Name])) AS AccountName, p.[Code] AS PostingGroup
    FROM ${t.cpg} p LEFT JOIN ${t.acct} a ON a.[No_] = p.[Receivables Account]
    WHERE NULLIF(p.[Receivables Account], '') IS NOT NULL
    GROUP BY p.[Receivables Account], p.[Code]
    ORDER BY p.[Receivables Account], p.[Code]`, {});
  const map = new Map();
  for (const r of recordset) {
    if (!map.has(r.AccountNo)) map.set(r.AccountNo, { AccountNo: r.AccountNo, AccountName: r.AccountName || '', PostingGroups: [] });
    map.get(r.AccountNo).PostingGroups.push(r.PostingGroup);
  }
  return [...map.values()];
}

/**
 * One row per receivables account: G/L vs sub-ledger opening (before dateFrom),
 * movement (dateFrom..dateTo) and closing (to dateTo), plus the period's
 * non-customer G/L postings and cross-group application movement.
 */
export async function summary({ company, dateFrom, dateTo }) {
  const t = tables(company);
  const accounts = await receivablesAccounts(company);
  const { recordset } = await run({ fn: 'summary', company, dateFrom, dateTo }, `
    WITH cpg AS (
      SELECT [Code], [Receivables Account] AS Acct FROM ${t.cpg} WHERE NULLIF([Receivables Account], '') IS NOT NULL
    ), sub AS (
      SELECT cpg.Acct,
        SUM(CASE WHEN d.[Posting Date] <  @from THEN d.[Amount (LCY)] ELSE 0 END) AS SubOpening,
        SUM(CASE WHEN d.[Posting Date] >= @from THEN d.[Amount (LCY)] ELSE 0 END) AS SubMovement,
        SUM(CASE WHEN d.[Posting Date] >= @from AND d.[Entry Type] = 2 THEN d.[Amount (LCY)] ELSE 0 END) AS SubApplMovement
      FROM ${t.dcle} d
      JOIN ${t.cle} c ON c.[Entry No_] = d.[Cust_ Ledger Entry No_]
      JOIN cpg ON cpg.[Code] = c.[Customer Posting Group]
      WHERE d.[Posting Date] < @toExcl
      GROUP BY cpg.Acct
    ), gl AS (
      SELECT e.[G_L Account No_] AS Acct,
        SUM(CASE WHEN e.[Posting Date] <  @from THEN e.[Amount] ELSE 0 END) AS GlOpening,
        SUM(CASE WHEN e.[Posting Date] >= @from THEN e.[Amount] ELSE 0 END) AS GlMovement,
        SUM(CASE WHEN e.[Posting Date] >= @from AND ISNULL(e.[Source Type], 0) <> 1 THEN e.[Amount] ELSE 0 END) AS GlNonCustomerMovement
      FROM ${t.gl} e
      WHERE e.[G_L Account No_] IN (SELECT Acct FROM cpg) AND e.[Posting Date] < @toExcl
      GROUP BY e.[G_L Account No_]
    )
    SELECT COALESCE(gl.Acct, sub.Acct) AS AccountNo,
      ISNULL(gl.GlOpening, 0) AS GlOpening, ISNULL(gl.GlMovement, 0) AS GlMovement,
      ISNULL(gl.GlNonCustomerMovement, 0) AS GlNonCustomerMovement,
      ISNULL(sub.SubOpening, 0) AS SubOpening, ISNULL(sub.SubMovement, 0) AS SubMovement,
      ISNULL(sub.SubApplMovement, 0) AS SubApplMovement
    FROM gl FULL JOIN sub ON sub.Acct = gl.Acct`, {
    from:   [sql.Date, new Date(dateFrom)],
    toExcl: [sql.Date, dayAfter(dateTo)],
  });

  const byAcct = new Map(recordset.map((r) => [r.AccountNo, r]));
  return accounts.map((a) => {
    const r = byAcct.get(a.AccountNo) || {};
    const glOpen = round2(r.GlOpening), glMov = round2(r.GlMovement);
    const subOpen = round2(r.SubOpening), subMov = round2(r.SubMovement);
    return {
      ...a,
      GlOpening: glOpen, SubOpening: subOpen, DiffOpening: round2(glOpen - subOpen),
      GlMovement: glMov, SubMovement: subMov, DiffMovement: round2(glMov - subMov),
      GlClosing: round2(glOpen + glMov), SubClosing: round2(subOpen + subMov),
      DiffClosing: round2(glOpen + glMov - subOpen - subMov),
      GlNonCustomerMovement: round2(r.GlNonCustomerMovement),
      SubApplMovement: round2(r.SubApplMovement),
    };
  });
}

/**
 * Drill-down for one receivables account: sub-ledger by entry type, by customer
 * (sub-ledger vs customer-sourced G/L), and the transaction-level tie-out.
 * scope 'period' ties out dateFrom..dateTo; 'all' ties out all history to dateTo
 * (explains the opening difference too).
 */
export async function detail({ company, account, dateFrom, dateTo, scope = 'period' }) {
  const t = tables(company);
  const accounts = await receivablesAccounts(company);
  const acct = accounts.find((a) => a.AccountNo === account);
  if (!acct) throw new Error(`${account} is not a receivables account for ${company}`);

  // Posting groups are BC codes (Code[20]); pass them as parameters.
  const pgInputs = Object.fromEntries(acct.PostingGroups.map((pg, i) => [`pg${i}`, [sql.NVarChar(20), pg]]));
  const pgIn = acct.PostingGroups.map((_, i) => `@pg${i}`).join(', ');
  const inputs = {
    ...pgInputs,
    acct:      [sql.NVarChar(20), account],
    from:      [sql.Date, new Date(dateFrom)],
    toExcl:    [sql.Date, dayAfter(dateTo)],
    scopeFrom: [sql.Date, scope === 'all' ? new Date('1753-01-01') : new Date(dateFrom)],
  };

  const { recordsets } = await run({ fn: 'detail', company, account, dateFrom, dateTo, scope }, `
    -- 1. Sub-ledger by entry type
    SELECT d.[Entry Type] AS EntryType,
      SUM(CASE WHEN d.[Posting Date] <  @from THEN d.[Amount (LCY)] ELSE 0 END) AS Opening,
      SUM(CASE WHEN d.[Posting Date] >= @from THEN d.[Amount (LCY)] ELSE 0 END) AS Movement
    FROM ${t.dcle} d JOIN ${t.cle} c ON c.[Entry No_] = d.[Cust_ Ledger Entry No_]
    WHERE c.[Customer Posting Group] IN (${pgIn}) AND d.[Posting Date] < @toExcl
    GROUP BY d.[Entry Type] ORDER BY d.[Entry Type];

    -- 2. By customer: sub-ledger vs customer-sourced G/L ('' = non-customer G/L)
    WITH s AS (
      SELECT d.[Customer No_] AS Cust,
        SUM(CASE WHEN d.[Posting Date] <  @from THEN d.[Amount (LCY)] ELSE 0 END) AS SubOpening,
        SUM(CASE WHEN d.[Posting Date] >= @from THEN d.[Amount (LCY)] ELSE 0 END) AS SubMovement
      FROM ${t.dcle} d JOIN ${t.cle} c ON c.[Entry No_] = d.[Cust_ Ledger Entry No_]
      WHERE c.[Customer Posting Group] IN (${pgIn}) AND d.[Posting Date] < @toExcl
      GROUP BY d.[Customer No_]
    ), g AS (
      SELECT CASE WHEN ISNULL(e.[Source Type], 0) = 1 THEN e.[Source No_] ELSE '' END AS Cust,
        SUM(CASE WHEN e.[Posting Date] <  @from THEN e.[Amount] ELSE 0 END) AS GlOpening,
        SUM(CASE WHEN e.[Posting Date] >= @from THEN e.[Amount] ELSE 0 END) AS GlMovement
      FROM ${t.gl} e
      WHERE e.[G_L Account No_] = @acct AND e.[Posting Date] < @toExcl
      GROUP BY CASE WHEN ISNULL(e.[Source Type], 0) = 1 THEN e.[Source No_] ELSE '' END
    )
    SELECT COALESCE(s.Cust, g.Cust) AS CustomerNo, RTRIM(cu.[Name]) AS CustomerName,
      ISNULL(s.SubOpening, 0) AS SubOpening, ISNULL(s.SubMovement, 0) AS SubMovement,
      ISNULL(g.GlOpening, 0) AS GlOpening, ISNULL(g.GlMovement, 0) AS GlMovement
    FROM s FULL JOIN g ON g.Cust = s.Cust
    LEFT JOIN ${t.cust} cu ON cu.[No_] = COALESCE(s.Cust, g.Cust)
    WHERE ISNULL(s.SubOpening, 0) <> 0 OR ISNULL(s.SubMovement, 0) <> 0
       OR ISNULL(g.GlOpening, 0) <> 0 OR ISNULL(g.GlMovement, 0) <> 0;

    -- 3. Transaction tie-out
    SELECT COALESCE(g.T, s.T) AS Txn, g.Gl, s.Sub,
      ISNULL(g.Gl, 0) - ISNULL(s.Sub, 0) AS Diff,
      COALESCE(g.PostingDate, s.PostingDate) AS PostingDate,
      COALESCE(g.DocNo, s.DocNo) AS DocNo,
      g.Descr, g.SourceType, g.SourceNo, g.SourceCode, g.UserId,
      s.CustomerNo, s.EntryTypes
    INTO #tie
    FROM (
      SELECT [Transaction No_] AS T, SUM([Amount]) AS Gl, MIN([Posting Date]) AS PostingDate,
        MIN([Document No_]) AS DocNo, MIN([Description]) AS Descr, MAX(ISNULL([Source Type], 0)) AS SourceType,
        MAX([Source No_]) AS SourceNo, MAX([Source Code]) AS SourceCode, MAX([User ID]) AS UserId
      FROM ${t.gl}
      WHERE [G_L Account No_] = @acct AND [Posting Date] >= @scopeFrom AND [Posting Date] < @toExcl
      GROUP BY [Transaction No_]
    ) g
    FULL JOIN (
      SELECT d.[Transaction No_] AS T, SUM(d.[Amount (LCY)]) AS Sub, MIN(d.[Posting Date]) AS PostingDate,
        MIN(d.[Document No_]) AS DocNo, MIN(d.[Customer No_]) AS CustomerNo,
        MIN(d.[Entry Type]) * 100 + MAX(d.[Entry Type]) AS EntryTypes
      FROM ${t.dcle} d JOIN ${t.cle} c ON c.[Entry No_] = d.[Cust_ Ledger Entry No_]
      WHERE c.[Customer Posting Group] IN (${pgIn}) AND d.[Posting Date] >= @scopeFrom AND d.[Posting Date] < @toExcl
      GROUP BY d.[Transaction No_]
    ) s ON s.T = g.T;

    SELECT CASE WHEN Gl IS NULL THEN 'Subledger only' WHEN Sub IS NULL THEN 'GL only'
                WHEN ABS(Diff) <= 0.005 THEN 'Matched' ELSE 'Amount differs' END AS Kind,
      COUNT(*) AS Txns, SUM(ISNULL(Gl, 0)) AS Gl, SUM(ISNULL(Sub, 0)) AS Sub, SUM(Diff) AS Diff
    FROM #tie
    GROUP BY CASE WHEN Gl IS NULL THEN 'Subledger only' WHEN Sub IS NULL THEN 'GL only'
                  WHEN ABS(Diff) <= 0.005 THEN 'Matched' ELSE 'Amount differs' END;

    -- Reconciling items, largest first. OtherGroups = posting groups outside this
    -- account touched by the same transaction (cross-group applications);
    -- OtherAccounts = other receivables accounts the transaction's G/L hit.
    SELECT TOP (${ITEM_CAP}) x.*,
      STUFF((SELECT DISTINCT ', ' + c2.[Customer Posting Group]
             FROM ${t.dcle} d2 JOIN ${t.cle} c2 ON c2.[Entry No_] = d2.[Cust_ Ledger Entry No_]
             WHERE d2.[Transaction No_] = x.Txn AND c2.[Customer Posting Group] NOT IN (${pgIn})
             FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 2, '') AS OtherGroups,
      STUFF((SELECT DISTINCT ', ' + e2.[G_L Account No_]
             FROM ${t.gl} e2
             WHERE e2.[Transaction No_] = x.Txn AND e2.[G_L Account No_] <> @acct
               AND e2.[G_L Account No_] IN (SELECT [Receivables Account] FROM ${t.cpg})
             FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 2, '') AS OtherAccounts
    FROM #tie x
    WHERE ABS(x.Diff) > 0.005
    ORDER BY ABS(x.Diff) DESC;

    SELECT COUNT(*) AS ItemCount FROM #tie WHERE ABS(Diff) > 0.005;
    DROP TABLE #tie;`, inputs);

  const [entryTypeRows, customerRows, kindRows, itemRows, countRows] = recordsets;

  const entryTypes = entryTypeRows.map((r) => ({
    EntryType: r.EntryType,
    EntryTypeName: DCLE_ENTRY_TYPES[r.EntryType] ?? `Type ${r.EntryType}`,
    Opening: round2(r.Opening), Movement: round2(r.Movement), Closing: round2(Number(r.Opening) + Number(r.Movement)),
  }));

  const customers = customerRows.map((r) => {
    const subOpen = round2(r.SubOpening), subMov = round2(r.SubMovement);
    const glOpen = round2(r.GlOpening), glMov = round2(r.GlMovement);
    return {
      CustomerNo: r.CustomerNo || '',
      CustomerName: r.CustomerNo ? (r.CustomerName || '') : 'Non-customer G/L postings',
      SubOpening: subOpen, GlOpening: glOpen,
      SubMovement: subMov, GlMovement: glMov,
      SubClosing: round2(subOpen + subMov), GlClosing: round2(glOpen + glMov),
      DiffClosing: round2(glOpen + glMov - subOpen - subMov),
    };
  }).sort((a, b) => Math.abs(b.DiffClosing) - Math.abs(a.DiffClosing) || a.CustomerNo.localeCompare(b.CustomerNo));

  const tieOut = kindRows.map((r) => ({
    Kind: r.Kind, Txns: r.Txns, Gl: round2(r.Gl), Sub: round2(r.Sub), Diff: round2(r.Diff),
  }));

  const items = itemRows.map((r) => {
    const lo = r.EntryTypes == null ? null : Math.floor(r.EntryTypes / 100);
    const hi = r.EntryTypes == null ? null : r.EntryTypes % 100;
    return {
      Kind: r.Gl == null ? 'Subledger only' : r.Sub == null ? 'GL only' : 'Amount differs',
      Txn: r.Txn,
      PostingDate: r.PostingDate,
      InPeriod: new Date(r.PostingDate) >= new Date(dateFrom),
      DocNo: r.DocNo || '',
      Description: r.Descr || '',
      Gl: round2(r.Gl), Sub: round2(r.Sub), Diff: round2(r.Diff),
      SourceType: r.SourceType == null ? '' : (GL_SOURCE_TYPES[r.SourceType] ?? String(r.SourceType)),
      SourceNo: r.SourceNo || '', SourceCode: r.SourceCode || '', UserId: r.UserId || '',
      CustomerNo: r.CustomerNo || '',
      EntryTypes: lo == null ? '' : [...new Set([lo, hi])].map((n) => DCLE_ENTRY_TYPES[n] ?? n).join(' / '),
      OtherGroups: r.OtherGroups || '',
      OtherAccounts: r.OtherAccounts || '',
    };
  });

  return {
    company, account: acct, dateFrom, dateTo, scope,
    entryTypes, customers, tieOut, items,
    itemCount: countRows[0]?.ItemCount || 0, itemCap: ITEM_CAP,
  };
}
