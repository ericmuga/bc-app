/**
 * models/WarehouseSectorCheckModel.js
 * Customer sector check: live BC customer Sector (per company) against every
 * place FCLWHS keeps it, so mis-tagged / unmatched sectors can be listed.
 *
 * Sources compared, per (company, customer):
 *   Live       – {prefix}$Customer$ext [Sector] via linked server [FC-BC-DEV-DB01]
 *   Staging    – dbo.{FCLMAIN|CMMAIN|RMKMAIN}_CUSTOMER (no FLM copy exists)
 *   AllCust    – dbo.ALLCUSTOMERS view, matched by No_ only (as NETSALES and
 *                ALLOUTLETS do). It de-duplicates by No_ with CM > FCL > RMK
 *                precedence, so a customer whose number also exists in a
 *                higher-precedence company resolves to that company's record.
 *   Dim        – dbo.dim_ALLCUSTOMERS_MV (by COMPANY + No_); its refresh
 *                replaces a blank sector with 'FAST FOOD'.
 */
import { whsDb } from '../db/whsPool.js';
import logger from '../services/logger.js';

const LINKED = '[FC-BC-DEV-DB01].[FCL].[dbo]';
const CORE = '437dbf0e-84ff-417a-965d-ed2bb9650972';
const EXT  = '23dc970e-11e8-4d9b-8613-b7582aec86ba';
const COMPANIES = [['FCL', 'FCL1'], ['CM', 'CM3'], ['RMK', 'RMK'], ['FLM', 'FLM1']];
const STAGING = { FCL: 'FCLMAIN_CUSTOMER', CM: 'CMMAIN_CUSTOMER', RMK: 'RMKMAIN_CUSTOMER' };
const DIM_BLANK_DEFAULT = 'FAST FOOD';

export const SECTOR_ISSUES = {
  BLANK_IN_BC:        'No sector in BC',
  UNDEFINED_IN_BC:    "Sector 'UNDEFINED' in BC",
  STAGING_MISSING:    'Missing from warehouse customer copy',
  STAGING_DIFFERS:    'Warehouse customer copy differs from BC',
  ALLCUST_MISSING:    'Missing from ALLCUSTOMERS (sales views get no sector)',
  ALLCUST_SHADOWED:   'ALLCUSTOMERS resolves this number to another company',
  ALLCUST_DIFFERS:    'ALLCUSTOMERS sector differs from BC (sales views mis-tagged)',
  DIM_MISSING:        'Missing from dim_ALLCUSTOMERS_MV',
  DIM_DEFAULTED:      `dim_ALLCUSTOMERS_MV defaults blank to '${DIM_BLANK_DEFAULT}'`,
  DIM_DIFFERS:        'dim_ALLCUSTOMERS_MV sector differs from BC',
};

const t = (expr) => `LTRIM(RTRIM(ISNULL(${expr}, ''))) COLLATE DATABASE_DEFAULT`;

