/**
 * lib/costingAccess.js
 * Costing role helpers — extends the base access.js without modifying it.
 */
import { normalizeRole } from './access.js'

export const COSTING_ROLE = 'costing'
const COSTING_ROLES = ['admin', COSTING_ROLE]

export const canAccessCosting = (role) => COSTING_ROLES.includes(normalizeRole(role))
