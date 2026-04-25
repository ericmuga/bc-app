import api from './api.js';

const csv = (arr) => arr?.join(',') || undefined;
const classifierParams = (refresh, filters = {}) => ({
  refresh: refresh ? 1 : 0,
  thirdParty: filters.thirdParty ?? '',
  byProduct: filters.byProduct ?? '',
})

export const bcReportsApi = {
  companies:          ()          => api.get('/bc-reports/companies'),
  postingGroups:      (companies) => api.get('/bc-reports/posting-groups',  { params: { companies: csv(companies) } }),
  sectors:            (companies) => api.get('/bc-reports/sectors',          { params: { companies: csv(companies) } }),
  genBusPGs:          (companies) => api.get('/bc-reports/gen-bus-pgs',      { params: { companies: csv(companies) } }),
  salespersons:       (companies, refresh = false, filters = {}) => api.get('/bc-reports/salespersons', { params: { companies: csv(companies), ...classifierParams(refresh, filters) } }),
  routes:             (companies, refresh = false, filters = {}) => api.get('/bc-reports/routes',       { params: { companies: csv(companies), ...classifierParams(refresh, filters) } }),
  customers:          (companies, refresh = false, filters = {}) => api.get('/bc-reports/customers',    { params: { companies: csv(companies), ...classifierParams(refresh, filters) } }),
  items:              (companies, refresh = false, filters = {}) => api.get('/bc-reports/items',        { params: { companies: csv(companies), ...classifierParams(refresh, filters) } }),
  downloadDataset:    (kind, companies, refresh = false) => api.get('/bc-reports/downloads', { params: { kind, companies: csv(companies), refresh: refresh ? 1 : 0 } }),
  clearCache:         () => api.post('/bc-reports/cache/clear'),

  customerAging: (f, refresh = false) => api.get('/bc-reports/customer-aging', {
    params: {
      asOfDate:  f.asOfDate,
      companies: f.companies?.join(',') || undefined,
      refresh:   refresh ? 1 : 0,
    },
  }),

  listCustPgMappings:  ()        => api.get('/bc-reports/cust-pg-mappings'),
  saveCustPgMapping:   (data)    => data.mapId
    ? api.patch(`/bc-reports/cust-pg-mappings/${data.mapId}`, data)
    : api.post('/bc-reports/cust-pg-mappings', data),
  deleteCustPgMapping: (mapId)   => api.delete(`/bc-reports/cust-pg-mappings/${mapId}`),

  blankRouteLines: (f) => api.get('/bc-reports/blank-route-lines', {
    params: {
      dateFrom:         f.dateFrom,
      dateTo:           f.dateTo,
      companies:        csv(f.companies),
      docTypes:         csv(f.docTypes),
      thirdParty:       f.thirdParty ?? '',
      byProduct:        f.byProduct ?? '',
      genBusMode:       f.genBusMode || 'all',
      customerNos:      csv(f.customerNos),
      itemNos:          csv(f.itemNos),
      salespersonCodes: csv(f.salespersonCodes),
      refresh:          f.refresh ? 1 : 0,
    },
  }),

  run: (type, f) => api.get('/bc-reports/run', {
    params: {
      type,
      dimension:        f.dimension,
      dateFrom:         f.dateFrom,
      dateTo:           f.dateTo,
      companies:        csv(f.companies),
      docTypes:         csv(f.docTypes),
      compareFrom:      f.compareFrom || f.dateFrom,
      compareTo:        f.compareTo   || f.dateTo,
      withFrom:         f.withFrom    || f.dateFrom,
      withTo:           f.withTo      || f.dateTo,
      postingGroupKey:  f.postingGroupKey || '',
      thirdParty:  f.thirdParty ?? '',
      byProduct:   f.byProduct ?? '',
      genBusMode:  f.genBusMode || 'all',
      sectorCodes: csv(f.sectorCodes),
      customerNos: csv(f.customerNos),
      itemNos:     csv(f.itemNos),
      salespersonCodes: csv(f.salespersonCodes),
      routeCodes:  csv(f.routeCodes),
      refresh:     f.refresh ? 1 : 0,
    },
  }),
};
