/**
 * lib/financeAccess.js
 * Finance role helpers — extends the base access.js without modifying it.
 */
import { normalizeRole } from './access.js'

export const FINANCE_ROLE = 'finance'
const FINANCE_ROLES = ['admin', FINANCE_ROLE, 'analyst']

export const canAccessFinance = (role) => FINANCE_ROLES.includes(normalizeRole(role))
