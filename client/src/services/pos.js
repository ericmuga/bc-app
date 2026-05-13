import api from './api.js'

// Admin shop selector — when admin picks a shop, the choice is sent on every
// POS request via X-Shop-Code so the backend scopes data correctly.
let adminShopCode = ''
try { adminShopCode = localStorage.getItem('adminShopCode') || '' } catch {}
api.interceptors.request.use((cfg) => {
  if (adminShopCode && cfg.url?.startsWith('/pos')) {
    cfg.headers = cfg.headers || {}
    cfg.headers['X-Shop-Code'] = adminShopCode
  }
  return cfg
})
export function setAdminShopCode(code) {
  adminShopCode = String(code || '').trim().toUpperCase()
  try { localStorage.setItem('adminShopCode', adminShopCode) } catch {}
}
export function getAdminShopCode() { return adminShopCode }

// ── Daily sales targets (shop-admin) ──────────────────────────────────────────
export const targetsApi = {
  list:        (params)   => api.get('/pos/targets',             { params }),
  save:        (body)     => api.post('/pos/targets',            body),
  remove:      (targetId) => api.delete(`/pos/targets/${targetId}`),
  uploadBatch: (body)     => api.post('/pos/targets/batch',      body),
  copy:        (body)     => api.post('/pos/targets/copy',       body),
  achievement: (params)   => api.get('/pos/targets/achievement', { params }),
}

// ── POS Reports hub ───────────────────────────────────────────────────────────
export const posReportsApi = {
  stockPosition:    (params) => api.get('/pos/reports/stock-position',    { params }),
  salesByItem:      (params) => api.get('/pos/reports/sales-by-item',     { params }),
  salesByContact:   (params) => api.get('/pos/reports/sales-by-contact',  { params }),
  shopComparison:   (params) => api.get('/pos/reports/shop-comparison',   { params }),
  cashMovement:     (params) => api.get('/pos/reports/cash-movement',     { params }),
  // CSV variants — same endpoints with format=csv
  csv: (kind, params)        => api.get(`/pos/reports/${kind}`,
                                         { params: { ...params, format: 'csv' }, responseType: 'blob' }),
}

// ── Coupons (admin / shop-admin) ──────────────────────────────────────────────
export const couponApi = {
  list:      (params)        => api.get('/pos/coupons',                 { params }),
  get:       (code)          => api.get(`/pos/coupons/${encodeURIComponent(code)}`),
  ledger:    (code)          => api.get(`/pos/coupons/${encodeURIComponent(code)}/ledger`),
  issue:     (body)          => api.post('/pos/coupons',                body),
  redeem:    (code, body)    => api.post(`/pos/coupons/${encodeURIComponent(code)}/redeem`, body),
  void:      (code, body={}) => api.post(`/pos/coupons/${encodeURIComponent(code)}/void`,   body),
  pdfUrl:    (code)          => `/api/pos/coupons/${encodeURIComponent(code)}/pdf`,
  pdfBlob:   (code)          => api.get(`/pos/coupons/${encodeURIComponent(code)}/pdf`,
                                        { responseType: 'blob' }),
  email:     (code, body)    => api.post(`/pos/coupons/${encodeURIComponent(code)}/email`,  body),
}

// ── Audit log (admin / shop-admin only) ───────────────────────────────────────
export const auditApi = {
  list:      (params)  => api.get('/audit',         { params }),
  byUser:    (params)  => api.get('/audit/by-user', { params }),
  exportCsv: (params)  => api.get('/audit.csv',     { params, responseType: 'blob' }),
}

