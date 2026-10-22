import api from './api.js'

export const retailMtdApi = {
  summary:              (asOfDate) => api.get('/reporting/retail-mtd', { params: { asOfDate } }),
  listDimensionConfig:  (dimensionType) => api.get('/reporting/retail-mtd/dimension-config', { params: { dimensionType } }),
  saveDimensionConfig:  (payload) => payload.configId
    ? api.patch(`/reporting/retail-mtd/dimension-config/${payload.configId}`, payload)
    : api.post('/reporting/retail-mtd/dimension-config', payload),
  deleteDimensionConfig: (configId) => api.delete(`/reporting/retail-mtd/dimension-config/${configId}`),
}
