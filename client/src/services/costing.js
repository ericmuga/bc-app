import api from './api.js'

const params = (obj = {}) => {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v
  }
  return out
}

// `company` (FCL|CM) selects the WMS database (calibra|cml-calibra) and is sent
// as a query param on every call.
export const costingApi = {
  list:       (filter)       => api.get('/costing/rows', { params: params(filter) }),
  recipes:    (company)      => api.get('/costing/recipes',   { params: params({ company }) }),
  processes:  (company)      => api.get('/costing/processes', { params: params({ company }) }),
  columns:    ()            => api.get('/costing/columns'),
  get:        (id, company)  => api.get(`/costing/rows/${id}`, { params: params({ company }) }),
  create:     (row, company) => api.post('/costing/rows', row, { params: params({ company }) }),
  update:     (id, row, company) => api.patch(`/costing/rows/${id}`, row, { params: params({ company }) }),
  remove:     (id, company)  => api.delete(`/costing/rows/${id}`, { params: params({ company }) }),
  removeRecipe: (recipe, company) => api.delete(`/costing/recipes/${encodeURIComponent(recipe)}`, { params: params({ company }) }),
  bulkUpsert: (rows, company) => api.post('/costing/bulk-upsert', { rows }, { params: params({ company }) }),
  bulkReplace: (rows, company) => api.post('/costing/bulk-replace', { rows }, { params: params({ company }) }),
}

// Recipe templates (header + lines).
export const templatesApi = {
  list:        (filter) => api.get('/costing/templates', { params: params(filter) }),
  columns:     ()       => api.get('/costing/templates/columns'),
  get:         (no)     => api.get(`/costing/templates/${encodeURIComponent(no)}`),
  lines:       (no)     => api.get(`/costing/templates/${encodeURIComponent(no)}/lines`),
  createHeader: (row)   => api.post('/costing/templates', row),
  updateHeader: (id, row) => api.patch(`/costing/templates/${id}`, row),
  remove:      (id)     => api.delete(`/costing/templates/${id}`),
  createLine:  (row)    => api.post('/costing/templates/lines', row),
  updateLine:  (id, row) => api.patch(`/costing/templates/lines/${id}`, row),
  removeLine:  (id)     => api.delete(`/costing/templates/lines/${id}`),
  replaceLines: (no, rows) => api.post(`/costing/templates/${encodeURIComponent(no)}/lines/replace`, { rows }),
}