// ── POS terminal ──────────────────────────────────────────────────────────────
export const posApi = {
  getItems:       ()           => api.get('/pos/items'),
  getPaymentTypes:()           => api.get('/pos/payment-types'),
  getMyShop:      ()           => api.get('/pos/my-shop'),
  listContacts:   ()           => api.get('/pos/contacts'),
  createContact:  (body)       => api.post('/pos/contacts', body),
  getWalkIn:      ()           => api.get('/pos/walk-in'),
  setContact:     (id, contact)=> api.patch(`/pos/orders/${id}/contact`, contact),
  createOrder:    ()           => api.post('/pos/orders'),
  listOrders:     ()           => api.get('/pos/orders'),
  getOrder:       (id)         => api.get(`/pos/orders/${id}`),
  setLines:       (id, lines)  => api.put(`/pos/orders/${id}/lines`, { lines }),
  checkout:       (id, payload)=> api.post(`/pos/orders/${id}/checkout`, payload),
  checkoutMulti:  (id, body)   => api.post(`/pos/orders/${id}/checkout-multi`, body),
  completeOrder:  (id)         => api.post(`/pos/orders/${id}/complete`),
  cancelOrder:    (id)         => api.post(`/pos/orders/${id}/cancel`),
  saveCart:       (id, label)  => api.post(`/pos/orders/${id}/save`,   { label }),
  resumeCart:     (id)         => api.post(`/pos/orders/${id}/resume`),
  confirmPayment: (pid, ref)   => api.post(`/pos/payments/${pid}/confirm`, { reference: ref }),
  reprintOrder:   (id)         => api.post(`/pos/orders/${id}/reprint`),
  signOrder:      (id)         => api.post(`/pos/orders/${id}/sign`),
  etimsPreview:   (id)         => api.get(`/pos/orders/${id}/etims-preview`),
  fetchPdf:       (id)         => api.get(`/pos/orders/${id}/pdf`, { responseType: 'blob' }),
  printConfirmation: (id)      => api.post(`/pos/orders/${id}/print-confirmation`),
  // Preview-only: generate confirmation PDF then fetch it as a blob (no hardware print yet)
  fetchConfirmationPreview: async (id) => {
    await api.post(`/pos/orders/${id}/print-confirmation?preview=1`)
    return api.get(`/pos/orders/${id}/pdf`, { responseType: 'blob' })
  },
  stkPush:        (id, body)   => api.post(`/pos/orders/${id}/stk-push`, body),
  fetchPayments:  (params)     => api.get('/pos/payments/fetch', { params }),
  // shops + favourites + price list
  listShops:      ()           => api.get('/pos/shops'),
  listFavourites: ()           => api.get('/pos/favourites'),
  addFavourite:   (itemNo)     => api.post('/pos/favourites', { itemNo }),
  removeFavourite:(itemNo)     => api.delete(`/pos/favourites/${itemNo}`),
  fetchPriceList: ()           => api.get('/pos/price-list/pdf', { responseType: 'blob' }),
}

// ── Yield (third-party transfers, portioning, write-offs, report) ──────────
export const yieldApi = {
  // Third parties
  listThirdParties: ()              => api.get('/pos/third-parties'),
  saveThirdParty:   (body)          => body.thirdPartyId
    ? api.patch(`/pos/third-parties/${body.thirdPartyId}`, body)
    : api.post('/pos/third-parties', body),
  deleteThirdParty: (id)            => api.delete(`/pos/third-parties/${id}`),

  // Transfers
  listTransfers:    ()              => api.get('/pos/transfers'),
  createTransfer:   (body)          => api.post('/pos/transfers', body),
  getTransfer:      (id)            => api.get(`/pos/transfers/${id}`),
  setTransferLines: (id, lines)     => api.put(`/pos/transfers/${id}/lines`, { lines }),
  postTransfer:     (id)            => api.post(`/pos/transfers/${id}/post`),

  // Portionings
  listPortionings:  ()              => api.get('/pos/portionings'),
  createPortioning: (body)          => api.post('/pos/portionings', body),
  getPortioning:    (id)            => api.get(`/pos/portionings/${id}`),
  setPortioningLines: (id, lines)   => api.put(`/pos/portionings/${id}/lines`, { lines }),
  postPortioning:   (id)            => api.post(`/pos/portionings/${id}/post`),

  // Write-offs
  listWriteOffs:    (params)        => api.get('/pos/write-offs', { params }),
  postWriteOff:     (body)          => api.post('/pos/write-offs', body),

  // Manual sales (portions sold outside the POS terminal)
  listManualSales:       (params)   => api.get('/pos/manual-sales', { params }),
  recordManualSale:      (body)     => api.post('/pos/manual-sales', body),
  recordManualSaleBatch: (body)     => api.post('/pos/manual-sales/batch', body),

  // Report
  report:           (params)        => api.get('/pos/reports/yield', { params }),

  // CSV export — kind ∈ transfers | portionings | manual-sales | write-offs
  // params: { dateFrom, dateTo, itemNo, q }
  exportCsv:        (kind, params)  => api.get(`/pos/exports/${kind}`, { params, responseType: 'blob' }),
}

