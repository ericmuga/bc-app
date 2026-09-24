import api from './api.js'

/**
 * Reporting → Warehouse Sync Center API.
 * Read-only monitoring of the FCLWHS data-warehouse ETL (SQL Agent jobs +
 * refresh procedures + fact freshness), plus a guarded "Run now" for a job.
 */
export const warehouseApi = {
  jobs:       ()            => api.get('/reporting/warehouse/jobs'),
  jobHistory: (name, limit = 25) =>
                 api.get(`/reporting/warehouse/jobs/${encodeURIComponent(name)}/history`, { params: { limit } }),
  procedures: ()            => api.get('/reporting/warehouse/procedures'),
  facts:      ()            => api.get('/reporting/warehouse/facts'),
  downloadEtl: ()           => api.get('/reporting/warehouse/download-etl'),
  runJob:     (name)        => api.post(`/reporting/warehouse/jobs/${encodeURIComponent(name)}/run`),

  // Inventory analytics (item-ledger fact)
  invDimensions: ()         => api.get('/reporting/warehouse/inventory/dimensions'),
  invItems:      (company)  => api.get('/reporting/warehouse/inventory/items', { params: company ? { company } : {} }),
  invStockCard:  (body)     => api.post('/reporting/warehouse/inventory/stock-card', body),
  invReport:     (body)     => api.post('/reporting/warehouse/inventory/report', body),
}
