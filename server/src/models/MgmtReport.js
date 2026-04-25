/**
 * models/MgmtReport.js
 * Management Accounts: formula-driven GL report engine.
 *
 * Data model:
 *   MgmtTemplate  — named report (e.g. "Consolidated P&L")
 *   MgmtLine      — rows: data | subtotal | heading | spacer
 *                   Formula (text)      : "FCL_33000 + CM_30000:39999 - FCL_40000"
 *                   EnabledMeasures     : "MTD,YTD"  (empty = all enabled)
 *   MgmtFormula   — legacy GL account ranges per data line (used when Formula text is empty)
 *   MgmtMeasure   — column definitions with raw SQL template or fallback DateMode
 *                   SqlQuery            : SQL returning AccountNo+Amount rows
 *                   DateMode/custom     : legacy fallback when SqlQuery is empty
 *
 * Report engine (new path):
 *   1. Parse each line's Formula text into (company, acctFrom, acctTo, sign) tokens.
 *   2. Execute each measure's SqlQuery per referenced company, get account→amount maps.
 *   3. Apply line tokens against the maps → line value per measure column.
 *   4. Resolve subtotals, apply EnabledMeasures mask, apply IsNegated sign.
 *
 * Backward-compatible path (legacy):
 *   When Formula is empty → load MgmtFormula rows and use old applyFormula logic.
 *   When SqlQuery is empty → compute date range from DateMode and call getAccountSums.
 *
 * Measure SqlQuery placeholders:
 *   {GL_ENTRY}  — replaced with the BC table name for the current company
 *   Parameters  : @ReferenceDate DATE, @Dim1Code NVARCHAR(20), @Dim2Code NVARCHAR(20)
 *   Returns     : AccountNo NVARCHAR(20), Amount DECIMAL
 */

import { sql } from '../db/pool.js';
import { bcDb, bcSql } from '../db/bcPool.js';
import { bcTable, ALL_COMPANIES } from '../services/bcTables.js';

// ── Date range helpers ────────────────────────────────────────────────────────
const FISCAL_START_MONTH = 3; // April (0-indexed); fiscal year = Apr–Mar

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function fiscalYearStart(d) {
  const m = d.getMonth();
  const y = d.getFullYear();
  return new Date(m < FISCAL_START_MONTH ? y - 1 : y, FISCAL_START_MONTH, 1);
}

export function computeDateRange(dateMode, referenceDate, customDateFrom, customDateTo) {
  const ref = new Date(referenceDate);
  const eom  = endOfMonth(ref);
  const som  = new Date(ref.getFullYear(), ref.getMonth(), 1);

  switch (dateMode) {
    case 'MTD':  return { dateFrom: som, dateTo: eom };
    case 'YTD':  return { dateFrom: fiscalYearStart(eom), dateTo: eom };
    case 'LMTD': { const ly = new Date(ref.getFullYear() - 1, ref.getMonth(), 1); return { dateFrom: ly, dateTo: endOfMonth(ly) }; }
    case 'LYTD': { const lyRef = new Date(ref.getFullYear() - 1, ref.getMonth(), 1); const lyEnd = endOfMonth(lyRef); return { dateFrom: fiscalYearStart(lyEnd), dateTo: lyEnd }; }
    case 'LMON': { const prev = new Date(ref.getFullYear(), ref.getMonth() - 1, 1); return { dateFrom: prev, dateTo: endOfMonth(prev) }; }
    case 'custom': return { dateFrom: new Date(customDateFrom), dateTo: new Date(customDateTo) };
    default: return { dateFrom: som, dateTo: eom };
  }
}

// ── Text formula parser ───────────────────────────────────────────────────────
/**
 * Parse a text formula like "FCL_33000 + CM_30000:39999 - FCL_40000"
 * Syntax: [+-] COMPANY_ACCTFROM[:ACCTTO]
 * Returns: [{ company, acctFrom, acctTo, sign }]
 */
function parseFormulaText(text) {
  if (!text || !text.trim()) return [];
  const tokens = [];
  const re = /([+-])?\s*([A-Za-z]+)_(\w+)(?::(\w+))?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    tokens.push({
      company:  m[2].toUpperCase(),
      acctFrom: m[3],
      acctTo:   m[4] || m[3],
      sign:     m[1] === '-' ? -1 : 1,
    });
  }
  return tokens;
}

