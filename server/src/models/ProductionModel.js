/**
 * models/ProductionModel.js
 * Production / inventory analysis by location.
 *
 * Reads BC Item Ledger Entry (quantity) + Value Entry (cost) for a company,
 * grouped by location / entry type / item / posting date so the client can
 * pivot by date and filter interactively.
 *
 * The configurable per-company location list lives in the app-DB AppSettings
 * table under key `production.locations` (JSON: { "FCL": ["1570", ...], ... }).
 */
import { bcDb, bcSql as sql } from '../db/bcPool.js';
import { db as appDb, sql as appSql } from '../db/pool.js';
import { bcTable, ALL_COMPANIES } from '../services/bcTables.js';
import logger from '../services/logger.js';

const SETTING_KEY = 'production.locations';

// Item Ledger Entry types (BC option integers)
export const ENTRY_TYPES = {
  0: 'Purchase', 1: 'Sale', 2: 'Positive Adjmt.', 3: 'Negative Adjmt.',
  4: 'Transfer', 5: 'Consumption', 6: 'Output',
};

// Sensible default so the page works before anyone edits the config.
const DEFAULT_LOCATIONS = {
  FCL: ['1570', '2055', '2575', '2595', '2500', '3535', '3600', '3035', '2035'],
};

async function ensureAppSettingsTable() {
  const pool = await appDb.getPool();
  await pool.request().query(`
    IF OBJECT_ID('[dbo].[AppSettings]', 'U') IS NULL
    CREATE TABLE [dbo].[AppSettings] (
      [SettingKey] NVARCHAR(100) NOT NULL PRIMARY KEY,
      [SettingValue] NVARCHAR(MAX) NULL,
      [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    )
  `);
}

/** Returns { FCL: [{ code, label }], ... } for every known company. */
export async function getLocationConfig() {
  await ensureAppSettingsTable();
  const pool = await appDb.getPool();
  const r = await pool.request()
    .input('k', appSql.NVarChar(100), SETTING_KEY)
    .query('SELECT SettingValue FROM [dbo].[AppSettings] WHERE SettingKey = @k');

  let stored = {};
  try { stored = JSON.parse(r.recordset[0]?.SettingValue || '{}'); } catch { stored = {}; }

  const out = {};
  for (const company of ALL_COMPANIES) {
    const raw = Array.isArray(stored[company]) && stored[company].length
      ? stored[company]
      : (DEFAULT_LOCATIONS[company] || []);
    out[company] = raw.map((entry) =>
      typeof entry === 'string'
        ? { code: entry, label: '' }
        : { code: String(entry.code || '').trim(), label: String(entry.label || '').trim() }
    ).filter((e) => e.code);
  }
  return out;
}

/** Persists the full config map { company: [{ code, label }] }. */
export async function saveLocationConfig(config) {
  await ensureAppSettingsTable();
  const clean = {};
  for (const company of ALL_COMPANIES) {
    const list = Array.isArray(config?.[company]) ? config[company] : [];
    clean[company] = list
      .map((e) => ({ code: String(e.code || '').trim(), label: String(e.label || '').trim() }))
      .filter((e) => e.code);
  }
  const pool = await appDb.getPool();
  await pool.request()
    .input('k', appSql.NVarChar(100), SETTING_KEY)
    .input('v', appSql.NVarChar(appSql.MAX), JSON.stringify(clean))
    .query(`
      MERGE [dbo].[AppSettings] AS t
      USING (SELECT @k AS SettingKey) AS s ON t.SettingKey = s.SettingKey
      WHEN MATCHED THEN UPDATE SET SettingValue = @v, UpdatedAt = GETUTCDATE()
      WHEN NOT MATCHED THEN INSERT (SettingKey, SettingValue) VALUES (@k, @v);
    `);
  return getLocationConfig();
}

