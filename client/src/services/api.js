import axios from 'axios'
import { useAuthStore } from '@/stores/auth.js'
import { useCompanyStore } from '@/stores/company.js'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const auth    = useAuthStore()
  const company = useCompanyStore()

  if (auth.token) config.headers.Authorization = `Bearer ${auth.token}`
  if (company.currentCompanyId) config.headers['X-Company-ID'] = company.currentCompanyId

  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore().logout()
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ── Companies ─────────────────────────────────────────────────────────────────
export const companiesApi = {
  list:   ()       => api.get('/companies'),
  create: (payload) => api.post('/companies', payload),
}

// ── Orders ────────────────────────────────────────────────────────────────────
export const ordersApi = {
  list:    (params) => api.get('/orders', { params }),
  get:     (no)     => api.get(`/orders/${no}`),
  confirm: (no)     => api.post(`/orders/${no}/confirm`),
  audit:   (no)     => api.get(`/orders/${no}/audit`),
  summary: (params) => api.get('/orders/summary', { params }),
}

// ── Invoices ──────────────────────────────────────────────────────────────────
export const invoicesApi = {
  list:    (params) => api.get('/invoices', { params }),
  get:     (no)     => api.get(`/invoices/${no}`),
  confirm: (no)     => api.post(`/invoices/${no}/confirm`),
  audit:   (no)     => api.get(`/invoices/${no}/audit`),
  summary: (params) => api.get('/invoices/summary', { params }),
}

export default api