function getEnabledMeasureSet(line) {
  if (!line.EnabledMeasures || !line.EnabledMeasures.trim()) return null; // all enabled
  const codes = line.EnabledMeasures.split(',').map(c => c.trim()).filter(Boolean);
  return codes.length ? new Set(codes) : null;
}

// ── GL account sum fetchers ───────────────────────────────────────────────────
/**
 * Legacy: Fetch GL entry amounts for a company + date range.
 * Now also supports optional Dim1/Dim2 filtering.
 */
async function getAccountSums(company, dateFrom, dateTo, dim1Code = '', dim2Code = '') {
  const entry  = bcTable(company, 'G_L Entry');
  const bcPool = await bcDb.getPool();
  const r = await bcPool.request()
    .input('dateFrom',  bcSql.Date,          dateFrom)
    .input('dateTo',    bcSql.Date,          dateTo)
    .input('dim1Code',  bcSql.NVarChar(500), dim1Code || '')
    .input('dim2Code',  bcSql.NVarChar(500), dim2Code || '')
    .query(`
      SELECT [G_L Account No_] AS AccountNo, ISNULL(SUM([Amount]), 0) AS Total
      FROM ${entry}
      WHERE [Posting Date] >= @dateFrom AND [Posting Date] <= @dateTo
        AND (@dim1Code = '' OR [Global Dimension 1 Code] IN (SELECT TRIM([value]) FROM STRING_SPLIT(@dim1Code, ',')))
        AND (@dim2Code = '' OR [Global Dimension 2 Code] IN (SELECT TRIM([value]) FROM STRING_SPLIT(@dim2Code, ',')))
      GROUP BY [G_L Account No_]
    `);
  const map = new Map();
  for (const row of r.recordset) map.set(row.AccountNo, row.Total);
  return map;
}

/**
 * New: Execute a measure's SqlQuery template for a given company.
 * Replaces {GL_ENTRY} with the actual table name.
 * Parameters: @DateFrom DATE, @DateTo DATE, @Dim1Code, @Dim2Code
 *             @ReferenceDate is aliased to @DateTo for backward compat with old SQL queries.
 * Returns: Map<accountNo, totalAmount>
 */
async function executeMeasureSql(sqlTemplate, company, dateFrom, dateTo, dim1Code, dim2Code) {
  const glEntry     = bcTable(company, 'G_L Entry');
  const resolvedSql = sqlTemplate.replace(/\{GL_ENTRY\}/g, glEntry);

  const bcPool = await bcDb.getPool();
  const r = await bcPool.request()
    .input('DateFrom',      bcSql.Date,          new Date(dateFrom))
    .input('DateTo',        bcSql.Date,          new Date(dateTo))
    .input('ReferenceDate', bcSql.Date,          new Date(dateTo))   // legacy alias
    .input('Dim1Code',      bcSql.NVarChar(500), dim1Code || '')
    .input('Dim2Code',      bcSql.NVarChar(500), dim2Code || '')
    .query(resolvedSql);

  const map = new Map();
  for (const row of r.recordset) {
    map.set(row.AccountNo, (map.get(row.AccountNo) || 0) + (row.Amount || 0));
  }
  return map;
}

// ── Legacy formula applier ────────────────────────────────────────────────────
function applyFormula(accountSums, formula) {
  const mode    = formula.SelectionMode || 'range';
  const rawList = (formula.AccountList || '').split(',').map(a => a.trim()).filter(Boolean);

  if (mode === 'specific') {
    return rawList.reduce((sum, acct) => sum + (accountSums.get(acct) || 0), 0);
  }

  const exclude = mode === 'except' ? new Set(rawList) : null;
  let total = 0;
  for (const [acctNo, amount] of accountSums) {
    if (acctNo >= formula.AccountFrom && acctNo <= formula.AccountTo) {
      if (!exclude || !exclude.has(acctNo)) total += amount;
    }
  }
  return total;
}

// ── Template CRUD ─────────────────────────────────────────────────────────────
export async function listTemplates(pool) {
  const r = await pool.request().query(
    `SELECT * FROM [dbo].[MgmtTemplate] ORDER BY [SortOrder], [TemplateName]`
  );
  return r.recordset;
}

