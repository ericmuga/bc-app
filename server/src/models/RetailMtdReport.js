/**
 * models/RetailMtdReport.js
 *
 * "Retail MTD" sales report (Summary sheet) — mirrors the Retail MTD Template
 * Excel workbook's Region / Category / Customer breakdown with Vol(Kgs),
 * Value(Lcy), Price/Kilo, vs prior-year and vs target.
 *
 * Scope: FCL, CM, RMK only (no FLM). Actuals come from posted Sales Invoices
 * (+) and Sales Cr_Memos (−) in live BC, one query per company (not a single
 * cross-company UNION ALL) so a slow company can't blow up the whole report.
 * Retail-channel, Region and Category are all admin-configurable remaps
 * (dbo.RetailMtdDimensionConfig) over raw BC fields:
 *   - Region   ← Ship-to Address ext "Route Code" (the District Group Code)
 *   - Category ← BC Posting Group (after stripping the "prefix-")
 *   - Retail?  ← Customer ext "Sector"
 * Targets reuse the existing FCLWHS.FACT_WEEKLYTARGETS upload (Weekly Targets
 * page); Item/Customer are resolved to Category/Region the same way as actuals.
 */
import { bcDb, bcSql as sql } from '../db/bcPool.js';
import { db as appDb } from '../db/pool.js';
import { whsDb } from '../db/whsPool.js';
import { bcTable, extCol } from '../services/bcTables.js';
import logger from '../services/logger.js';

export const RETAIL_MTD_COMPANIES = ['FCL', 'CM', 'RMK'];

const sectorCol    = extCol('Sector');
const routeCodeCol = extCol('Route Code'); // Ship-to ext field that carries the District Group Code

function postingGroupStripExpr(alias = 'l') {
  return `ISNULL(NULLIF(LTRIM(RTRIM(
    CASE WHEN CHARINDEX('-', ${alias}.[Posting Group]) > 0
         THEN SUBSTRING(${alias}.[Posting Group],
                CHARINDEX('-', ${alias}.[Posting Group]) + 1,
                LEN(${alias}.[Posting Group]))
         ELSE NULLIF(${alias}.[Posting Group], '')
    END)), ''), '(Blank)')`;
}

function amountExpr() {
  return `CASE WHEN ISNULL(h.[Currency Factor], 0) <> 0
               THEN l.[Amount] / h.[Currency Factor]
               ELSE l.[Amount] END`;
}

function makeTables(companyId) {
  return {
    invoiceHeader:  bcTable(companyId, 'Sales Invoice Header'),
    invoiceLine:    bcTable(companyId, 'Sales Invoice Line'),
    crMemoHeader:   bcTable(companyId, 'Sales Cr_Memo Header'),
    crMemoLine:     bcTable(companyId, 'Sales Cr_Memo Line'),
    customerExt:    bcTable(companyId, 'Customer', { coreExt: true }),
    shipToExt:      bcTable(companyId, 'Ship-to Address', { coreExt: true }),
    item:           bcTable(companyId, 'Item'),
  };
}

// ── Dimension config (Region / Category / Sector→Retail remaps) ─────────────

export async function listDimensionConfig(dimensionType) {
  const pool = await appDb.getPool();
  const req = pool.request();
  let where = '';
  if (dimensionType) { req.input('dimensionType', sql.NVarChar(20), dimensionType); where = 'WHERE [DimensionType] = @dimensionType'; }
  const result = await req.query(`
    SELECT [ConfigId], [DimensionType], [SourceCode], [MappedValue], [IsRetail], [SortOrder]
    FROM [dbo].[RetailMtdDimensionConfig]
    ${where}
    ORDER BY [DimensionType], [SortOrder], [SourceCode]
  `);
  return result.recordset;
}

