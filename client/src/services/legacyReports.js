import api from './api.js'

/**
 * Reporting → Legacy Downloads API.
 * Read-only exports over the legacy Business Central databases.
 */
export const legacyReportsApi = {
  /** Registry catalogue: { sources: [{ key, label, datasets: [{ key, label, hasLines, filters }] }] } */
  sources: () => api.get('/reporting/legacy/sources'),

  /** Paginated preview. mode: 'detail' | 'summary'. filters: { dateFrom, dateTo, documentNo, vendorNo, customerNo, glAccountNo, sourceCode } */
  run: ({ source, dataset, filters = {}, page = 1, pageSize = 50, mode = 'detail' }) =>
    api.get('/reporting/legacy/run', {
      params: { source, dataset, page, pageSize, mode, ...cleanFilters(filters) },
    }),

  /** Download a full filtered export as a Blob. format: 'csv' | 'xlsx'. mode: 'detail' | 'summary' */
  download: ({ source, dataset, filters = {}, format = 'csv', mode = 'detail' }) =>
    api.get('/reporting/legacy/download', {
      params: { source, dataset, format, mode, ...cleanFilters(filters) },
      responseType: 'blob',
    }),
}

function cleanFilters(f) {
  const out = {}
  for (const [k, v] of Object.entries(f || {})) {
    if (v != null && String(v).trim() !== '') out[k] = v
  }
  return out
}