function parseDateOnly(value) {
  const [y, m, d] = String(value).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Granular rows: { Company, LocationCode, EntryType, EntryTypeLabel, ItemNo,
 *   Description, PostingDate, Quantity, Cost } — one per (location, entry type,
 *   item, date). Client pivots by date and aggregates as needed.
 */
export async function runInventoryAnalysis({ company, locations, dateFrom, dateTo, entryTypes }) {
  const co = String(company || '').trim().toUpperCase();
  if (!ALL_COMPANIES.includes(co)) throw new Error(`Unknown company: ${company}`);

  const locs = (locations || []).map((l) => String(l).trim()).filter(Boolean);
  if (!locs.length) return { rows: [], meta: { company: co, dateFrom, dateTo, locations: [] } };

  const types = (entryTypes || [])
    .map((t) => parseInt(t, 10))
    .filter((t) => Number.isInteger(t) && ENTRY_TYPES[t] !== undefined);

  const ile  = bcTable(co, 'Item Ledger Entry');
  const ve   = bcTable(co, 'Value Entry');
  const item = bcTable(co, 'Item');

  const locParams = locs.map((_, i) => `@Loc${i}`).join(', ');
  const typeClause = types.length
    ? `AND ile.[Entry Type] IN (${types.map((_, i) => `@Type${i}`).join(', ')})`
    : '';

  const querySql = `
    SELECT
      ile.[Location Code]            AS LocationCode,
      ile.[Entry Type]              AS EntryType,
      ile.[Item No_]                AS ItemNo,
      MAX(ISNULL(NULLIF(it.[Description], ''), ile.[Item No_])) AS Description,
      CAST(ile.[Posting Date] AS date) AS PostingDate,
      SUM(ile.[Quantity])           AS Quantity,
      SUM(ISNULL(ve.CostActual, 0) + ISNULL(ve.CostExpected, 0)) AS Cost
    FROM ${ile} ile
    LEFT JOIN (
      SELECT [Item Ledger Entry No_] AS ILENo,
             SUM([Cost Amount (Actual)])   AS CostActual,
             SUM([Cost Amount (Expected)]) AS CostExpected
      FROM ${ve}
      GROUP BY [Item Ledger Entry No_]
    ) ve ON ve.ILENo = ile.[Entry No_]
    LEFT JOIN ${item} it ON it.[No_] = ile.[Item No_]
    WHERE CAST(ile.[Posting Date] AS date) BETWEEN @DateFrom AND @DateTo
      AND ile.[Location Code] IN (${locParams})
      ${typeClause}
    GROUP BY ile.[Location Code], ile.[Entry Type], ile.[Item No_], CAST(ile.[Posting Date] AS date)
    HAVING SUM(ile.[Quantity]) <> 0 OR SUM(ISNULL(ve.CostActual,0) + ISNULL(ve.CostExpected,0)) <> 0
    ORDER BY ile.[Location Code], ile.[Entry Type], Description, PostingDate
  `;

  const pool = await bcDb.getPool();
  const req = pool.request();
  req.input('DateFrom', sql.Date, parseDateOnly(dateFrom));
  req.input('DateTo', sql.Date, parseDateOnly(dateTo));
  locs.forEach((l, i) => req.input(`Loc${i}`, sql.NVarChar(20), l));
  types.forEach((t, i) => req.input(`Type${i}`, sql.Int, t));

  logger.info('production inventory analysis', { company: co, locations: locs, dateFrom, dateTo, entryTypes: types });
  const result = await req.query(querySql);

  const rows = result.recordset.map((r) => ({
    company:        co,
    locationCode:   r.LocationCode || '(Blank)',
    entryType:      r.EntryType,
    entryTypeLabel: ENTRY_TYPES[r.EntryType] ?? String(r.EntryType),
    itemNo:         r.ItemNo,
    description:    r.Description || r.ItemNo,
    postingDate:    r.PostingDate ? new Date(r.PostingDate).toISOString().slice(0, 10) : null,
    quantity:       Number(r.Quantity) || 0,
    cost:           Number(r.Cost) || 0,
  }));

  return {
    rows,
    meta: {
      company: co,
      dateFrom, dateTo,
      locations: locs,
      entryTypes: types,
      // WMS pending/error journal lines are added in Stage 2 (awaiting table name).
      pendingJournal: { included: false, note: 'WMS production journal lines pending (Stage 2)' },
    },
  };
}