export async function saveDimensionConfig({ configId, dimensionType, sourceCode, mappedValue, isRetail, sortOrder }) {
  const type = String(dimensionType || '').trim();
  const code = String(sourceCode || '').trim().toUpperCase();
  if (!['Region', 'Category', 'Sector'].includes(type)) throw new Error('dimensionType must be Region, Category or Sector');
  if (!code) throw new Error('sourceCode is required');
  const pool = await appDb.getPool();
  const req = pool.request()
    .input('dimensionType', sql.NVarChar(20), type)
    .input('sourceCode',    sql.NVarChar(100), code)
    .input('mappedValue',   sql.NVarChar(100), mappedValue ? String(mappedValue).trim() : null)
    .input('isRetail',      sql.Bit, isRetail === false ? 0 : 1)
    .input('sortOrder',     sql.Int, Number(sortOrder) || 0);
  if (configId) {
    req.input('configId', sql.UniqueIdentifier, configId);
    await req.query(`
      UPDATE [dbo].[RetailMtdDimensionConfig]
      SET [DimensionType]=@dimensionType, [SourceCode]=@sourceCode, [MappedValue]=@mappedValue,
          [IsRetail]=@isRetail, [SortOrder]=@sortOrder, [UpdatedAt]=GETUTCDATE()
      WHERE [ConfigId]=@configId
    `);
    return { configId };
  }
  const r = await req.query(`
    INSERT INTO [dbo].[RetailMtdDimensionConfig] ([DimensionType],[SourceCode],[MappedValue],[IsRetail],[SortOrder])
    OUTPUT INSERTED.[ConfigId]
    VALUES (@dimensionType, @sourceCode, @mappedValue, @isRetail, @sortOrder)
  `);
  return { configId: r.recordset[0].ConfigId };
}

export async function deleteDimensionConfig(configId) {
  const pool = await appDb.getPool();
  await pool.request().input('configId', sql.UniqueIdentifier, configId)
    .query(`DELETE FROM [dbo].[RetailMtdDimensionConfig] WHERE [ConfigId]=@configId`);
}

async function loadDimensionMaps() {
  const rows = await listDimensionConfig();
  const region = new Map(), category = new Map();
  const sectorRetail = new Set();
  let sectorConfigured = false;
  for (const r of rows) {
    const code = String(r.SourceCode || '').trim().toUpperCase();
    if (r.DimensionType === 'Region') region.set(code, r.MappedValue || code);
    else if (r.DimensionType === 'Category') category.set(code, r.MappedValue || code);
    else if (r.DimensionType === 'Sector') { sectorConfigured = true; if (r.IsRetail) sectorRetail.add(code); }
  }
  return { region, category, sectorRetail, sectorConfigured };
}

const regionFor   = (maps, code) => maps.region.get(String(code || '').trim().toUpperCase()) || '(Unmapped)';
const categoryFor = (maps, code) => maps.category.get(String(code || '').trim().toUpperCase()) || '(Unmapped)';
// With no Sector config yet, don't filter anything out — admin can scope it down later.
const isRetailSector = (maps, code) => !maps.sectorConfigured || maps.sectorRetail.has(String(code || '').trim().toUpperCase());

// ── Date helpers ──────────────────────────────────────────────────────────────

function monthRange(asOfDate) {
  const asOf = asOfDate ? new Date(asOfDate) : new Date();
  const from = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  const to   = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const pyFrom = new Date(Date.UTC(from.getUTCFullYear() - 1, from.getUTCMonth(), 1));
  const pyTo   = new Date(Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), to.getUTCDate()));
  return { from, to, pyFrom, pyTo };
}

// ── Actuals: one query per company (chunked), unioning MTD + PY windows ──────

async function fetchCompanyActuals(companyId, range) {
  const t = makeTables(companyId);
  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('mtdFrom', sql.Date, range.from);
  req.input('mtdTo',   sql.Date, range.to);
  req.input('pyFrom',  sql.Date, range.pyFrom);
  req.input('pyTo',    sql.Date, range.pyTo);

  const block = (header, line, sign, dateCol) => `
    SELECT
      CASE WHEN h.${dateCol} BETWEEN @mtdFrom AND @mtdTo THEN 'MTD' ELSE 'PY' END AS Period,
      ISNULL(NULLIF(cx.${sectorCol}, ''), '') AS SectorCode,
      ISNULL(NULLIF(ste.${routeCodeCol}, ''), '') AS DistrictCode,
      ${postingGroupStripExpr('l')} AS CategoryCode,
      ISNULL(NULLIF(h.[Sell-to Customer No_], ''), '(Blank)') AS CustomerNo,
      ISNULL(NULLIF(h.[Sell-to Customer Name], ''), '(Blank)') AS CustomerName,
      ${sign}SUM(CAST(l.[Quantity (Base)] AS decimal(38,20))) AS Qty,
      ${sign}SUM(${amountExpr()}) AS Amount
    FROM ${header} h
    JOIN ${line} l ON l.[Document No_] = h.[No_]
    LEFT JOIN ${t.customerExt} cx ON cx.[No_] = h.[Sell-to Customer No_]
    LEFT JOIN ${t.shipToExt} ste ON ste.[Customer No_] = h.[Sell-to Customer No_] AND ste.[Code] = h.[Ship-to Code]
    WHERE l.[Type] = 2
      AND h.${dateCol} BETWEEN @pyFrom AND @mtdTo
    GROUP BY
      CASE WHEN h.${dateCol} BETWEEN @mtdFrom AND @mtdTo THEN 'MTD' ELSE 'PY' END,
      cx.${sectorCol}, ste.${routeCodeCol}, ${postingGroupStripExpr('l')},
      h.[Sell-to Customer No_], h.[Sell-to Customer Name]
  `;

  const querySql = [
    block(t.invoiceHeader, t.invoiceLine, '+', '[Posting Date]'),
    block(t.crMemoHeader,  t.crMemoLine,  '-', '[Posting Date]'),
  ].join('\nUNION ALL\n');

  const result = await req.query(querySql);
  return result.recordset;
}

