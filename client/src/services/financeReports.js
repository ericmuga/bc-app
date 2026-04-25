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
  listMappings:  () => api.get('/finance/gl-mappings'),
  saveMapping:   (mapping) => mapping.mapId
    ? api.patch(`/finance/gl-mappings/${mapping.mapId}`, mapping)
    : api.post('/finance/gl-mappings', mapping),
  deleteMapping: (mapId) => api.delete(`/finance/gl-mappings/${mapId}`),
};
