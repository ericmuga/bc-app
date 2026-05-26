import { normalizeRole } from './access.js'

export const POS_ROLE        = 'shop'
export const SHOP_ADMIN_ROLE = 'shop-admin'

const POS_ROLES         = ['admin', SHOP_ADMIN_ROLE, POS_ROLE]
const POS_MANAGER_ROLES = ['admin', SHOP_ADMIN_ROLE]
// Admin areas (Users, SMTP, scheduled reports, mgmt accounts) restricted to global admin only
const GLOBAL_ADMIN_ROLES = ['admin']

export const canAccessPos        = (role) => POS_ROLES.includes(normalizeRole(role))
// Manager actions: transfers, portionings, write-offs, master-data sync
export const canManagePos        = (role) => POS_MANAGER_ROLES.includes(normalizeRole(role))
// True only for the global admin role (used to hide non-POS admin sections from shop-admin)
export const isGlobalAdmin       = (role) => GLOBAL_ADMIN_ROLES.includes(normalizeRole(role))
