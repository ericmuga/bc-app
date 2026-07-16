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
  // Assembly
  assembly:       (userId)        => api.get('/dispatch/assembly', { params: { userId: userId || undefined } }),
  assemblers:     ()             => api.get('/dispatch/assemblers'),
  returnReasons:  (company)       => api.get('/dispatch/return-reasons', { params: { company } }),
  assemblyOrder:  (id)            => api.get(`/dispatch/assembly/${id}`),
  saveAssemblyLine: (lineId, body) => api.put(`/dispatch/assembly/lines/${lineId}`, body),
  completeAssemblyPart: (id, part) => api.post(`/dispatch/assembly/${id}/complete-part`, { part }),
  // Packing
  packing:        (userId)   => api.get('/dispatch/packing', { params: { userId: userId || undefined } }),
  vesselTypes:    ()        => api.get('/dispatch/vessel-types'),
  checkers:       ()        => api.get('/dispatch/checkers'),
  packingOrder:   (id)       => api.get(`/dispatch/packing/${id}`),
  startSession:   (id, body) => api.post(`/dispatch/packing/${id}/session`, body),
  openBox:        (id, body) => api.post(`/dispatch/packing/${id}/boxes`, body),
  addBoxLine:     (boxId, body) => api.post(`/dispatch/boxes/${boxId}/lines`, body),
  removeBoxLine:  (boxLineId) => api.delete(`/dispatch/box-lines/${boxLineId}`),
  closeBox:       (boxId, body) => api.post(`/dispatch/boxes/${boxId}/close`, body),
  boxByQr:        (qr)       => api.get(`/dispatch/box-by-qr/${encodeURIComponent(qr)}`),
  completePacking: (id)      => api.post(`/dispatch/packing/${id}/complete`),
  // Loading
  vehicles:       ()        => api.get('/dispatch/vehicles'),
  loadingSessions: ()       => api.get('/dispatch/loading'),
  createLoading:  (body)     => api.post('/dispatch/loading', body),
  loadingSession: (id)       => api.get(`/dispatch/loading/${id}`),
  scanBox:        (id, qrToken) => api.post(`/dispatch/loading/${id}/scan`, { qrToken }),
  removeLoadingLine: (loadingLineId) => api.delete(`/dispatch/loading-lines/${loadingLineId}`),
  closeLoading:   (id)       => api.post(`/dispatch/loading/${id}/close`),
  // Setup + BC master data
  setupVessels:   ()        => api.get('/dispatch/setup/vessels'),
  saveVessel:     (body)     => api.post('/dispatch/setup/vessels', body),
  deleteVessel:   (id)       => api.delete(`/dispatch/setup/vessels/${id}`),
  setupVehicles:  ()        => api.get('/dispatch/setup/vehicles', { params: { all: 1 } }),
  saveVehicle:    (body)     => api.post('/dispatch/setup/vehicles', body),
  deleteVehicle:  (id)       => api.delete(`/dispatch/setup/vehicles/${id}`),
  bcRoutes:       (companies) => api.get('/dispatch/bc-routes', { params: { companies: companies?.join(',') || undefined } }),
  bcSalespersons: (companies) => api.get('/dispatch/bc-salespersons', { params: { companies: companies?.join(',') || undefined } }),
}
