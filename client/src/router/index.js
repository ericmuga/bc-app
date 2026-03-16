import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/pages/LoginPage.vue'), meta: { public: true } },

  {
    path: '/',
    component: () => import('@/components/base/AppShell.vue'),
    children: [
      { path: '',          redirect: '/orders/scan' },
      { path: 'orders/scan',    name: 'OrderScan',    component: () => import('@/pages/OrderScanPage.vue') },
      { path: 'orders',         name: 'Orders',       component: () => import('@/pages/OrdersListPage.vue') },
      { path: 'invoices/scan',  name: 'InvoiceScan',  component: () => import('@/pages/InvoiceScanPage.vue') },
      { path: 'invoices',       name: 'Invoices',     component: () => import('@/pages/InvoicesListPage.vue') },
      { path: 'reports',        name: 'Reports',      component: () => import('@/pages/ReportsPage.vue') },
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
})

export default router