/** Aggregate raw rows into a Region/Category/Customer breakdown keyed by Period. */
function aggregate(rows, maps, keyFn) {
  const agg = new Map();
  for (const r of rows) {
    if (!isRetailSector(maps, r.SectorCode)) continue;
    const key = keyFn(r);
    const bucket = agg.get(key) || { key, volMTD: 0, valMTD: 0, volPY: 0, valPY: 0 };
    if (r.Period === 'MTD') { bucket.volMTD += Number(r.Qty) || 0; bucket.valMTD += Number(r.Amount) || 0; }
    else { bucket.volPY += Number(r.Qty) || 0; bucket.valPY += Number(r.Amount) || 0; }
    agg.set(key, bucket);
  }
  return Array.from(agg.values()).map((b) => ({
    ...b,
    priceMTD: b.volMTD ? b.valMTD / b.volMTD : 0,
    pricePY: b.volPY ? b.valPY / b.volPY : 0,
    volVsPyPct: b.volPY ? (b.volMTD - b.volPY) / b.volPY : null,
    valVsPyPct: b.valPY ? (b.valMTD - b.valPY) / b.valPY : null,
  }));
}

// ── Targets (FCLWHS.FACT_WEEKLYTARGETS), resolved to Region/Category ────────

async function fetchTargets(month, maps) {
  if (!month) return { byRegion: new Map(), byCategory: new Map(), overall: { vol: 0, val: 0 } };
  try {
    const pool = await whsDb.getPool();
    const req = pool.request();
    req.input('month', sql.Char(7), month);
    const companyList = RETAIL_MTD_COMPANIES.map((_, i) => `@co${i}`).join(',');
    RETAIL_MTD_COMPANIES.forEach((c, i) => req.input(`co${i}`, sql.VarChar(10), c));
    const result = await req.query(`
      SELECT [CustomerNo], [ShipToCode], [ItemNo], [VolTargetKgs], [ValTarget], [Company]
      FROM [dbo].[FACT_WEEKLYTARGETS]
      WHERE [MonthNameSorted] = @month AND [Company] IN (${companyList})
    `);
    const rows = result.recordset;
    if (!rows.length) return { byRegion: new Map(), byCategory: new Map(), overall: { vol: 0, val: 0 } };

    // Resolve each row's Region (via ship-to/customer District Group) and Category
    // (via item Posting Group) per company, in bulk per company to keep it cheap.
    const byCompany = new Map();
    for (const r of rows) (byCompany.get(r.Company) || byCompany.set(r.Company, []).get(r.Company)).push(r);

    const itemCategory = new Map();   // `${company}|${itemNo}` -> category code
    const custRegion = new Map();     // `${company}|${customerNo}|${shipToCode}` -> district code
    const bcPool = await bcDb.getPool();

    for (const [company, companyRows] of byCompany.entries()) {
      if (!RETAIL_MTD_COMPANIES.includes(company)) continue;
      const t = makeTables(company);
      const itemNos = [...new Set(companyRows.map((r) => r.ItemNo).filter(Boolean))];
      if (itemNos.length) {
        const req2 = bcPool.request();
        itemNos.forEach((no, i) => req2.input(`i${i}`, sql.NVarChar(20), no));
        const itemRes = await req2.query(`
          SELECT [No_], ${postingGroupStripExpr('i')} AS CategoryCode
          FROM ${t.item} i WHERE [No_] IN (${itemNos.map((_, i) => `@i${i}`).join(',')})
        `);
        for (const ir of itemRes.recordset) itemCategory.set(`${company}|${ir.No_}`, ir.CategoryCode);
      }
      const custKeys = [...new Set(companyRows.map((r) => `${r.CustomerNo}|${r.ShipToCode || ''}`))];
      if (custKeys.length) {
        const req3 = bcPool.request();
        const custNos = [...new Set(companyRows.map((r) => r.CustomerNo).filter(Boolean))];
        custNos.forEach((no, i) => req3.input(`c${i}`, sql.NVarChar(20), no));
        const steRes = await req3.query(`
          SELECT [Customer No_] AS CustomerNo, [Code] AS ShipToCode, ${routeCodeCol} AS DistrictCode
          FROM ${t.shipToExt} WHERE [Customer No_] IN (${custNos.map((_, i) => `@c${i}`).join(',')})
        `);
        for (const sr of steRes.recordset) custRegion.set(`${company}|${sr.CustomerNo}|${sr.ShipToCode || ''}`, sr.DistrictCode);
      }
    }

    const byRegion = new Map(), byCategory = new Map();
    let overallVol = 0, overallVal = 0;
    for (const r of rows) {
      const vol = Number(r.VolTargetKgs) || 0, val = Number(r.ValTarget) || 0;
      overallVol += vol; overallVal += val;
      const categoryCode = itemCategory.get(`${r.Company}|${r.ItemNo}`);
      const districtCode = custRegion.get(`${r.Company}|${r.CustomerNo}|${r.ShipToCode || ''}`);
      const region = regionFor(maps, districtCode);
      const category = categoryFor(maps, categoryCode);
      const rb = byRegion.get(region) || { vol: 0, val: 0 }; rb.vol += vol; rb.val += val; byRegion.set(region, rb);
      const cb = byCategory.get(category) || { vol: 0, val: 0 }; cb.vol += vol; cb.val += val; byCategory.set(category, cb);
    }
    return { byRegion, byCategory, overall: { vol: overallVol, val: overallVal } };
  } catch (e) {
    logger.warn('RetailMtdReport: targets unavailable', { error: e.message });
    return { byRegion: new Map(), byCategory: new Map(), overall: { vol: 0, val: 0 } };
  }
}

