import api from './api.js'

export const dispatchApi = {
  // Registry
  importFromBc:  (companies) => api.post('/dispatch/import', { companies }),
  registryCompanies: ()      => api.get('/dispatch/registry-companies'),
  confirmation:  (companies) => api.get('/dispatch/confirmation', { params: { companies: companies?.join(',') || undefined } }),
  confirmationReport: (companies) => api.get('/dispatch/confirmations/report', { params: { companies: companies?.join(',') || undefined } }),
  getOrder:      (id)        => api.get(`/dispatch/orders/${id}`),
  confirmPart:   (id, part)  => api.post(`/dispatch/orders/${id}/confirm`, { part }),
  getUserCompanies: (userId) => api.get(`/dispatch/users/${userId}/companies`),
  setUserCompanies: (userId, companies) => api.put(`/dispatch/users/${userId}/companies`, { companies }),
  // Assignment
  unassigned:    ()          => api.get('/dispatch/unassigned'),
  packers:       ()          => api.get('/dispatch/packers'),
  assign:        (id, body)  => api.post(`/dispatch/orders/${id}/assign`, body),
}
