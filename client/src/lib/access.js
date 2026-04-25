export const ROLES = {
  ADMIN: 'admin',
  SALES: 'sales',
  DISPATCH: 'dispatch',
  SECURITY: 'security',
  ANALYST: 'analyst',
}

const REPORT_ROLES = [ROLES.ADMIN, ROLES.SALES, ROLES.ANALYST]
const ORDER_ROLES = [ROLES.ADMIN, ROLES.DISPATCH]
const INVOICE_ROLES = [ROLES.ADMIN, ROLES.SECURITY]

export const normalizeRole = (role) => String(role || '').trim().toLowerCase()
export const canAccessReports = (role) => REPORT_ROLES.includes(normalizeRole(role))
export const canAccessOrders = (role) => ORDER_ROLES.includes(normalizeRole(role))
export const canAccessInvoices = (role) => INVOICE_ROLES.includes(normalizeRole(role))

export function defaultRouteForRole(role) {
  const currentRole = normalizeRole(role)
  if (canAccessOrders(currentRole)) return '/orders/scan'
  if (canAccessInvoices(currentRole)) return '/invoices/scan'
  if (canAccessReports(currentRole)) return '/reports'
  return '/login'
}