export async function saveTemplate(pool, template) {
  const { templateId, templateName, description, sortOrder } = template;
  if (templateId) {
    await pool.request()
      .input('id',   sql.UniqueIdentifier, templateId)
      .input('name', sql.NVarChar(200), templateName)
      .input('desc', sql.NVarChar(500), description || null)
      .input('sort', sql.Int, sortOrder ?? 0)
      .query(`UPDATE [dbo].[MgmtTemplate]
              SET [TemplateName]=@name,[Description]=@desc,[SortOrder]=@sort,[UpdatedAt]=GETUTCDATE()
              WHERE [TemplateId]=@id`);
    return { templateId };
  }
  const r = await pool.request()
    .input('name', sql.NVarChar(200), templateName)
    .input('desc', sql.NVarChar(500), description || null)
    .input('sort', sql.Int, sortOrder ?? 0)
    .query(`INSERT INTO [dbo].[MgmtTemplate]([TemplateName],[Description],[SortOrder])
            OUTPUT INSERTED.[TemplateId]
            VALUES(@name,@desc,@sort)`);
  return { templateId: r.recordset[0].TemplateId };
}

export async function deleteTemplate(pool, templateId) {
  await pool.request().input('id', sql.UniqueIdentifier, templateId)
    .query(`DELETE f FROM [dbo].[MgmtFormula] f
            JOIN [dbo].[MgmtLine] l ON l.[LineId]=f.[LineId]
            WHERE l.[TemplateId]=@id`);
  await pool.request().input('id', sql.UniqueIdentifier, templateId)
    .query(`DELETE FROM [dbo].[MgmtLine] WHERE [TemplateId]=@id`);
  await pool.request().input('id', sql.UniqueIdentifier, templateId)
    .query(`DELETE FROM [dbo].[MgmtMeasure] WHERE [TemplateId]=@id`);
  await pool.request().input('id', sql.UniqueIdentifier, templateId)
    .query(`DELETE FROM [dbo].[MgmtTemplate] WHERE [TemplateId]=@id`);
}

// ── Lines CRUD ────────────────────────────────────────────────────────────────
export async function listLines(pool, templateId) {
  const r = await pool.request()
    .input('templateId', sql.UniqueIdentifier, templateId)
    .query(`SELECT * FROM [dbo].[MgmtLine] WHERE [TemplateId]=@templateId ORDER BY [SortOrder]`);
  return r.recordset;
}

export async function saveLine(pool, line) {
  const {
    lineId, templateId, lineCode, lineLabel, lineType, subtotalOf,
    indentLevel, isBold, isNegated, sortOrder, formula, enabledMeasures,
  } = line;

  if (lineId) {
    await pool.request()
      .input('lineId',          sql.UniqueIdentifier,  lineId)
      .input('lineCode',        sql.NVarChar(50),      lineCode)
      .input('lineLabel',       sql.NVarChar(200),     lineLabel)
      .input('lineType',        sql.NVarChar(20),      lineType || 'data')
      .input('subtotalOf',      sql.NVarChar(500),     subtotalOf || null)
      .input('indentLevel',     sql.Int,               indentLevel ?? 0)
      .input('isBold',          sql.Bit,               isBold ? 1 : 0)
      .input('isNegated',       sql.Bit,               isNegated ? 1 : 0)
      .input('sortOrder',       sql.Int,               sortOrder ?? 0)
      .input('formula',         sql.NVarChar(sql.MAX), formula || null)
      .input('enabledMeasures', sql.NVarChar(1000),    enabledMeasures || null)
      .query(`UPDATE [dbo].[MgmtLine]
              SET [LineCode]=@lineCode,[LineLabel]=@lineLabel,[LineType]=@lineType,
                  [SubtotalOf]=@subtotalOf,[IndentLevel]=@indentLevel,[IsBold]=@isBold,
                  [IsNegated]=@isNegated,[SortOrder]=@sortOrder,
                  [Formula]=@formula,[EnabledMeasures]=@enabledMeasures,
                  [UpdatedAt]=GETUTCDATE()
              WHERE [LineId]=@lineId`);
    return { lineId };
  }

  const r = await pool.request()
    .input('templateId',      sql.UniqueIdentifier,  templateId)
    .input('lineCode',        sql.NVarChar(50),      lineCode)
    .input('lineLabel',       sql.NVarChar(200),     lineLabel)
    .input('lineType',        sql.NVarChar(20),      lineType || 'data')
    .input('subtotalOf',      sql.NVarChar(500),     subtotalOf || null)
    .input('indentLevel',     sql.Int,               indentLevel ?? 0)
    .input('isBold',          sql.Bit,               isBold ? 1 : 0)
    .input('isNegated',       sql.Bit,               isNegated ? 1 : 0)
    .input('sortOrder',       sql.Int,               sortOrder ?? 0)
    .input('formula',         sql.NVarChar(sql.MAX), formula || null)
    .input('enabledMeasures', sql.NVarChar(1000),    enabledMeasures || null)
    .query(`INSERT INTO [dbo].[MgmtLine]
              ([TemplateId],[LineCode],[LineLabel],[LineType],[SubtotalOf],[IndentLevel],
               [IsBold],[IsNegated],[SortOrder],[Formula],[EnabledMeasures])
            OUTPUT INSERTED.[LineId]
            VALUES(@templateId,@lineCode,@lineLabel,@lineType,@subtotalOf,@indentLevel,
                   @isBold,@isNegated,@sortOrder,@formula,@enabledMeasures)`);
  return { lineId: r.recordset[0].LineId };
}

