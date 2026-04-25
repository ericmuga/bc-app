/**
 * db/seed-mgmt.js
 * Seeds the Management Accounts engine with a "Consolidated P&L" template.
 *
 * Run: node src/db/seed-mgmt.js
 *
 * What it creates:
 *   1 Template  – Consolidated P&L
 *   4 Measures  – MTD, YTD, LMTD, LYTD (each with a full SqlQuery)
 *   ~15 Lines   – heading / data / spacer / subtotal rows covering a standard P&L
 *
 * Safe to re-run: skips insert if template name already exists.
 */

import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

// ── Pool config (mirrors pool.js but standalone) ─────────────────────────────
const config = {
  server:   process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME || 'BCApp',
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt:                process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    enableArithAbort:       true,
  },
};

// ── Measure SQL template ──────────────────────────────────────────────────────
// {GL_ENTRY} is replaced at runtime with the company-specific table name.
// Parameters: @ReferenceDate DATE, @Dim1Code NVARCHAR(500), @Dim2Code NVARCHAR(500)
// Returns:    AccountNo NVARCHAR(20), Amount DECIMAL

const MTD_SQL = `
SELECT
  RTRIM([G_L Account No_]) AS AccountNo,
  SUM([Amount])            AS Amount
FROM {GL_ENTRY}
WHERE
  [Posting Date] >= DATEFROMPARTS(YEAR(@ReferenceDate), MONTH(@ReferenceDate), 1)
  AND [Posting Date] <= EOMONTH(@ReferenceDate)
  AND (@Dim1Code = '' OR [Global Dimension 1 Code] IN (SELECT TRIM([value]) FROM STRING_SPLIT(@Dim1Code, ',')))
  AND (@Dim2Code = '' OR [Global Dimension 2 Code] IN (SELECT TRIM([value]) FROM STRING_SPLIT(@Dim2Code, ',')))
GROUP BY RTRIM([G_L Account No_])
`.trim();

const YTD_SQL = `
SELECT
  RTRIM([G_L Account No_]) AS AccountNo,
  SUM([Amount])            AS Amount
FROM {GL_ENTRY}
WHERE
  [Posting Date] >= DATEFROMPARTS(
    CASE WHEN MONTH(@ReferenceDate) < 4 THEN YEAR(@ReferenceDate) - 1 ELSE YEAR(@ReferenceDate) END,
    4, 1
  )
  AND [Posting Date] <= EOMONTH(@ReferenceDate)
  AND (@Dim1Code = '' OR [Global Dimension 1 Code] IN (SELECT TRIM([value]) FROM STRING_SPLIT(@Dim1Code, ',')))
  AND (@Dim2Code = '' OR [Global Dimension 2 Code] IN (SELECT TRIM([value]) FROM STRING_SPLIT(@Dim2Code, ',')))
GROUP BY RTRIM([G_L Account No_])
`.trim();

const LMTD_SQL = `
SELECT
  RTRIM([G_L Account No_]) AS AccountNo,
  SUM([Amount])            AS Amount
FROM {GL_ENTRY}
WHERE
  [Posting Date] >= DATEFROMPARTS(YEAR(DATEADD(MONTH,-1,@ReferenceDate)), MONTH(DATEADD(MONTH,-1,@ReferenceDate)), 1)
  AND [Posting Date] <= EOMONTH(DATEADD(MONTH,-1,@ReferenceDate))
  AND (@Dim1Code = '' OR [Global Dimension 1 Code] IN (SELECT TRIM([value]) FROM STRING_SPLIT(@Dim1Code, ',')))
  AND (@Dim2Code = '' OR [Global Dimension 2 Code] IN (SELECT TRIM([value]) FROM STRING_SPLIT(@Dim2Code, ',')))
GROUP BY RTRIM([G_L Account No_])
`.trim();

const LYTD_SQL = `
SELECT
  RTRIM([G_L Account No_]) AS AccountNo,
  SUM([Amount])            AS Amount
FROM {GL_ENTRY}
WHERE
  [Posting Date] >= DATEFROMPARTS(
    CASE WHEN MONTH(DATEADD(YEAR,-1,@ReferenceDate)) < 4
         THEN YEAR(DATEADD(YEAR,-1,@ReferenceDate)) - 1
         ELSE YEAR(DATEADD(YEAR,-1,@ReferenceDate)) END,
    4, 1
  )
  AND [Posting Date] <= EOMONTH(DATEADD(YEAR,-1,@ReferenceDate))
  AND (@Dim1Code = '' OR [Global Dimension 1 Code] IN (SELECT TRIM([value]) FROM STRING_SPLIT(@Dim1Code, ',')))
  AND (@Dim2Code = '' OR [Global Dimension 2 Code] IN (SELECT TRIM([value]) FROM STRING_SPLIT(@Dim2Code, ',')))
GROUP BY RTRIM([G_L Account No_])
`.trim();

