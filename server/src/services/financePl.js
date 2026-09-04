/**
 * services/financePl.js
 *
 * Configurable Profit & Loss statement definitions (per company) + the account
 * spec parser. A definition is an ordered list of lines; each line is either a
 * GL-account bucket (spec = ranges/accounts), a computed subtotal (sum of other
 * line keys), or the tax line (rate applied to a base line).
 *
 * Definitions live in AppSettings (key finance.pl.{COMPANY}) so accounts/lines
 * can be edited without a code change; DEFAULT_PL seeds a company that has none.
 *
 * Account spec grammar (as in FCL-PL.xlsx):
 *   "31050..31595"                inclusive range ('..' or '-')
 *   "40040|40414"                 union of segments ('|')
 *   "75418"                       single account
 *   "61100-75401|76500..76519"    mixed
 */
import { db, sql } from '../db/pool.js';

// Seeded from FCL-PL.xlsx (FCL Consolidated Profit & Loss).
export const DEFAULT_PL = {
  FCL: {
    title: 'FCL Consolidated Profit & Loss',
    taxRate: 0.30,
    lines: [
      { key: 'sales',        label: 'SALES',                       kind: 'accounts', spec: '31050..31595' },
      { key: 'sales3p',      label: 'SALES THIRD PARTY',           kind: 'accounts', spec: '32360..32800' },
      { key: 'cos',          label: 'COST OF SALES',               kind: 'accounts', spec: '40000..40035|40045..40413|40415..41996' },
      { key: 'cos3p',        label: 'COST OF SALES THIRD PARTY',   kind: 'accounts', spec: '40040|40414' },
      { key: 'grossProfit',  label: 'GROSS PROFIT',                kind: 'subtotal', of: ['sales', 'sales3p', 'cos', 'cos3p'] },
      { key: 'otherIncome',  label: 'OTHER INCOME',                kind: 'accounts', spec: '76520..76522' },
      { key: 'gainLoss',     label: 'GAIN/LOSS ON DISPOSAL',       kind: 'accounts', spec: '75418' },
      { key: 'overheads',    label: 'OVERHEADS',                   kind: 'accounts', spec: '61100..75401|76500..76519|76523..76525' },
      { key: 'mgmtFees',     label: 'MANAGEMENT FEES',             kind: 'accounts', spec: '75422|75424' },
      { key: 'unrealised',   label: 'UNREALISED GAINS AND LOSSES', kind: 'accounts', spec: '75403..75404' },
      { key: 'ebitda',       label: 'EBITDA',                      kind: 'subtotal', of: ['grossProfit', 'otherIncome', 'gainLoss', 'overheads', 'mgmtFees', 'unrealised'] },
      { key: 'depreciation', label: 'DEPRECIATION',                kind: 'accounts', spec: '75403' },
      { key: 'interest',     label: 'INTEREST',                    kind: 'accounts', spec: '75405..75417|75419..75421|75423|75425..75431' },
      { key: 'pbt',          label: 'PROFIT BEFORE TAX',           kind: 'subtotal', of: ['ebitda', 'depreciation', 'interest'] },
      { key: 'tax',          label: 'TAX',                         kind: 'tax',      rate: 0.30, base: 'pbt' },
      { key: 'pat',          label: 'PROFIT AFTER TAX',            kind: 'subtotal', of: ['pbt', 'tax'] },
    ],
  },
};

const KEY = (company) => `finance.pl.${String(company || '').toUpperCase()}`;

/** Parse an account spec into inclusive numeric ranges. */
export function parseSpec(spec) {
  return String(spec || '').split('|').map((s) => s.trim()).filter(Boolean).map((seg) => {
    const parts = seg.split(/\.\.|-/).map((x) => Number(String(x).trim()));
    if (parts.length === 2 && parts.every(Number.isFinite)) return [Math.min(parts[0], parts[1]), Math.max(parts[0], parts[1])];
    return [parts[0], parts[0]];
  }).filter((r) => Number.isFinite(r[0]));
}

/** Numeric value of a GL account no (strips non-numerics). */
export function acctNum(no) {
  const n = Number(String(no).replace(/[^0-9]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

export function specMatches(accountNo, ranges) {
  const n = acctNum(accountNo);
  if (!Number.isFinite(n)) return false;
  return ranges.some(([lo, hi]) => n >= lo && n <= hi);
}

/** Load a company's P&L definition (stored override, else the seeded default). */
export async function getPlDefinition(company) {
  const co = String(company || '').toUpperCase();
  const pool = await db.getPool();
  const r = await pool.request().input('k', sql.NVarChar(100), KEY(co))
    .query(`SELECT [SettingValue] FROM [dbo].[AppSettings] WHERE [SettingKey]=@k`);
  if (r.recordset[0]?.SettingValue) {
    try { return JSON.parse(r.recordset[0].SettingValue); } catch { /* fall through */ }
  }
  return DEFAULT_PL[co] || { title: `${co} Profit & Loss`, taxRate: 0.30, lines: [] };
}

/** Save/override a company's P&L definition. */
export async function savePlDefinition(company, definition) {
  const co = String(company || '').toUpperCase();
  if (!co) throw new Error('company is required');
  if (!definition || !Array.isArray(definition.lines)) throw new Error('definition.lines[] is required');
  const pool = await db.getPool();
  await pool.request()
    .input('k', sql.NVarChar(100), KEY(co))
    .input('v', sql.NVarChar(sql.MAX), JSON.stringify(definition))
    .query(`
      MERGE [dbo].[AppSettings] AS t USING (SELECT @k AS SettingKey) AS s ON t.[SettingKey]=s.SettingKey
      WHEN MATCHED THEN UPDATE SET [SettingValue]=@v, [UpdatedAt]=GETUTCDATE()
      WHEN NOT MATCHED THEN INSERT ([SettingKey],[SettingValue]) VALUES (@k,@v);`);
  return getPlDefinition(co);
}