export async function deleteLine(pool, lineId) {
  await pool.request().input('lineId', sql.UniqueIdentifier, lineId)
    .query(`DELETE FROM [dbo].[MgmtFormula] WHERE [LineId]=@lineId`);
  await pool.request().input('lineId', sql.UniqueIdentifier, lineId)
    .query(`DELETE FROM [dbo].[MgmtLine] WHERE [LineId]=@lineId`);
}

// ── Formulas CRUD (legacy) ────────────────────────────────────────────────────
export async function listFormulas(pool, lineId) {
  const r = await pool.request()
    .input('lineId', sql.UniqueIdentifier, lineId)
    .query(`SELECT * FROM [dbo].[MgmtFormula] WHERE [LineId]=@lineId ORDER BY [SortOrder]`);
  return r.recordset;
}

export async function saveFormula(pool, formula) {
  const { formulaId, lineId, companyId, accountFrom, accountTo, operation, selectionMode, accountList, sortOrder } = formula;
  const mode = selectionMode || 'range';
  if (formulaId) {
    await pool.request()
      .input('formulaId',     sql.UniqueIdentifier, formulaId)
      .input('companyId',     sql.NVarChar(10),   companyId || 'ALL')
      .input('accountFrom',   sql.NVarChar(20),   accountFrom || '')
      .input('accountTo',     sql.NVarChar(20),   accountTo || accountFrom || '')
      .input('operation',     sql.NVarChar(10),   operation || 'ADD')
      .input('selectionMode', sql.NVarChar(20),   mode)
      .input('accountList',   sql.NVarChar(sql.MAX), accountList || null)
      .input('sortOrder',     sql.Int,            sortOrder ?? 0)
      .query(`UPDATE [dbo].[MgmtFormula]
              SET [CompanyId]=@companyId,[AccountFrom]=@accountFrom,[AccountTo]=@accountTo,
                  [Operation]=@operation,[SelectionMode]=@selectionMode,[AccountList]=@accountList,
                  [SortOrder]=@sortOrder,[UpdatedAt]=GETUTCDATE()
              WHERE [FormulaId]=@formulaId`);
    return { formulaId };
  }
  const r = await pool.request()
    .input('lineId',        sql.UniqueIdentifier, lineId)
    .input('companyId',     sql.NVarChar(10),   companyId || 'ALL')
    .input('accountFrom',   sql.NVarChar(20),   accountFrom || '')
    .input('accountTo',     sql.NVarChar(20),   accountTo || accountFrom || '')
    .input('operation',     sql.NVarChar(10),   operation || 'ADD')
    .input('selectionMode', sql.NVarChar(20),   mode)
    .input('accountList',   sql.NVarChar(sql.MAX), accountList || null)
    .input('sortOrder',     sql.Int,            sortOrder ?? 0)
    .query(`INSERT INTO [dbo].[MgmtFormula]
              ([LineId],[CompanyId],[AccountFrom],[AccountTo],[Operation],[SelectionMode],[AccountList],[SortOrder])
            OUTPUT INSERTED.[FormulaId]
            VALUES(@lineId,@companyId,@accountFrom,@accountTo,@operation,@selectionMode,@accountList,@sortOrder)`);
  return { formulaId: r.recordset[0].FormulaId };
}

