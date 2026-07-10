import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { canAccessInvoices, canAccessOrders, canAccessReports, normalizeRole, ROLES } from '@/lib/access.js'
import { canAccessFinance, FINANCE_ROLE } from '@/lib/financeAccess.js'
import { canAccessPos, POS_ROLE, SHOP_ADMIN_ROLE } from '@/lib/posAccess.js'
import { canAccessCosting, COSTING_ROLE } from '@/lib/costingAccess.js'

// Local replacement for the lib/access.js default-route helper, which is missing
// the POS / Finance fall-throughs (so shop-admin / shop / finance roles get
// bounced to /login from the home redirect). Keeping it here avoids editing
// access.js, whose folder is owned by a different account on this host.
function defaultRouteForRole(role) {
  const r = normalizeRole(role)
  if (canAccessOrders(r))   return '/orders/scan'
  if (canAccessInvoices(r)) return '/invoices/scan'
  if (canAccessReports(r))  return '/reports'
  if (canAccessFinance(r))  return '/finance'
  if (canAccessPos(r))      return '/pos'
  if (canAccessCosting(r))  return '/costing'
  return '/login'
}

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/pages/LoginPage.vue'), meta: { public: true } },

  {
    path: '/',
    component: () => import('@/components/base/AppShell.vue'),
    children: [
      { path: '', redirect: () => defaultRouteForRole(useAuthStore().effectiveRole) },
      { path: 'orders/scan',    name: 'OrderScan',    component: () => import('@/pages/OrderScanPage.vue'), meta: { roles: [ROLES.ADMIN, ROLES.DISPATCH] } },
      { path: 'orders',         name: 'Orders',       component: () => import('@/pages/OrdersListPage.vue'), meta: { roles: [ROLES.ADMIN, ROLES.DISPATCH] } },
      { path: 'invoices/scan',  name: 'InvoiceScan',  component: () => import('@/pages/InvoiceScanPage.vue'), meta: { roles: [ROLES.ADMIN, ROLES.SECURITY] } },
      { path: 'invoices',       name: 'Invoices',     component: () => import('@/pages/InvoicesListPage.vue'), meta: { roles: [ROLES.ADMIN, ROLES.SECURITY] } },
      { path: 'reports',        name: 'Reports',      component: () => import('@/pages/ReportsPage.vue'), meta: { roles: [ROLES.ADMIN, ROLES.SALES, ROLES.ANALYST] } },
      { path: 'bc-reports',     name: 'BcReports',    component: () => import('@/pages/BcReportsPage.vue'), meta: { roles: [ROLES.ADMIN, ROLES.SALES, ROLES.ANALYST] } },
      { path: 'finance',        name: 'Finance',      component: () => import('@/pages/FinanceReportsPage.vue'), meta: { roles: [ROLES.ADMIN, ROLES.ANALYST, FINANCE_ROLE] } },
      { path: 'costing',        name: 'Costing',      component: () => import('@/pages/CostingPage.vue'), props: { company: 'FCL' }, meta: { roles: [ROLES.ADMIN, COSTING_ROLE] } },
      { path: 'costing/cm',     name: 'CostingCM',    component: () => import('@/pages/CostingPage.vue'), props: { company: 'CM' }, meta: { roles: [ROLES.ADMIN, COSTING_ROLE] } },
      { path: 'costing/templates', name: 'CostingTemplates', component: () => import('@/pages/CostingTemplatesPage.vue'), meta: { roles: [ROLES.ADMIN, COSTING_ROLE] } },
      { path: 'pos',            name: 'Pos',          component: () => import('@/pages/PosPage.vue'), meta: { roles: [ROLES.ADMIN, SHOP_ADMIN_ROLE, POS_ROLE] } },
      { path: 'pos/orders',     name: 'PosOrders',    component: () => import('@/pages/PosOrdersPage.vue'), meta: { roles: [ROLES.ADMIN, SHOP_ADMIN_ROLE, POS_ROLE] } },
      { path: 'pos/stock-requests', name: 'StockRequests', component: () => import('@/pages/StockRequestsPage.vue'), meta: { roles: [ROLES.ADMIN, SHOP_ADMIN_ROLE, POS_ROLE] } },
      { path: 'pos/stock-report',   name: 'StockReport',   component: () => import('@/pages/StockMovementsReportPage.vue'), meta: { roles: [ROLES.ADMIN, SHOP_ADMIN_ROLE, POS_ROLE] } },
      { path: 'pos/stock-take',     name: 'StockTake',     component: () => import('@/pages/StockTakePage.vue'), meta: { roles: [ROLES.ADMIN, SHOP_ADMIN_ROLE, POS_ROLE] } },
      { path: 'pos/till',           name: 'PosTill',       component: () => import('@/pages/TillPage.vue'), meta: { roles: [ROLES.ADMIN, SHOP_ADMIN_ROLE, POS_ROLE] } },
      { path: 'pos/yield',          name: 'PosYield',      component: () => import('@/pages/YieldPage.vue'), meta: { roles: [ROLES.ADMIN, SHOP_ADMIN_ROLE, POS_ROLE] } },
      { path: 'pos/targets',        name: 'PosTargets',    component: () => import('@/pages/TargetsPage.vue'), meta: { roles: [ROLES.ADMIN, SHOP_ADMIN_ROLE] } },
      { path: 'pos/coupons',        name: 'PosCoupons',    component: () => import('@/pages/CouponsPage.vue'),    meta: { roles: [ROLES.ADMIN, SHOP_ADMIN_ROLE] } },
      { path: 'pos/mpesa-matching', name: 'MpesaMatching', component: () => import('@/pages/MpesaMatchingPage.vue'), meta: { roles: [ROLES.ADMIN, SHOP_ADMIN_ROLE] } },
      { path: 'releases',       name: 'Releases',     component: () => import('@/pages/ReleasesPage.vue') },
      { path: 'pos/reports',        name: 'PosReports',    component: () => import('@/pages/PosReportsPage.vue'), meta: { roles: [ROLES.ADMIN, SHOP_ADMIN_ROLE, POS_ROLE] } },
      { path: 'pos/help',           name: 'PosHelp',       component: () => import('@/pages/HelpPage.vue'),       meta: { roles: [ROLES.ADMIN, SHOP_ADMIN_ROLE, POS_ROLE] } },
      { path: 'admin/setup',          name: 'AdminSetup',    component: () => import('@/pages/AdminSetupPage.vue'),    meta: { roles: [ROLES.ADMIN, SHOP_ADMIN_ROLE] } },
      { path: 'admin/audit',          name: 'AuditLog',      component: () => import('@/pages/AuditLogPage.vue'),      meta: { roles: [ROLES.ADMIN, SHOP_ADMIN_ROLE] } },
      { path: 'admin/cashier-shops',  name: 'CashierShops',  component: () => import('@/pages/CashierShopsPage.vue'),  meta: { roles: [ROLES.ADMIN, SHOP_ADMIN_ROLE] } },
    ]
  },

  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isLoggedIn) return '/login'
  if (to.meta.roles?.length) {
    // Use effectiveRole so admin's UI-preview impersonation is honoured. A
    // real admin sees what the chosen role would see; non-admin users have
    // no impersonation and so effectiveRole === actualRole.
    const role = normalizeRole(auth.effectiveRole)
    if (!to.meta.roles.includes(role)) {
      if (canAccessOrders(role)) return '/orders/scan'
      if (canAccessInvoices(role)) return '/invoices/scan'
      if (canAccessReports(role)) return '/reports'
      if (canAccessFinance(role)) return '/finance'
      if (canAccessPos(role)) return '/pos'
      if (canAccessCosting(role)) return '/costing'
      return '/login'
    }
  }
})

export default router
