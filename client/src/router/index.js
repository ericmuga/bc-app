import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { canAccessInvoices, canAccessOrders, canAccessReports, defaultRouteForRole, normalizeRole, ROLES } from '@/lib/access.js'
import { canAccessFinance, FINANCE_ROLE } from '@/lib/financeAccess.js'

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/pages/LoginPage.vue'), meta: { public: true } },

  {
    path: '/',
    component: () => import('@/components/base/AppShell.vue'),
    children: [
      { path: '', redirect: () => defaultRouteForRole(useAuthStore().user?.role) },
      { path: 'orders/scan',    name: 'OrderScan',    component: () => import('@/pages/OrderScanPage.vue'), meta: { roles: [ROLES.ADMIN, ROLES.DISPATCH] } },
      { path: 'orders',         name: 'Orders',       component: () => import('@/pages/OrdersListPage.vue'), meta: { roles: [ROLES.ADMIN, ROLES.DISPATCH] } },
      { path: 'invoices/scan',  name: 'InvoiceScan',  component: () => import('@/pages/InvoiceScanPage.vue'), meta: { roles: [ROLES.ADMIN, ROLES.SECURITY] } },
      { path: 'invoices',       name: 'Invoices',     component: () => import('@/pages/InvoicesListPage.vue'), meta: { roles: [ROLES.ADMIN, ROLES.SECURITY] } },
      { path: 'reports',        name: 'Reports',      component: () => import('@/pages/ReportsPage.vue'), meta: { roles: [ROLES.ADMIN, ROLES.SALES, ROLES.ANALYST] } },
      { path: 'bc-reports',     name: 'BcReports',    component: () => import('@/pages/BcReportsPage.vue'), meta: { roles: [ROLES.ADMIN, ROLES.SALES, ROLES.ANALYST] } },
      { path: 'finance',        name: 'Finance',      component: () => import('@/pages/FinanceReportsPage.vue'), meta: { roles: [ROLES.ADMIN, ROLES.ANALYST, FINANCE_ROLE] } },
      { path: 'admin/setup',    name: 'AdminSetup',   component: () => import('@/pages/AdminSetupPage.vue'), meta: { roles: [ROLES.ADMIN] } },
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
    const role = normalizeRole(auth.user?.role)
    if (!to.meta.roles.includes(role)) {
      if (canAccessOrders(role)) return '/orders/scan'
      if (canAccessInvoices(role)) return '/invoices/scan'
      if (canAccessReports(role)) return '/reports'
      if (canAccessFinance(role)) return '/finance'
      return '/login'
    }
  }
})

export default router