export async function sectorCheck() {
  const live = COMPANIES.map(([co, pfx]) => `
    SELECT '${co}' AS Company, ${t('c.[No_]')} AS No_, ${t('c.[Name]')} AS Name, ${t(`x.[Sector$${EXT}]`)} AS Sector
    FROM ${LINKED}.[${pfx}$Customer$${CORE}] c
    LEFT JOIN ${LINKED}.[${pfx}$Customer$${CORE}$ext] x ON x.[No_] = c.[No_]`).join('\n    UNION ALL');
  const staging = Object.entries(STAGING).map(([co, tbl]) => `
    SELECT '${co}' AS Company, ${t('[No_]')} AS No_, ${t('[Sector]')} AS Sector FROM dbo.${tbl}`).join('\n    UNION ALL');

  const pool = await whsDb.getPool();
  const t0 = Date.now();
  const { recordset } = await pool.request().query(`
    SELECT ${t('No_')} No_, ${t('Sector')} Sector, ${t('COMPANY')} COMPANY INTO #ac FROM dbo.ALLCUSTOMERS;
    SELECT ${t('No_')} No_, ${t(`[Sector$${EXT}]`)} Sector, ${t('COMPANY')} COMPANY INTO #dim FROM dbo.dim_ALLCUSTOMERS_MV;
    SELECT * INTO #live FROM (${live}) l;
    SELECT * INTO #stg FROM (${staging}) s;
    SELECT l.Company, l.No_, l.Name, l.Sector AS LiveSector,
      s.No_ AS StgNo, s.Sector AS StagingSector,
      a.No_ AS AcNo, a.Sector AS AllCustSector, a.COMPANY AS AllCustCompany,
      d.No_ AS DimNo, d.Sector AS DimSector
    FROM #live l
    LEFT JOIN #stg s ON s.Company = l.Company AND s.No_ = l.No_
    LEFT JOIN #ac  a ON a.No_ = l.No_
    LEFT JOIN #dim d ON d.COMPANY = l.Company AND d.No_ = l.No_;`);
  logger.info('warehouse sector-check query', { ms: Date.now() - t0, rows: recordset.length });

  const summary = new Map();
  const sectors = new Map();
  const bump = (sector, field) => {
    const k = sector || '(blank)';
    if (!sectors.has(k)) sectors.set(k, { Sector: k, Live: 0, Staging: 0, AllCustomers: 0, Dim: 0 });
    sectors.get(k)[field]++;
  };
  const rows = [];

  for (const r of recordset) {
    const issues = [];
    if (!r.LiveSector) issues.push('BLANK_IN_BC');
    else if (r.LiveSector.toUpperCase() === 'UNDEFINED') issues.push('UNDEFINED_IN_BC');
    if (STAGING[r.Company]) {
      if (r.StgNo == null) issues.push('STAGING_MISSING');
      else if (r.StagingSector !== r.LiveSector) issues.push('STAGING_DIFFERS');
    }
    if (r.AcNo == null) issues.push('ALLCUST_MISSING');
    else {
      if (r.AllCustCompany !== r.Company) issues.push('ALLCUST_SHADOWED');
      if (r.AllCustSector !== r.LiveSector) issues.push('ALLCUST_DIFFERS');
    }
    if (r.DimNo == null) issues.push('DIM_MISSING');
    else if (r.DimSector !== r.LiveSector) issues.push(!r.LiveSector && r.DimSector === DIM_BLANK_DEFAULT ? 'DIM_DEFAULTED' : 'DIM_DIFFERS');

    if (!summary.has(r.Company)) summary.set(r.Company, { Company: r.Company, Customers: 0, Clean: 0, ...Object.fromEntries(Object.keys(SECTOR_ISSUES).map((k) => [k, 0])) });
    const s = summary.get(r.Company);
    s.Customers++;
    if (issues.length) issues.forEach((i) => s[i]++); else s.Clean++;

    bump(r.LiveSector, 'Live');
    if (r.StgNo != null) bump(r.StagingSector, 'Staging');
    if (r.AcNo != null && r.AllCustCompany === r.Company) bump(r.AllCustSector, 'AllCustomers');
    if (r.DimNo != null) bump(r.DimSector, 'Dim');

    if (issues.length) rows.push({
      Company: r.Company, CustomerNo: r.No_, Name: r.Name,
      LiveSector: r.LiveSector,
      StagingSector: STAGING[r.Company] ? (r.StgNo == null ? null : r.StagingSector) : undefined,
      AllCustSector: r.AcNo == null ? null : r.AllCustSector,
      AllCustCompany: r.AcNo == null ? null : r.AllCustCompany,
      DimSector: r.DimNo == null ? null : r.DimSector,
      Issues: issues,
    });
  }

  // Sector values present somewhere in the warehouse but used by no live customer.
  const liveValues = new Set([...sectors.values()].filter((s) => s.Live > 0).map((s) => s.Sector));
  const sectorRows = [...sectors.values()]
    .map((s) => ({ ...s, NotInBc: !liveValues.has(s.Sector) }))
    .sort((a, b) => a.Sector.localeCompare(b.Sector));

  return {
    checkedAt: new Date().toISOString(),
    issueLabels: SECTOR_ISSUES,
    summary: [...summary.values()],
    sectors: sectorRows,
    rows,
  };
}
