import api from './api.js';

const csv = (arr) => arr?.join(',') || undefined;

export const bcReportsApi = {
  companies:          ()          => api.get('/bc-reports/companies'),
  postingGroups:      (companies) => api.get('/bc-reports/posting-groups',  { params: { companies: csv(companies) } }),
  sectors:            (companies) => api.get('/bc-reports/sectors',          { params: { companies: csv(companies) } }),
  genBusPGs:          (companies) => api.get('/bc-reports/gen-bus-pgs',      { params: { companies: csv(companies) } }),
  salespersons:       (companies) => api.get('/bc-reports/salespersons',     { params: { companies: csv(companies) } }),
  routes:             (companies) => api.get('/bc-reports/routes',           { params: { companies: csv(companies) } }),

  run: (type, f) => api.get('/bc-reports/run', {
    params: {
      type,
      dimension:   f.dimension,
      dateFrom:    f.dateFrom,
      dateTo:      f.dateTo,
      companies:   csv(f.companies),
      docTypes:    csv(f.docTypes),
      daysOfWeek:  csv(f.daysOfWeek),
      thirdParty:  f.thirdParty ?? '',
      genBusMode:  f.genBusMode || 'all',
      customerQuery: f.customerQuery || '',
      itemQuery:     f.itemQuery || '',
    },
  }),
};
