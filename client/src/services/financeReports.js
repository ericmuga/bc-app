import api from './api.js';

const csv = (arr) => arr?.join(',') || undefined;

export const financeReportsApi = {
  run: (type, f) => api.get('/finance/run', {
    params: {
      type,
      companies: csv(f.companies),
      dateFrom:  f.dateFrom,
      dateTo:    f.dateTo,
      ytdFrom:   f.ytdFrom,
      refresh:   f.refresh ? 1 : 0,
    },
  }),
  clearCache:    () => api.post('/finance/cache/clear'),
  // Configurable P&L statement
  plStatement:      (company, f) => api.get('/finance/pl', { params: { company, dateFrom: f.dateFrom, dateTo: f.dateTo, ytdFrom: f.ytdFrom, refresh: f.refresh ? 1 : 0 } }),
  plDefinition:     (company)    => api.get('/finance/pl/definition', { params: { company } }),
  // Receivables reconciliation (sub-ledger vs G/L control accounts)
  arReconSummary: (f) => api.get('/finance/ar-recon/summary', { params: { company: f.company, dateFrom: f.dateFrom, dateTo: f.dateTo, refresh: f.refresh ? 1 : 0 } }),
  arReconDetail:  (f) => api.get('/finance/ar-recon/detail',  { params: { company: f.company, account: f.account, dateFrom: f.dateFrom, dateTo: f.dateTo, scope: f.scope, refresh: f.refresh ? 1 : 0 } }),
  savePlDefinition: (company, definition) => api.put('/finance/pl/definition', { company, definition }),
  listMappings:  () => api.get('/finance/gl-mappings'),
  saveMapping:   (mapping) => mapping.mapId
    ? api.patch(`/finance/gl-mappings/${mapping.mapId}`, mapping)
    : api.post('/finance/gl-mappings', mapping),
  deleteMapping: (mapId) => api.delete(`/finance/gl-mappings/${mapId}`),
};
