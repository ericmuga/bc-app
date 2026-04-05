/**
 * services/bcTables.js
 * Resolves Business Central table names.
 *
 * Three naming patterns:
 *   Core tables:         [dbo].[{Prefix}${TableName}$437dbf0e-...]
 *   Core ext tables:     [dbo].[{Prefix}${TableName}$437dbf0e-...$ext]   (coreExt: true)
 *   Extension tables:    [dbo].[{Prefix}${TableName}$23dc970e-...]        (ext: true)
 *   Shared ext tables:   [dbo].[{TableName}$23dc970e-...]                 (shared: true)
 *
 * Extension field columns use the EXT_GUID as a suffix:
 *   e.g.  [Sector$23dc970e-11e8-4d9b-8613-b7582aec86ba]
 *   Use the exported EXT_COL helper: extCol('Sector') → '[Sector$23dc970e-...]'
 *
 * Companies (app ID → BC table prefix):
 *   FCL → FCL1,  CM → CM3,  FLM → FLM1,  RMK → RMK
 */

const CORE_GUID = '437dbf0e-84ff-417a-965d-ed2bb9650972';
const EXT_GUID  = '23dc970e-11e8-4d9b-8613-b7582aec86ba';

/** Returns a quoted column name for an extension field in a coreExt table. */
export const extCol = (fieldName) => `[${fieldName}$${EXT_GUID}]`;

const BC_PREFIX = {
  FCL: 'FCL1',
  CM:  'CM3',
  FLM: 'FLM1',
  RMK: 'RMK',
};

export const ALL_COMPANIES = Object.keys(BC_PREFIX);

export const COMPANY_LABELS = {
  FCL: 'FCL',
  CM:  'CM',
  FLM: 'FLM',
  RMK: 'RMK',
};

/**
 * Returns a fully-quoted BC table reference safe to embed in SQL.
 * Table names come from a known whitelist — not from user input.
 *
 * @param {string}  companyId - App company ID (FCL | CM | FLM | RMK)
 * @param {string}  tableName - BC table name without GUID (e.g. 'Sales Invoice Header')
 * @param {object}  opts
 * @param {boolean} opts.ext     - true → use extension GUID (23dc970e...)
 * @param {boolean} opts.coreExt - true → core GUID + '$ext' suffix (e.g. Customer ext table)
 * @param {boolean} opts.shared  - true → no company prefix (shared extension table)
 */
export function bcTable(companyId, tableName, { ext = false, coreExt = false, shared = false } = {}) {
  const guid   = ext ? EXT_GUID : CORE_GUID;
  const suffix = coreExt ? '$ext' : '';
  if (shared) {
    return `[dbo].[${tableName}$${guid}${suffix}]`;
  }
  const prefix = BC_PREFIX[companyId];
  if (!prefix) throw new Error(`Unknown company: ${companyId}`);
  return `[dbo].[${prefix}$${tableName}$${guid}${suffix}]`;
}

/**
 * Filter and return only known company IDs.
 * If ids is empty/null, returns all companies.
 */
export function resolveCompanies(ids) {
  if (!ids || ids.length === 0) return ALL_COMPANIES;
  return ids.filter((id) => BC_PREFIX[id]);
}