export async function deleteFormula(pool, formulaId) {
  await pool.request().input('formulaId', sql.UniqueIdentifier, formulaId)
    .query(`DELETE FROM [dbo].[MgmtFormula] WHERE [FormulaId]=@formulaId`);
}

// ── Measures CRUD ─────────────────────────────────────────────────────────────
export async function listMeasures(pool, templateId) {
  const r = await pool.request()
    .input('templateId', sql.UniqueIdentifier, templateId)
    .query(`SELECT * FROM [dbo].[MgmtMeasure] WHERE [TemplateId]=@templateId ORDER BY [SortOrder]`);
  return r.recordset;
}

export async function saveMeasure(pool, measure) {
  const { measureId, templateId, measureCode, measureLabel, dateMode, customDateFrom, customDateTo, sqlQuery, sortOrder } = measure;
  if (measureId) {
    await pool.request()
      .input('measureId',      sql.UniqueIdentifier, measureId)
      .input('measureCode',    sql.NVarChar(50),  measureCode)
      .input('measureLabel',   sql.NVarChar(100), measureLabel)
      .input('dateMode',       sql.NVarChar(20),  dateMode || 'MTD')
      .input('customDateFrom', sql.Date,          customDateFrom ? new Date(customDateFrom) : null)
      .input('customDateTo',   sql.Date,          customDateTo   ? new Date(customDateTo)   : null)
      .input('sqlQuery',       sql.NVarChar(sql.MAX), sqlQuery || null)
      .input('sortOrder',      sql.Int,           sortOrder ?? 0)
      .query(`UPDATE [dbo].[MgmtMeasure]
              SET [MeasureCode]=@measureCode,[MeasureLabel]=@measureLabel,[DateMode]=@dateMode,
                  [CustomDateFrom]=@customDateFrom,[CustomDateTo]=@customDateTo,
                  [SqlQuery]=@sqlQuery,
                  [SortOrder]=@sortOrder,[UpdatedAt]=GETUTCDATE()
              WHERE [MeasureId]=@measureId`);
    return { measureId };
  }
  const r = await pool.request()
    .input('templateId',     sql.UniqueIdentifier, templateId)
    .input('measureCode',    sql.NVarChar(50),  measureCode)
    .input('measureLabel',   sql.NVarChar(100), measureLabel)
    .input('dateMode',       sql.NVarChar(20),  dateMode || 'MTD')
    .input('customDateFrom', sql.Date,          customDateFrom ? new Date(customDateFrom) : null)
    .input('customDateTo',   sql.Date,          customDateTo   ? new Date(customDateTo)   : null)
    .input('sqlQuery',       sql.NVarChar(sql.MAX), sqlQuery || null)
    .input('sortOrder',      sql.Int,           sortOrder ?? 0)
    .query(`INSERT INTO [dbo].[MgmtMeasure]
              ([TemplateId],[MeasureCode],[MeasureLabel],[DateMode],[CustomDateFrom],[CustomDateTo],[SqlQuery],[SortOrder])
            OUTPUT INSERTED.[MeasureId]
            VALUES(@templateId,@measureCode,@measureLabel,@dateMode,@customDateFrom,@customDateTo,@sqlQuery,@sortOrder)`);
  return { measureId: r.recordset[0].MeasureId };
}

export async function deleteMeasure(pool, measureId) {
  await pool.request().input('measureId', sql.UniqueIdentifier, measureId)
    .query(`DELETE FROM [dbo].[MgmtMeasure] WHERE [MeasureId]=@measureId`);
}

// ── Report execution engine ───────────────────────────────────────────────────

