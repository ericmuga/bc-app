import api from './api.js'

const clean = (obj = {}) => {
  const out = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '') out[k] = v
  return out
}

export const weeklyTargetsApi = {
  list:    (filter)      => api.get('/weekly-targets', { params: clean(filter) }),
  summary: (filter)      => api.get('/weekly-targets/summary', { params: clean(filter) }),
  months:  ()           => api.get('/weekly-targets/months'),
  columns: ()           => api.get('/weekly-targets/columns'),
  upload:  (rows, mode, replaceMonths) => api.post('/weekly-targets/upload', { rows, mode, replaceMonths }),
  split:   (body)       => api.post('/weekly-targets/split', body),
}