// ── Till (cash sessions, transactions, cash report) ────────────────────────
export const tillApi = {
  current:        ()                            => api.get('/pos/till/current'),
  listSessions:   ()                            => api.get('/pos/till/sessions'),
  openSession:    (body)                        => api.post('/pos/till/sessions', body),
  getSession:     (id)                          => api.get(`/pos/till/sessions/${id}`),
  addTransaction: (id, body)                    => api.post(`/pos/till/sessions/${id}/transactions`, body),
  closeSession:   (id, declared)                => api.post(`/pos/till/sessions/${id}/close`, { declared }),
  cashReport:     (id)                          => api.get(`/pos/till/sessions/${id}/report`),
}

// ── Stock (requests / daily report / stock take) ────────────────────────────
export const stockApi = {
  // Stock requests
  listRequests:   ()                          => api.get('/pos/stock-requests'),
  getRequest:     (id)                        => api.get(`/pos/stock-requests/${id}`),
  createRequest:  (body)                      => api.post('/pos/stock-requests', body),
  setLines:       (id, lines)                 => api.put(`/pos/stock-requests/${id}/lines`, { lines }),
  submitRequest:  (id)                        => api.post(`/pos/stock-requests/${id}/submit`),
  approveRequest: (id)                        => api.post(`/pos/stock-requests/${id}/approve`),
  cancelRequest:  (id)                        => api.post(`/pos/stock-requests/${id}/cancel`),
  completeRequest:(id, lines)                 => api.post(`/pos/stock-requests/${id}/complete`, { lines }),

  // Daily movements report
  dailyReport:    (params)                    => api.get('/pos/stock/daily-movements', { params }),
  dailyReportCsv: (params)                    => api.get('/pos/stock/daily-movements.csv', { params, responseType: 'blob' }),
  itemTxns:       (params)                    => api.get('/pos/stock/item-transactions', { params }),

  // Stock take
  listTakes:      ()                          => api.get('/pos/stock-takes'),
  getTake:        (id)                        => api.get(`/pos/stock-takes/${id}`),
  createTake:     (body)                      => api.post('/pos/stock-takes', body),
  updateTakeLine: (takeId, lineId, body)      => api.patch(`/pos/stock-takes/${takeId}/lines/${lineId}`, body),
  completeTake:   (id)                        => api.post(`/pos/stock-takes/${id}/complete`),
  submitTake:     (id)                        => api.post(`/pos/stock-takes/${id}/submit`),
  approveTake:    (id)                        => api.post(`/pos/stock-takes/${id}/approve`),
  takeBcJournalCsv:    (id, params)           => api.get(`/pos/stock-takes/${id}/bc-journal.csv`,
                                                          { params, responseType: 'blob' }),
  requestBcJournalCsv: (id, params)           => api.get(`/pos/stock-requests/${id}/bc-journal.csv`,
                                                          { params, responseType: 'blob' }),
}