/**
 * runMgmtReport({ templateId, dateFrom, dateTo, dim1Code, dim2Code })
 *
 * Supports two modes per line:
 *   new: Formula text is set → parse tokens, execute measure SqlQuery per company
 *   legacy: Formula text empty → load MgmtFormula rows + use DateMode-based date ranges
 *
 * @DateFrom / @DateTo are passed to each measure's SqlQuery.
 * Legacy measures (no SqlQuery) use dateTo as referenceDate for computeDateRange.
 *
 * @returns {{ lines: object[], measures: {measureCode,measureLabel}[] }}
 */
export async function runMgmtReport(pool, { templateId, dateFrom, dateTo, dim1Code = '', dim2Code = '' }) {
  const referenceDate = dateTo; // legacy fallback
  const [lines, measures] = await Promise.all([
    listLines(pool, templateId),
    listMeasures(pool, templateId),
  ]);

  if (!lines.length || !measures.length) return { lines: [], measures: [] };

  const dataLines     = lines.filter(l => l.LineType === 'data');
  const newStyleLines = dataLines.filter(l => l.Formula && l.Formula.trim());
  const oldStyleLines = dataLines.filter(l => !l.Formula || !l.Formula.trim());

  // Parse formula texts and collect referenced companies
  const parsedFormulas    = new Map(); // lineId → tokens[]
  const newStyleCompanies = new Set();
  for (const line of newStyleLines) {
    const tokens = parseFormulaText(line.Formula);
    parsedFormulas.set(line.LineId, tokens);
    for (const t of tokens) {
      if (t.company === 'ALL') ALL_COMPANIES.forEach(c => newStyleCompanies.add(c));
      else newStyleCompanies.add(t.company);
    }
  }

  // Load legacy formula rows for old-style lines
  let oldFormulas = [];
  if (oldStyleLines.length) {
    const ids = oldStyleLines.map(l => `'${l.LineId}'`).join(',');
    const r = await pool.request().query(
      `SELECT * FROM [dbo].[MgmtFormula] WHERE [LineId] IN (${ids}) ORDER BY [SortOrder]`
    );
    oldFormulas = r.recordset;
  }

  // Separate measures: new (SqlQuery set) vs legacy (DateMode)
  const newMeasures = measures.filter(m => m.SqlQuery && m.SqlQuery.trim());
  const oldMeasures = measures.filter(m => !m.SqlQuery || !m.SqlQuery.trim());

  const oldMeasureRanges = oldMeasures.map(m => ({
    ...m,
    range: computeDateRange(m.DateMode, referenceDate, m.CustomDateFrom, m.CustomDateTo),
  }));

  // Collect (company, dateFrom, dateTo) combos for legacy lines × legacy measures
  const oldComboMap = new Map();
  for (const f of oldFormulas) {
    const companies = f.CompanyId === 'ALL' ? ALL_COMPANIES : [f.CompanyId];
    for (const company of companies) {
      for (const mr of oldMeasureRanges) {
        const key = `${company}|${mr.range.dateFrom.toISOString()}|${mr.range.dateTo.toISOString()}`;
        if (!oldComboMap.has(key)) oldComboMap.set(key, { company, dateFrom: mr.range.dateFrom, dateTo: mr.range.dateTo });
      }
    }
  }

  // Batch-fetch account sums in parallel
  const oldSumCache = new Map();
  const newSumCache = new Map(); // `${measureCode}|${company}` → Map<acctNo, amount>

  await Promise.all([
    // Legacy fetches
    ...[...oldComboMap.entries()].map(async ([key, { company, dateFrom, dateTo }]) => {
      oldSumCache.set(key, await getAccountSums(company, dateFrom, dateTo, dim1Code, dim2Code));
    }),
    // New SQL fetches
    ...newMeasures.flatMap(m =>
      [...newStyleCompanies].map(async company => {
        const sums = await executeMeasureSql(m.SqlQuery, company, dateFrom, dateTo, dim1Code, dim2Code);
        newSumCache.set(`${m.MeasureCode}|${company}`, sums);
      })
    ),
  ]);

  // ── Resolve data line values ──────────────────────────────────────────────
  const lineCodeValues = {}; // { [lineCode]: { [measureCode]: number } }

  // Legacy data lines
  for (const line of oldStyleLines) {
    const lineForms  = oldFormulas.filter(f => f.LineId === line.LineId);
    const enabledSet = getEnabledMeasureSet(line);
    lineCodeValues[line.LineCode] = {};
    for (const m of measures) {
      if (enabledSet && !enabledSet.has(m.MeasureCode)) {
        lineCodeValues[line.LineCode][m.MeasureCode] = 0;
        continue;
      }
      const mr = oldMeasureRanges.find(r => r.MeasureCode === m.MeasureCode);
      if (!mr) { lineCodeValues[line.LineCode][m.MeasureCode] = 0; continue; }
      let total = 0;
      for (const f of lineForms) {
        const companies = f.CompanyId === 'ALL' ? ALL_COMPANIES : [f.CompanyId];
        for (const company of companies) {
          const key  = `${company}|${mr.range.dateFrom.toISOString()}|${mr.range.dateTo.toISOString()}`;
          const sums = oldSumCache.get(key) || new Map();
          const amt  = applyFormula(sums, f);
          total += f.Operation === 'SUBTRACT' ? -amt : amt;
        }
      }
      lineCodeValues[line.LineCode][m.MeasureCode] = total;
    }
  }

  // New-style data lines
  for (const line of newStyleLines) {
    const tokens     = parsedFormulas.get(line.LineId) || [];
    const enabledSet = getEnabledMeasureSet(line);
    lineCodeValues[line.LineCode] = {};
    for (const m of measures) {
      if (enabledSet && !enabledSet.has(m.MeasureCode)) {
        lineCodeValues[line.LineCode][m.MeasureCode] = 0;
        continue;
      }
      const isNewMeasure = newMeasures.some(nm => nm.MeasureCode === m.MeasureCode);
      if (!isNewMeasure) { lineCodeValues[line.LineCode][m.MeasureCode] = 0; continue; }

      let total = 0;
      for (const token of tokens) {
        const companies = token.company === 'ALL' ? ALL_COMPANIES : [token.company];
        for (const company of companies) {
          const sums = newSumCache.get(`${m.MeasureCode}|${company}`) || new Map();
          let subtotal = 0;
          for (const [acctNo, amount] of sums) {
            if (acctNo >= token.acctFrom && acctNo <= token.acctTo) subtotal += amount;
          }
          total += token.sign * subtotal;
        }
      }
      lineCodeValues[line.LineCode][m.MeasureCode] = total;
    }
  }

  // ── Resolve subtotal lines ────────────────────────────────────────────────
  for (const line of lines.filter(l => l.LineType === 'subtotal')) {
    const codes      = (line.SubtotalOf || '').split(',').map(c => c.trim()).filter(Boolean);
    const enabledSet = getEnabledMeasureSet(line);
    lineCodeValues[line.LineCode] = {};
    for (const m of measures) {
      if (enabledSet && !enabledSet.has(m.MeasureCode)) {
        lineCodeValues[line.LineCode][m.MeasureCode] = 0;
        continue;
      }
      lineCodeValues[line.LineCode][m.MeasureCode] = codes.reduce(
        (sum, code) => sum + (lineCodeValues[code]?.[m.MeasureCode] || 0),
        0
      );
    }
  }

  // ── Build output rows ─────────────────────────────────────────────────────
  const outputLines = lines.map(line => {
    const vals   = lineCodeValues[line.LineCode] || {};
    const values = {};
    for (const m of measures) {
      const raw = vals[m.MeasureCode] ?? 0;
      values[m.MeasureCode] = line.IsNegated ? -raw : raw;
    }
    return {
      lineId:      line.LineId,
      lineCode:    line.LineCode,
      lineLabel:   line.LineLabel,
      lineType:    line.LineType,
      indentLevel: line.IndentLevel,
      isBold:      !!line.IsBold,
      isNegated:   !!line.IsNegated,
      values,
    };
  });

  return {
    lines:    outputLines,
    measures: measures.map(m => ({ measureCode: m.MeasureCode, measureLabel: m.MeasureLabel })),
  };
}

