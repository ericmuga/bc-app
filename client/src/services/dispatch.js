import api from './api.js'

export const dispatchApi = {
  // Registry
  importFromBc:  (companies) => api.post('/dispatch/import', { companies }),
  confirmation:  ()          => api.get('/dispatch/confirmation'),
  getOrder:      (id)        => api.get(`/dispatch/orders/${id}`),
  confirmPart:   (id, part)  => api.post(`/dispatch/orders/${id}/confirm`, { part }),
  // Assignment
  unassigned:    ()          => api.get('/dispatch/unassigned'),
  packers:       ()          => api.get('/dispatch/packers'),
  assign:        (id, body)  => api.post(`/dispatch/orders/${id}/assign`, body),
}
