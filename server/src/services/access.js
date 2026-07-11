export const ROLES = {
  ADMIN: 'admin',
  SALES: 'sales',
  DISPATCH: 'dispatch',
  SECURITY: 'security',
  ANALYST: 'analyst',
  FINANCE: 'finance',
  SHOP: 'shop',
  SHOP_ADMIN: 'shop-admin',
  COSTING: 'costing',
  PRODUCTION: 'production',
  // Dispatch / pick-and-pack fulfilment (distinct from DISPATCH which is BC order scanning)
  DISPATCH_REGISTRY: 'dispatch-registry',
  DISPATCH_SUPERVISOR: 'dispatch-supervisor',
  PACKER: 'packer',
  CHECKER: 'checker',
  LOADER: 'loader',
};

export const REPORT_ROLES = [ROLES.ADMIN, ROLES.SALES, ROLES.ANALYST];
export const ORDER_ROLES = [ROLES.ADMIN, ROLES.DISPATCH];
export const INVOICE_ROLES = [ROLES.ADMIN, ROLES.SECURITY];
export const ADMIN_ROLES = [ROLES.ADMIN];
export const FINANCE_ROLES = [ROLES.ADMIN, ROLES.FINANCE, ROLES.ANALYST];
export const POS_ROLES = [ROLES.ADMIN, ROLES.SHOP_ADMIN, ROLES.SHOP];
export const COSTING_ROLES = [ROLES.ADMIN, ROLES.COSTING];
export const PRODUCTION_ROLES = [ROLES.ADMIN, ROLES.PRODUCTION, ROLES.ANALYST];
// Manager-level POS actions: transfers, portioning, write-offs, master-data sync.
// Shop-admin sees POS setup but NOT global admin areas (users, SMTP, finance, etc.)
export const POS_MANAGER_ROLES = [ROLES.ADMIN, ROLES.SHOP_ADMIN];

// ── Dispatch / pick-and-pack fulfilment ─────────────────────────────────────
// Module access (any dispatch role) + per-stage guards.
export const DISPATCH_ROLES = [
  ROLES.ADMIN, ROLES.DISPATCH_SUPERVISOR, ROLES.DISPATCH_REGISTRY,
  ROLES.PACKER, ROLES.CHECKER, ROLES.LOADER,
];
export const DISPATCH_SUPERVISOR_ROLES = [ROLES.ADMIN, ROLES.DISPATCH_SUPERVISOR];
export const DISPATCH_REGISTRY_ROLES   = [ROLES.ADMIN, ROLES.DISPATCH_SUPERVISOR, ROLES.DISPATCH_REGISTRY];
export const DISPATCH_ASSEMBLE_ROLES   = [ROLES.ADMIN, ROLES.DISPATCH_SUPERVISOR, ROLES.PACKER];
export const DISPATCH_PACK_ROLES       = [ROLES.ADMIN, ROLES.DISPATCH_SUPERVISOR, ROLES.PACKER, ROLES.CHECKER];
export const DISPATCH_LOAD_ROLES       = [ROLES.ADMIN, ROLES.DISPATCH_SUPERVISOR, ROLES.LOADER];

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

export function canAccessDispatch(role) {
  return DISPATCH_ROLES.includes(normalizeRole(role));
}