// ── Line detail (account-level drill-down) ────────────────────────────────────
/**
 * getLineDetail({ templateId, lineCode, dateFrom, dateTo, dim1Code, dim2Code })
 * Returns per-account amounts for each measure column, for a single data line.
 * Only works for new-style lines (Formula text set).
 */
export async function getLineDetail(pool, { templateId, lineCode, dateFrom, dateTo, dim1Code = '', dim2Code = '' }) {
  // Load line
  const lineRes = await pool.request()
    .input('templateId', sql.UniqueIdentifier, templateId)
    .input('lineCode',   sql.NVarChar(50),     lineCode)
    .query(`SELECT * FROM [dbo].[MgmtLine] WHERE [TemplateId]=@templateId AND [LineCode]=@lineCode`);

  const line = lineRes.recordset[0];
  if (!line || line.LineType !== 'data' || !line.Formula) return { lineLabel: lineCode, accounts: [] };

  // Parse formula → expand ALL_ to individual companies
  const rawTokens = parseFormulaText(line.Formula);
  const tokens = rawTokens.flatMap(t =>
    t.company === 'ALL'
      ? ALL_COMPANIES.map(c => ({ ...t, company: c }))
      : [t]
  );

  const companiesNeeded = [...new Set(tokens.map(t => t.company))];

  // Load measures
  const measures = await listMeasures(pool, templateId);
  const activeMeasures = measures.filter(m => m.SqlQuery && m.SqlQuery.trim());

  // Fetch GL account names for all referenced companies
  const bcPool     = await bcDb.getPool();
  const nameMap    = new Map(); // `${company}|${acctNo}` → name
  await Promise.all(companiesNeeded.map(async company => {
    const tbl = bcTable(company, 'G_L Account');
    const r   = await bcPool.request().query(
      `SELECT RTRIM([No_]) AS No, RTRIM([Name]) AS Name FROM ${tbl} WHERE [Account Type]=0`
    );
    for (const row of r.recordset) nameMap.set(`${company}|${row.No}`, row.Name);
  }));

  // For each measure × company, run SQL and collect matching account rows
  // Cache: `${measureCode}|${company}` → Map<acctNo, amount>
  const sumCache = new Map();
  await Promise.all(
    activeMeasures.flatMap(m =>
      companiesNeeded.map(async company => {
        const sums = await executeMeasureSql(m.SqlQuery, company, dateFrom, dateTo, dim1Code, dim2Code);
        sumCache.set(`${m.MeasureCode}|${company}`, sums);
      })
    )
  );

  // Build a flat list of unique (company, accountNo) pairs that appear in any token range
  const accountSet = new Map(); // `${company}|${acctNo}` → { company, accountNo, accountName }
  for (const t of tokens) {
    const anyMeasureKey = activeMeasures[0] ? `${activeMeasures[0].MeasureCode}|${t.company}` : null;
    const sums = anyMeasureKey ? sumCache.get(anyMeasureKey) : new Map();
    if (!sums) continue;
    for (const [acctNo] of sums) {
      if (acctNo >= t.acctFrom && acctNo <= t.acctTo) {
        const key = `${t.company}|${acctNo}`;
        if (!accountSet.has(key)) {
          accountSet.set(key, {
            company:     t.company,
            accountNo:   acctNo,
            accountName: nameMap.get(key) || '',
          });
        }
      }
    }
  }

  // Build result rows with one amount per measure
  const sign = line.IsNegated ? -1 : 1;
  const rows = [];
  for (const [key, acct] of accountSet) {
    const token    = tokens.find(t => t.company === acct.company && acct.accountNo >= t.acctFrom && acct.accountNo <= t.acctTo);
    const tokenSign = token ? token.sign : 1;
    const amounts  = {};
    for (const m of activeMeasures) {
      const sums = sumCache.get(`${m.MeasureCode}|${acct.company}`) || new Map();
      amounts[m.MeasureCode] = (sums.get(acct.accountNo) || 0) * tokenSign * sign;
    }
    rows.push({ ...acct, amounts });
  }

  rows.sort((a, b) => a.company.localeCompare(b.company) || a.accountNo.localeCompare(b.accountNo));

  return {
    lineLabel:   line.LineLabel,
    isNegated:   !!line.IsNegated,
    measures:    activeMeasures.map(m => ({ measureCode: m.MeasureCode, measureLabel: m.MeasureLabel })),
    accounts:    rows,
  };
}