// ── Formula convention ────────────────────────────────────────────────────────
// ALL_ means "sum across all companies (FCL, CM, FLM, RMK)".
// The engine expands ALL_X:Y → FCL_X:Y + CM_X:Y + FLM_X:Y + RMK_X:Y.
// All P&L DATA lines use IsNegated=1:
//   Revenue accounts → credit (negative in GL) → negated → positive on report.
//   Cost/Expense accounts → debit (positive in GL) → negated → negative on report.
// Subtotals (IsBold=1, LineType='subtotal') sum the signed line values above.

// ── Line definitions ──────────────────────────────────────────────────────────
// Adjust account ranges to match your actual chart of accounts.
const LINES = [
  // ── Revenue ──────────────────────────────────────────────────────────────
  { code: 'HDR_REV',   label: 'Revenue',                    type: 'heading',  bold: true,  neg: false, sort: 10,  formula: '' },
  { code: 'REV_SALES', label: 'Sales Revenue',              type: 'data',     bold: false, neg: true,  sort: 20,  formula: 'ALL_40000:44999' },
  { code: 'REV_OTH',  label: 'Other Income',                type: 'data',     bold: false, neg: true,  sort: 30,  formula: 'ALL_45000:49999' },
  { code: 'SUB_REV',  label: 'Total Revenue',               type: 'subtotal', bold: true,  neg: false, sort: 40,  formula: '', subtotalOf: 'HDR_REV', indent: 0 },
  { code: 'SPC_1',    label: '',                            type: 'spacer',   bold: false, neg: false, sort: 50,  formula: '' },

  // ── Cost of Sales ─────────────────────────────────────────────────────────
  { code: 'HDR_COS',  label: 'Cost of Sales',               type: 'heading',  bold: true,  neg: false, sort: 60,  formula: '' },
  { code: 'COS_MAT',  label: 'Raw Materials / Purchases',   type: 'data',     bold: false, neg: true,  sort: 70,  formula: 'ALL_50000:52999' },
  { code: 'COS_LAB',  label: 'Direct Labour',               type: 'data',     bold: false, neg: true,  sort: 80,  formula: 'ALL_53000:54999' },
  { code: 'COS_OVH',  label: 'Manufacturing Overhead',      type: 'data',     bold: false, neg: true,  sort: 90,  formula: 'ALL_55000:59999' },
  { code: 'SUB_COS',  label: 'Total Cost of Sales',         type: 'subtotal', bold: true,  neg: false, sort: 100, formula: '', subtotalOf: 'HDR_COS', indent: 0 },
  { code: 'SPC_2',    label: '',                            type: 'spacer',   bold: false, neg: false, sort: 110, formula: '' },

  // ── Gross Profit ──────────────────────────────────────────────────────────
  { code: 'SUB_GP',   label: 'Gross Profit',                type: 'subtotal', bold: true,  neg: false, sort: 120, formula: '', subtotalOf: 'HDR_REV,HDR_COS', indent: 0 },
  { code: 'SPC_3',    label: '',                            type: 'spacer',   bold: false, neg: false, sort: 130, formula: '' },

  // ── Operating Expenses ────────────────────────────────────────────────────
  { code: 'HDR_OPX',  label: 'Operating Expenses',          type: 'heading',  bold: true,  neg: false, sort: 140, formula: '' },
  { code: 'OPX_SEL',  label: 'Selling & Distribution',      type: 'data',     bold: false, neg: true,  sort: 150, formula: 'ALL_60000:64999' },
  { code: 'OPX_MKT',  label: 'Marketing & Promotions',      type: 'data',     bold: false, neg: true,  sort: 160, formula: 'ALL_65000:66999' },
  { code: 'OPX_ADM',  label: 'General & Administration',    type: 'data',     bold: false, neg: true,  sort: 170, formula: 'ALL_70000:74999' },
  { code: 'OPX_HR',   label: 'Staff Costs',                 type: 'data',     bold: false, neg: true,  sort: 180, formula: 'ALL_75000:77999' },
  { code: 'OPX_DEP',  label: 'Depreciation & Amortisation', type: 'data',     bold: false, neg: true,  sort: 190, formula: 'ALL_78000:79999' },
  { code: 'SUB_OPX',  label: 'Total Operating Expenses',    type: 'subtotal', bold: true,  neg: false, sort: 200, formula: '', subtotalOf: 'HDR_OPX', indent: 0 },
  { code: 'SPC_4',    label: '',                            type: 'spacer',   bold: false, neg: false, sort: 210, formula: '' },

  // ── EBITDA / Operating Profit ─────────────────────────────────────────────
  { code: 'SUB_EBIT', label: 'Operating Profit (EBIT)',      type: 'subtotal', bold: true,  neg: false, sort: 220, formula: '', subtotalOf: 'HDR_REV,HDR_COS,HDR_OPX', indent: 0 },
  { code: 'SPC_5',    label: '',                            type: 'spacer',   bold: false, neg: false, sort: 230, formula: '' },

  // ── Finance Costs ─────────────────────────────────────────────────────────
  { code: 'HDR_FIN',  label: 'Finance Costs',               type: 'heading',  bold: true,  neg: false, sort: 240, formula: '' },
  { code: 'FIN_INT',  label: 'Interest Expense',            type: 'data',     bold: false, neg: true,  sort: 250, formula: 'ALL_80000:84999' },
  { code: 'FIN_BNK',  label: 'Bank Charges & Forex',        type: 'data',     bold: false, neg: true,  sort: 260, formula: 'ALL_85000:89999' },
  { code: 'SUB_FIN',  label: 'Total Finance Costs',         type: 'subtotal', bold: true,  neg: false, sort: 270, formula: '', subtotalOf: 'HDR_FIN', indent: 0 },
  { code: 'SPC_6',    label: '',                            type: 'spacer',   bold: false, neg: false, sort: 280, formula: '' },

  // ── Net Profit ────────────────────────────────────────────────────────────
  { code: 'SUB_NET',  label: 'Net Profit Before Tax',       type: 'subtotal', bold: true,  neg: false, sort: 290, formula: '', subtotalOf: 'HDR_REV,HDR_COS,HDR_OPX,HDR_FIN', indent: 0 },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function seed() {
  const pool = await new sql.ConnectionPool(config).connect();
  console.log('Connected to', config.database);

  try {
    // ── Guard: skip if template already exists ──────────────────────────────
    const existing = await pool.request()
      .input('name', sql.NVarChar(200), 'Consolidated P&L')
      .query(`SELECT [TemplateId] FROM [dbo].[MgmtTemplate] WHERE [TemplateName] = @name`);

    if (existing.recordset.length > 0) {
      console.log('Template "Consolidated P&L" already exists – skipping seed.');
      console.log('  TemplateId:', existing.recordset[0].TemplateId);
      return;
    }

    // ── 1. Insert template ──────────────────────────────────────────────────
    const tplRes = await pool.request()
      .input('name', sql.NVarChar(200), 'Consolidated P&L')
      .input('desc', sql.NVarChar(500), 'Group-level income statement across all entities. Adjust account ranges in each line formula to match your chart of accounts.')
      .input('sort', sql.Int, 10)
      .query(`INSERT INTO [dbo].[MgmtTemplate]([TemplateName],[Description],[SortOrder])
              OUTPUT INSERTED.[TemplateId]
              VALUES(@name,@desc,@sort)`);
    const templateId = tplRes.recordset[0].TemplateId;
    console.log('Created template:', templateId);

    // ── 2. Insert measures ──────────────────────────────────────────────────
    const measures = [
      { code: 'MTD',  label: 'Month to Date',        sql: MTD_SQL,  sort: 10 },
      { code: 'YTD',  label: 'Year to Date',         sql: YTD_SQL,  sort: 20 },
      { code: 'LMTD', label: 'Last Month (MTD)',      sql: LMTD_SQL, sort: 30 },
      { code: 'LYTD', label: 'Last Year to Date',    sql: LYTD_SQL, sort: 40 },
    ];

    for (const m of measures) {
      const r = await pool.request()
        .input('templateId',    sql.UniqueIdentifier,  templateId)
        .input('measureCode',   sql.NVarChar(50),      m.code)
        .input('measureLabel',  sql.NVarChar(200),     m.label)
        .input('dateMode',      sql.NVarChar(20),      m.code)   // kept for legacy fallback
        .input('customDateFrom',sql.Date,              null)
        .input('customDateTo',  sql.Date,              null)
        .input('sqlQuery',      sql.NVarChar(sql.MAX), m.sql)
        .input('sortOrder',     sql.Int,               m.sort)
        .query(`INSERT INTO [dbo].[MgmtMeasure]
                  ([TemplateId],[MeasureCode],[MeasureLabel],[DateMode],[CustomDateFrom],[CustomDateTo],[SqlQuery],[SortOrder])
                OUTPUT INSERTED.[MeasureId]
                VALUES(@templateId,@measureCode,@measureLabel,@dateMode,@customDateFrom,@customDateTo,@sqlQuery,@sortOrder)`);
      console.log(`  Measure ${m.code} →`, r.recordset[0].MeasureId);
    }

    // ── 3. Insert lines ─────────────────────────────────────────────────────
    // First pass: insert all lines and capture the lineCode → lineId map.
    const lineIdMap = {};

    for (const ln of LINES) {
      const r = await pool.request()
        .input('templateId',      sql.UniqueIdentifier,  templateId)
        .input('lineCode',        sql.NVarChar(50),      ln.code)
        .input('lineLabel',       sql.NVarChar(200),     ln.label)
        .input('lineType',        sql.NVarChar(20),      ln.type)
        .input('subtotalOf',      sql.NVarChar(500),     ln.subtotalOf || null)
        .input('indentLevel',     sql.Int,               ln.indent ?? 0)
        .input('isBold',          sql.Bit,               ln.bold ? 1 : 0)
        .input('isNegated',       sql.Bit,               ln.neg  ? 1 : 0)
        .input('sortOrder',       sql.Int,               ln.sort)
        .input('formula',         sql.NVarChar(sql.MAX), ln.formula || null)
        .input('enabledMeasures', sql.NVarChar(1000),    null)
        .query(`INSERT INTO [dbo].[MgmtLine]
                  ([TemplateId],[LineCode],[LineLabel],[LineType],[SubtotalOf],[IndentLevel],
                   [IsBold],[IsNegated],[SortOrder],[Formula],[EnabledMeasures])
                OUTPUT INSERTED.[LineId]
                VALUES(@templateId,@lineCode,@lineLabel,@lineType,@subtotalOf,@indentLevel,
                       @isBold,@isNegated,@sortOrder,@formula,@enabledMeasures)`);
      const lineId = r.recordset[0].LineId;
      lineIdMap[ln.code] = lineId;
      console.log(`  Line ${ln.code.padEnd(12)} [${ln.type.padEnd(8)}] →`, lineId);
    }

    console.log('\nSeed complete.');
    console.log('Next steps:');
    console.log('  1. Open Admin Setup → Management Account Builder → Consolidated P&L');
    console.log('  2. Check each data line formula against your actual GL account ranges.');
    console.log('  3. Run the discovery queries in seed-mgmt.js comments against your BC DB.');

  } finally {
    await pool.close();
  }
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

/*
 ═══════════════════════════════════════════════════════════════════════════════
  BC DATABASE DISCOVERY QUERIES
  Run these against your BC database (the one bcPool connects to) to understand
  your chart of accounts and set meaningful account ranges in the line formulas.
 ═══════════════════════════════════════════════════════════════════════════════

 ── 1. Survey all posting accounts across companies ───────────────────────────
  Replace the table names with your company-specific GL Account tables.
  Pattern: [dbo].[{PREFIX}$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972]

  SELECT
    'FCL'                       AS Company,
    RTRIM([No_])                AS AccountNo,
    RTRIM([Name])               AS AccountName,
    [Account Type]              AS AccType,       -- 0=Posting, 1=Heading, 2=Total, 3=Begin-Total, 4=End-Total
    RTRIM(ISNULL([Account Category],'')) AS Category,
    RTRIM(ISNULL([Account Subcategory Description],'')) AS Subcategory
  FROM [dbo].[FCL1$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972]
  WHERE [Account Type] = 0        -- posting accounts only (ignore headings/totals)
  UNION ALL
  SELECT 'CM',  RTRIM([No_]), RTRIM([Name]), [Account Type], RTRIM(ISNULL([Account Category],'')), RTRIM(ISNULL([Account Subcategory Description],''))
  FROM [dbo].[CM3$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972]
  WHERE [Account Type] = 0
  UNION ALL
  SELECT 'FLM', RTRIM([No_]), RTRIM([Name]), [Account Type], RTRIM(ISNULL([Account Category],'')), RTRIM(ISNULL([Account Subcategory Description],''))
  FROM [dbo].[FLM1$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972]
  WHERE [Account Type] = 0
  UNION ALL
  SELECT 'RMK', RTRIM([No_]), RTRIM([Name]), [Account Type], RTRIM(ISNULL([Account Category],'')), RTRIM(ISNULL([Account Subcategory Description],''))
  FROM [dbo].[RMK$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972]
  WHERE [Account Type] = 0
  ORDER BY Company, AccountNo;


 ── 2. Account range summary per category ─────────────────────────────────────
  Shows the min/max account number per Category across all companies.
  Useful for picking the ranges to put in your line formulas.

  WITH all_accts AS (
    SELECT 'FCL' AS Co, RTRIM([No_]) AS No, RTRIM(ISNULL([Account Category],'(none)')) AS Cat
    FROM [dbo].[FCL1$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972] WHERE [Account Type]=0
    UNION ALL
    SELECT 'CM',  RTRIM([No_]), RTRIM(ISNULL([Account Category],'(none)'))
    FROM [dbo].[CM3$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972]  WHERE [Account Type]=0
    UNION ALL
    SELECT 'FLM', RTRIM([No_]), RTRIM(ISNULL([Account Category],'(none)'))
    FROM [dbo].[FLM1$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972] WHERE [Account Type]=0
    UNION ALL
    SELECT 'RMK', RTRIM([No_]), RTRIM(ISNULL([Account Category],'(none)'))
    FROM [dbo].[RMK$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972]  WHERE [Account Type]=0
  )
  SELECT
    Cat,
    COUNT(*)      AS AccountCount,
    MIN(No)       AS FirstAccount,
    MAX(No)       AS LastAccount,
    STRING_AGG(DISTINCT Co, ', ') AS Companies
  FROM all_accts
  GROUP BY Cat
  ORDER BY FirstAccount;


 ── 3. Accounts with no category (need tagging) ───────────────────────────────
  If Category is blank, you need to tag them in BC (Account Card → Category field).

  SELECT
    'FCL' AS Company, RTRIM([No_]) AS AccountNo, RTRIM([Name]) AS AccountName
  FROM [dbo].[FCL1$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972]
  WHERE [Account Type]=0 AND RTRIM(ISNULL([Account Category],''))=''
  UNION ALL
  SELECT 'CM',  RTRIM([No_]), RTRIM([Name])
  FROM [dbo].[CM3$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972]
  WHERE [Account Type]=0 AND RTRIM(ISNULL([Account Category],''))=''
  UNION ALL
  SELECT 'FLM', RTRIM([No_]), RTRIM([Name])
  FROM [dbo].[FLM1$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972]
  WHERE [Account Type]=0 AND RTRIM(ISNULL([Account Category],''))=''
  UNION ALL
  SELECT 'RMK', RTRIM([No_]), RTRIM([Name])
  FROM [dbo].[RMK$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972]
  WHERE [Account Type]=0 AND RTRIM(ISNULL([Account Category],''))=''
  ORDER BY Company, AccountNo;


 ── 4. Totalling accounts (what we intentionally exclude) ─────────────────────
  Account Type values: 1=Heading, 2=Total, 3=Begin-Total, 4=End-Total
  These have [Totaling] ranges like "40000..49999" and should NOT be in formulas.

  SELECT
    'FCL' AS Co, RTRIM([No_]) AS No, RTRIM([Name]) AS Name, [Account Type], RTRIM(ISNULL([Totaling],'')) AS Totaling
  FROM [dbo].[FCL1$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972]
  WHERE [Account Type] <> 0
  UNION ALL
  SELECT 'CM',  RTRIM([No_]), RTRIM([Name]), [Account Type], RTRIM(ISNULL([Totaling],''))
  FROM [dbo].[CM3$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972]  WHERE [Account Type]<>0
  UNION ALL
  SELECT 'FLM', RTRIM([No_]), RTRIM([Name]), [Account Type], RTRIM(ISNULL([Totaling],''))
  FROM [dbo].[FLM1$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972] WHERE [Account Type]<>0
  UNION ALL
  SELECT 'RMK', RTRIM([No_]), RTRIM([Name]), [Account Type], RTRIM(ISNULL([Totaling],''))
  FROM [dbo].[RMK$G_L Account$437dbf0e-84ff-417a-965d-ed2bb9650972]  WHERE [Account Type]<>0
  ORDER BY Co, No;


 ── 5. Recent GL activity by account (sanity check) ───────────────────────────
  Check which accounts have actual postings in the last 12 months.
  Helps confirm your account ranges will actually return data.

  SELECT
    RTRIM([G_L Account No_]) AS AccountNo,
    SUM(ABS([Amount]))       AS TotalAbsActivity,
    COUNT(*)                 AS EntryCount,
    MIN([Posting Date])      AS EarliestPosting,
    MAX([Posting Date])      AS LatestPosting
  FROM [dbo].[FCL1$G_L Entry$437dbf0e-84ff-417a-965d-ed2bb9650972]
  WHERE [Posting Date] >= DATEADD(YEAR,-1,GETDATE())
  GROUP BY RTRIM([G_L Account No_])
  ORDER BY TotalAbsActivity DESC;
  -- Repeat for CM3, FLM1, RMK prefixes.

*/