// ── Admin setup ───────────────────────────────────────────────────────────────
export const posSetupApi = {
  // shops
  listShops:       ()           => api.get('/pos/setup/shops'),
  saveShop:        (body)       => body.shopId
    ? api.patch(`/pos/setup/shops/${body.shopId}`, body)
    : api.post('/pos/setup/shops', body),
  deleteShop:      (id)         => api.delete(`/pos/setup/shops/${id}`),

  // categories
  listCategories:  ()           => api.get('/pos/setup/categories'),
  saveCategory:    (body)       => body.categoryId
    ? api.patch(`/pos/setup/categories/${body.categoryId}`, body)
    : api.post('/pos/setup/categories', body),
  deleteCategory:  (id)         => api.delete(`/pos/setup/categories/${id}`),

  // contacts
  listSetupContacts: ()                    => api.get('/pos/setup/contacts'),
  deleteSetupContact:(id)                  => api.delete(`/pos/setup/contacts/${id}`),
  listBcContacts:    (company, spCode)     => api.get(`/pos/setup/bc-contacts?company=${company||'FCL'}&salespersonCode=${encodeURIComponent(spCode)}`),
  importContacts:    (contacts, shopCode)  => api.post('/pos/setup/contacts/import', { contacts, shopCode }),

  // items
  listItems:       ()           => api.get('/pos/setup/items'),
  listBcItems:     (company)    => api.get(`/pos/setup/bc-items?company=${company || 'FCL'}`),
  saveItem:        (body)       => body.itemId
    ? api.patch(`/pos/setup/items/${body.itemId}`, body)
    : api.post('/pos/setup/items', body),
  deleteItem:      (id)         => api.delete(`/pos/setup/items/${id}`),

  // payment types
  listPaymentTypes:()           => api.get('/pos/setup/payment-types'),
  savePaymentType: (body)       => body.typeId
    ? api.patch(`/pos/setup/payment-types/${body.typeId}`, body)
    : api.post('/pos/setup/payment-types', body),
  deletePaymentType:(id)        => api.delete(`/pos/setup/payment-types/${id}`),

  // bulk BC sync
  syncFromBc:      (company)    => api.post('/pos/setup/sync-from-bc', { company: company || 'FCL' }),
  syncStepFromBc:  (kind, company, opts = {}) =>
                                    api.post(`/pos/setup/sync-from-bc/${kind}`, { company: company || 'FCL', ...opts }),

  // Cashier ↔ Shops
  listCashiersWithShops: ()                  => api.get('/pos/setup/cashier-shops'),
  getCashierShops:       (userId)            => api.get(`/pos/setup/cashier-shops/${userId}`),
  setCashierShops:       (userId, shops)     => api.put(`/pos/setup/cashier-shops/${userId}`, { shops }),

  // VAT rates
  listVatRates:    ()           => api.get('/pos/setup/vat-rates'),
  saveVatRate:     (body)       => body.vatRateId
    ? api.patch(`/pos/setup/vat-rates/${body.vatRateId}`, body)
    : api.post('/pos/setup/vat-rates', body),
  deleteVatRate:   (id)         => api.delete(`/pos/setup/vat-rates/${id}`),

  // Special prices (offers)
  listSpecialPrices: ()         => api.get('/pos/setup/special-prices'),
  saveSpecialPrice:  (body)     => body.specialPriceId
    ? api.patch(`/pos/setup/special-prices/${body.specialPriceId}`, body)
    : api.post('/pos/setup/special-prices', body),
  deleteSpecialPrice:(id)       => api.delete(`/pos/setup/special-prices/${id}`),
  importSpecialPrices: (rows)   => api.post('/pos/setup/special-prices/import', { rows }),
  exportSpecialPricesCsv: ()    => api.get('/pos/setup/special-prices.csv',
                                            { responseType: 'blob' }),
  specialPricesTemplate:  ()    => api.get('/pos/setup/special-prices/template.csv',
                                            { responseType: 'blob' }),

  // Print config (per shop — pass shopCode='' for global)
  getPrintConfig:    (shopCode='') => api.get(`/pos/setup/print-config${shopCode ? `?shopCode=${encodeURIComponent(shopCode)}` : ''}`),
  savePrintConfig:   (body)        => api.post('/pos/setup/print-config', body),
  listPrinters:      ()            => api.get('/pos/setup/printers'),

  // eTIMS config (per shop)
  getEtimsConfig:    (shopCode='') => api.get(`/pos/setup/etims-config${shopCode ? `?shopCode=${encodeURIComponent(shopCode)}` : ''}`),
  saveEtimsConfig:   (body)        => api.post('/pos/setup/etims-config', body),
  fetchEtimsBcDefaults: (company)  => api.get(`/pos/setup/etims-config/bc-defaults?company=${company || 'FCL'}`),

  // Inventory display config (POS terminal item cards)
  getInventoryConfig:  ()      => api.get('/pos/setup/inventory-config'),
  saveInventoryConfig: (body)  => api.post('/pos/setup/inventory-config', body),
}
