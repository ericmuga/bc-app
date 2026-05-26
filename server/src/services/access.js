export const ROLES = {
  ADMIN: 'admin',
  SALES: 'sales',
  DISPATCH: 'dispatch',
  SECURITY: 'security',
  ANALYST: 'analyst',
  FINANCE: 'finance',
  SHOP: 'shop',
  SHOP_ADMIN: 'shop-admin',
};

export const REPORT_ROLES = [ROLES.ADMIN, ROLES.SALES, ROLES.ANALYST];
export const ORDER_ROLES = [ROLES.ADMIN, ROLES.DISPATCH];
export const INVOICE_ROLES = [ROLES.ADMIN, ROLES.SECURITY];
export const ADMIN_ROLES = [ROLES.ADMIN];
export const FINANCE_ROLES = [ROLES.ADMIN, ROLES.FINANCE, ROLES.ANALYST];
export const POS_ROLES = [ROLES.ADMIN, ROLES.SHOP_ADMIN, ROLES.SHOP];
// Manager-level POS actions: transfers, portioning, write-offs, master-data sync.
// Shop-admin sees POS setup but NOT global admin areas (users, SMTP, finance, etc.)
export const POS_MANAGER_ROLES = [ROLES.ADMIN, ROLES.SHOP_ADMIN];

export function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

export function canAccessReports(role) {
  return REPORT_ROLES.includes(normalizeRole(role));
}

export function canAccessOrders(role) {
  return ORDER_ROLES.includes(normalizeRole(role));
}

export function canAccessInvoices(role) {
  return INVOICE_ROLES.includes(normalizeRole(role));
}