// ── Public: Summary report ───────────────────────────────────────────────────

export async function summary({ asOfDate } = {}) {
  const range = monthRange(asOfDate);
  const maps = await loadDimensionMaps();

  // One round-trip per company — a slow/unreachable company can't stall the rest.
  const perCompany = await Promise.all(
    RETAIL_MTD_COMPANIES.map((c) => fetchCompanyActuals(c, range).catch((e) => {
      logger.warn('RetailMtdReport: company fetch failed', { company: c, error: e.message });
      return [];
    }))
  );
  const rows = perCompany.flat();

  const byRegion   = aggregate(rows, maps, (r) => regionFor(maps, r.DistrictCode));
  const byCategory = aggregate(rows, maps, (r) => categoryFor(maps, r.CategoryCode));
  const byCustomer = aggregate(rows, maps, (r) => r.CustomerName)
    .sort((a, b) => b.valMTD - a.valMTD).slice(0, 20);
  const overall = aggregate(rows, maps, () => 'Retail')[0] || {
    key: 'Retail', volMTD: 0, valMTD: 0, volPY: 0, valPY: 0, priceMTD: 0, pricePY: 0, volVsPyPct: null, valVsPyPct: null,
  };

  const month = `${range.from.getUTCFullYear()}-${String(range.from.getUTCMonth() + 1).padStart(2, '0')}`;
  const targets = await fetchTargets(month, maps);
  const withTarget = (b, t) => ({
    ...b,
    volTarget: t?.vol || 0,
    valTarget: t?.val || 0,
    volVsTargetPct: t?.vol ? (b.volMTD - t.vol) / t.vol : null,
    valVsTargetPct: t?.val ? (b.valMTD - t.val) / t.val : null,
  });

  return {
    asOf: range.to.toISOString().slice(0, 10),
    month,
    companies: RETAIL_MTD_COMPANIES,
    overall: withTarget(overall, targets.overall),
    byRegion: byRegion.map((b) => withTarget(b, targets.byRegion.get(b.key))),
    byCategory: byCategory.map((b) => withTarget(b, targets.byCategory.get(b.key))),
    byCustomer,
  };
}
