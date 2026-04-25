import api from './api.js';

export const mgmtApi = {
  // GL Accounts for dropdowns (from BC DB, read-only)
  listAccounts: (company) => api.get('/mgmt/accounts', { params: company ? { company } : {} }),

  // Dimension values for a given dimension code (e.g. DEPARTMENT, PROJECT)
  listDimensionValues: (dimensionCode) => api.get('/mgmt/dimension-values', { params: { dimensionCode } }),

  // Account-level drill-down for a single data line
  lineDetail: (templateId, lineCode, dateFrom, dateTo, dim1Code = '', dim2Code = '') =>
    api.get('/mgmt/line-detail', { params: { templateId, lineCode, dateFrom, dateTo, dim1Code, dim2Code } }),

  // Report execution
  run: (templateId, dateFrom, dateTo, refresh, dim1Code = '', dim2Code = '') =>
    api.get('/mgmt/run', { params: { templateId, dateFrom, dateTo, refresh: refresh ? 1 : 0, dim1Code, dim2Code } }),

  // Templates
  listTemplates:  ()  => api.get('/mgmt/templates'),
  saveTemplate:   (t) => t.templateId
    ? api.patch(`/mgmt/templates/${t.templateId}`, t)
    : api.post('/mgmt/templates', t),
  deleteTemplate: (id) => api.delete(`/mgmt/templates/${id}`),

  // Lines
  listLines:  (templateId)       => api.get(`/mgmt/templates/${templateId}/lines`),
  saveLine:   (templateId, line) => line.lineId
    ? api.patch(`/mgmt/templates/${templateId}/lines/${line.lineId}`, line)
    : api.post(`/mgmt/templates/${templateId}/lines`, line),
  deleteLine: (templateId, lineId) => api.delete(`/mgmt/templates/${templateId}/lines/${lineId}`),

  // Formulas
  listFormulas:  (lineId)            => api.get(`/mgmt/lines/${lineId}/formulas`),
  saveFormula:   (lineId, formula)   => formula.formulaId
    ? api.patch(`/mgmt/lines/${lineId}/formulas/${formula.formulaId}`, formula)
    : api.post(`/mgmt/lines/${lineId}/formulas`, formula),
  deleteFormula: (lineId, formulaId) => api.delete(`/mgmt/lines/${lineId}/formulas/${formulaId}`),

  // Measures
  listMeasures:  (templateId)          => api.get(`/mgmt/templates/${templateId}/measures`),
  saveMeasure:   (templateId, measure) => measure.measureId
    ? api.patch(`/mgmt/templates/${templateId}/measures/${measure.measureId}`, measure)
    : api.post(`/mgmt/templates/${templateId}/measures`, measure),
  deleteMeasure: (templateId, measureId) => api.delete(`/mgmt/templates/${templateId}/measures/${measureId}`),
};
