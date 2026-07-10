/**
 * config/wms.js
 * Centralised naming for the WMS linked server reached THROUGH the BCApp pool.
 *
 * The WMS database (calibra) lives on a separate SQL instance exposed as a
 * linked server on the BCApp instance. Two aliases exist on the box:
 *   - FCL-WMS    — current working alias (reporter has a login-mapping)
 *   - FCL-WMS10  — newer alias; needs a reporter login-mapping before use
 *
 * Keep the alias in ONE place so flipping FCL-WMS → FCL-WMS10 is a config edit.
 */
import dotenv from 'dotenv';
dotenv.config();

export const WMS_LINKED_SERVER = process.env.WMS_LINKED_SERVER || 'FCL-WMS';
export const WMS_DB = process.env.WMS_DB || 'calibra';

/**
 * Per-company WMS databases on the same linked server.
 *   FCL → calibra      (slaughter / production)
 *   CM  → cml-calibra  (Choice Meats — identical RecipeData schema)
 */
export const WMS_DBS = {
  FCL: WMS_DB,
  CM:  process.env.WMS_DB_CM || 'cml-calibra',
};
export const WMS_COMPANIES = Object.keys(WMS_DBS);

/** Map a company code → its WMS database name (defaults to FCL/calibra). */
export function resolveWmsDb(company) {
  const c = String(company || 'FCL').toUpperCase();
  return WMS_DBS[c] || WMS_DB;
}

/** Build a fully-qualified [linked].[db].[dbo].[table] name (db defaults to FCL). */
export const wmsTable = (table, db = WMS_DB) => `[${WMS_LINKED_SERVER}].[${db}].[dbo].[${table}]`;
