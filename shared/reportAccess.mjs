// Shared by sidebar, route guards and API authorization. Report access does not
// grant operational permissions (POS writes, warehouse jobs or costing setup).
export const SALES_REPORT_ROLES = ['admin', 'sales', 'sales-admin', 'analyst', 'finance'];
export const FINANCE_REPORT_ROLES = ['admin', 'finance', 'analyst'];
export const INVENTORY_REPORT_ROLES = ['admin', 'analyst', 'finance', 'costing', 'production'];
export const POS_REPORT_ALL_SHOPS_ROLES = ['admin', 'shop-admin', 'sales-admin', 'sales', 'analyst', 'finance'];
export const POS_REPORT_ROLES = [...POS_REPORT_ALL_SHOPS_ROLES, 'shop', 'chef'];
export const LEGACY_REPORT_ROLES = ['admin', 'analyst', 'finance', 'sales', 'sales-admin', 'costing', 'production'];
export const hasReportRole = (role, roles) => roles.includes(String(role || '').trim().toLowerCase());

export const REPORT_GROUPS = [
  { key: 'sales', label: 'Sales', reports: [
    { path: '/reports', label: 'Order & Invoice Summaries', icon: 'pi pi-chart-bar', roles: SALES_REPORT_ROLES },
    { path: '/bc-reports', label: 'Sales Reports', icon: 'pi pi-database', roles: SALES_REPORT_ROLES },
    { path: '/pos/reports', label: 'POS Reports', icon: 'pi pi-shopping-cart', roles: POS_REPORT_ROLES },
    { path: '/weekly-targets', label: 'Sales Targets', icon: 'pi pi-bullseye', roles: ['admin', 'sales', 'sales-admin'] },
  ] },
  { key: 'finance', label: 'Finance', reports: [
    { path: '/finance', label: 'Finance Reports', icon: 'pi pi-money-bill', roles: FINANCE_REPORT_ROLES },
  ] },
  { key: 'costing', label: 'Costing', reports: [
    { path: '/costing', label: 'Recipe Data (FCL)', icon: 'pi pi-calculator', roles: ['admin', 'costing'] },
    { path: '/costing/cm', label: 'Recipe Data (CM)', icon: 'pi pi-calculator', roles: ['admin', 'costing'] },
    { path: '/costing/templates', label: 'Templates', icon: 'pi pi-clone', roles: ['admin', 'costing'] },
  ] },
  { key: 'inventory', label: 'Inventory', reports: [
    { path: '/reporting/inventory', label: 'Inventory Analytics', icon: 'pi pi-chart-bar', roles: INVENTORY_REPORT_ROLES },
    { path: '/reporting/stock-position', label: 'Stock Position', icon: 'pi pi-box', roles: INVENTORY_REPORT_ROLES },
    { path: '/pos/stock-report', label: 'POS Stock Movements', icon: 'pi pi-chart-line', roles: ['admin', 'shop-admin', 'sales-admin', 'shop'] },
  ] },
  { key: 'production', label: 'Production', reports: [
    { path: '/pos/chef-reports', label: 'Kitchen Reports', icon: 'pi pi-chart-bar', roles: ['admin', 'shop-admin', 'sales-admin', 'chef'] },
  ] },
  { key: 'downloads', label: 'Downloads & Data', reports: [
    { path: '/reporting/legacy', label: 'Legacy Downloads', icon: 'pi pi-download', roles: LEGACY_REPORT_ROLES },
    { path: '/reporting/warehouse-sync', label: 'Warehouse Sync', icon: 'pi pi-server', roles: ['admin', 'analyst'] },
  ] },
];

export function reportGroupsForRole(role) {
  return REPORT_GROUPS.map(group => ({ ...group,
    reports: group.reports.filter(report => hasReportRole(role, report.roles)),
  })).filter(group => group.reports.length);
}

export const LEGACY_DATASET_ROLES = {
  postedSalesInvoices: SALES_REPORT_ROLES,
  postedSalesCreditMemos: SALES_REPORT_ROLES,
  postedPurchaseInvoices: ['admin', 'analyst', 'finance', 'costing'],
  postedPurchaseReceipts: ['admin', 'analyst', 'finance', 'costing', 'production'],
  glEntries: FINANCE_REPORT_ROLES,
  valueEntries: ['admin', 'analyst', 'finance', 'costing'],
  itemLedgerEntries: INVENTORY_REPORT_ROLES,
  slaughterData: ['admin', 'analyst', 'finance', 'costing', 'production'],
};
export const canReadLegacyDataset = (role, dataset) => hasReportRole(role, LEGACY_DATASET_ROLES[dataset] || []);
