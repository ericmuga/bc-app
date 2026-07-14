/**
 * routes/index.js
 */
import { Router } from 'express';
import { authMiddleware, webhookAuth, requireRole, apiKeyAuth } from '../middleware/auth.js';
import { companyMiddleware } from '../middleware/company.js';
import * as orderCtrl   from '../controllers/orderController.js';
import * as invoiceCtrl from '../controllers/invoiceController.js';
import * as companyCtrl from '../controllers/companyController.js';

import * as authCtrl    from '../controllers/authController.js';
import * as reportCtrl  from '../controllers/reportController.js';
import * as adminCtrl   from '../controllers/adminController.js';
import * as financeCtrl from '../controllers/financeController.js';
import * as mgmtCtrl    from '../controllers/mgmtController.js';
import * as posCtrl     from '../controllers/posController.js';
import * as posStockCtrl from '../controllers/posStockController.js';
import * as posTillCtrl  from '../controllers/posTillController.js';
import * as posYieldCtrl  from '../controllers/posYieldController.js';
import * as posTargetCtrl from '../controllers/posTargetController.js';
import * as posCouponCtrl from '../controllers/posCouponController.js';
import * as auditCtrl     from '../controllers/auditController.js';
import * as costingCtrl   from '../controllers/costingController.js';
import * as templatesCtrl from '../controllers/templatesController.js';
import * as systemCtrl    from '../controllers/systemController.js';
import * as productionCtrl from '../controllers/productionController.js';
import * as dispatchCtrl   from '../controllers/dispatchController.js';
import * as weeklyTargetsCtrl from '../controllers/weeklyTargetsController.js';
import { auditMiddleware } from '../services/audit.js';
import { ADMIN_ROLES, INVOICE_ROLES, ORDER_ROLES, REPORT_ROLES, FINANCE_ROLES, POS_ROLES, POS_MANAGER_ROLES, COSTING_ROLES, PRODUCTION_ROLES,
  DISPATCH_ROLES, DISPATCH_REGISTRY_ROLES, DISPATCH_SUPERVISOR_ROLES } from '../services/access.js';

const router = Router();
const company = companyMiddleware();

// Mount audit middleware: records every successful POS mutation after the response is sent.
// Sits before the controllers so it can read req.body; uses res.on('finish') so it never blocks.
router.use(auditMiddleware);

// ── System / build info ───────────────────────────────────────────────────────
router.get( '/system/release', authMiddleware, systemCtrl.getRelease);

// ── Companies ─────────────────────────────────────────────────────────────────
router.get( '/companies', authMiddleware, companyCtrl.listCompanies);
router.post('/companies', authMiddleware, companyCtrl.createCompany);

// ── Webhook routes (BC → App) ────────────────────────────────────────────────
// These don't use JWT; they use the BC webhook secret header.
router.post('/webhook/orders',   webhookAuth, company, orderCtrl.receiveOrder);
router.post('/webhook/invoices', webhookAuth, company, invoiceCtrl.receiveInvoice);

// ── Order routes (App UI) ────────────────────────────────────────────────────
router.get( '/orders',                   authMiddleware, requireRole(...ORDER_ROLES), company, orderCtrl.listOrders);
router.get( '/orders/summary',           authMiddleware, requireRole(...REPORT_ROLES), company, orderCtrl.orderSummary);
router.get( '/orders/lines',             authMiddleware, requireRole(...REPORT_ROLES), company, orderCtrl.exportOrderLines);
router.get( '/orders/:orderNo',                ...[authMiddleware, requireRole(...ORDER_ROLES), company], orderCtrl.getOrder);
router.post('/orders/:orderNo/confirm',        ...[authMiddleware, requireRole(...ORDER_ROLES), company], orderCtrl.confirmOrder);
router.get( '/orders/:orderNo/audit',          ...[authMiddleware, requireRole(...ORDER_ROLES), company], orderCtrl.getOrderAudit);
// Per-part confirmation (orders only — invoices are not parts-based)
router.get( '/orders/:orderNo/parts',                  ...[authMiddleware, requireRole(...ORDER_ROLES), company], orderCtrl.getOrderParts);
router.post('/orders/:orderNo/parts/:part/confirm',    ...[authMiddleware, requireRole(...ORDER_ROLES), company], orderCtrl.confirmOrderPart);

// ── Invoice routes (App UI) ──────────────────────────────────────────────────
router.get( '/invoices',                   authMiddleware, requireRole(...INVOICE_ROLES), company, invoiceCtrl.listInvoices);
router.get( '/invoices/summary',           authMiddleware, requireRole(...REPORT_ROLES), company, invoiceCtrl.invoiceSummary);
router.get( '/invoices/lines',             authMiddleware, requireRole(...REPORT_ROLES), company, invoiceCtrl.exportInvoiceLines);
router.get( '/invoices/by-qrcode',         authMiddleware, requireRole(...INVOICE_ROLES), company, invoiceCtrl.getByQRCode);
router.get( '/invoices/by-barcode/:code',  authMiddleware, requireRole(...INVOICE_ROLES), company, invoiceCtrl.getByBarcode);
router.get( '/invoices/:invoiceNo',        authMiddleware, requireRole(...INVOICE_ROLES), company, invoiceCtrl.getInvoice);
router.post('/invoices/:invoiceNo/confirm',authMiddleware, requireRole(...INVOICE_ROLES), company, invoiceCtrl.confirmInvoice);
router.get( '/invoices/:invoiceNo/audit',  authMiddleware, requireRole(...INVOICE_ROLES), company, invoiceCtrl.getInvoiceAudit);

// ── BC Direct Reports ────────────────────────────────────────────────────────
// Accessible by admin and analyst roles only.
const canReport = [authMiddleware, requireRole(...REPORT_ROLES)];
router.get('/bc-reports/companies',          ...canReport, reportCtrl.listCompanies);
router.get('/bc-reports/run',                ...canReport, reportCtrl.runReport);
router.get('/bc-reports/posting-groups',     ...canReport, reportCtrl.listPostingGroups);
router.get('/bc-reports/sectors',            ...canReport, reportCtrl.listSectors);
router.get('/bc-reports/gen-bus-pgs',        ...canReport, reportCtrl.listGenBusPostingGroups);
router.get('/bc-reports/salespersons',       ...canReport, reportCtrl.listSalespersons);
router.get('/bc-reports/customer-posting-groups', ...canReport, reportCtrl.listCustomerPostingGroups);
router.get('/bc-reports/routes',             ...canReport, reportCtrl.listRoutes);
router.get('/bc-reports/customers',          ...canReport, reportCtrl.listCustomers);
router.get('/bc-reports/items',              ...canReport, reportCtrl.listItems);
router.get('/bc-reports/downloads',          ...canReport, reportCtrl.downloadDataset);
router.get('/bc-reports/blank-route-lines',  ...canReport, reportCtrl.blankRouteLines);
router.get('/bc-reports/customer-aging',     ...canReport, reportCtrl.customerAging);
router.get('/bc-reports/salesman-statement', ...canReport, reportCtrl.salesmanStatement);
router.get('/bc-reports/cust-pg-mappings',   ...canReport, reportCtrl.listCustPgMappings);
router.post('/bc-reports/cache/clear',       ...canReport, reportCtrl.clearCache);

const adminOnly = [authMiddleware, requireRole(...ADMIN_ROLES)];
router.post('/bc-reports/cust-pg-mappings',          ...adminOnly, reportCtrl.saveCustPgMapping);
router.patch('/bc-reports/cust-pg-mappings/:mapId',  ...adminOnly, reportCtrl.saveCustPgMapping);
router.delete('/bc-reports/cust-pg-mappings/:mapId', ...adminOnly, reportCtrl.deleteCustPgMapping);
router.get('/admin/users',                   ...adminOnly, adminCtrl.listUsers);
router.patch('/admin/users/:userId',         ...adminOnly, adminCtrl.updateUser);
router.get('/admin/settings/smtp',           ...adminOnly, adminCtrl.getSmtpSettings);
router.post('/admin/settings/smtp',          ...adminOnly, adminCtrl.saveSmtpSettings);
router.get('/admin/report-schedules',        ...adminOnly, adminCtrl.listSchedules);
router.post('/admin/report-schedules',       ...adminOnly, adminCtrl.saveSchedule);
router.patch('/admin/report-schedules/:scheduleId', ...adminOnly, adminCtrl.saveSchedule);
router.delete('/admin/report-schedules/:scheduleId', ...adminOnly, adminCtrl.deleteSchedule);
router.post('/admin/report-schedules/:scheduleId/run', ...adminOnly, adminCtrl.runScheduleNow);

// ── Finance Reports ──────────────────────────────────────────────────────────
const canFinance = [authMiddleware, requireRole(...FINANCE_ROLES)];
router.get('/finance/run',                    ...canFinance, financeCtrl.runFinanceReport);
router.post('/finance/cache/clear',           ...canFinance, financeCtrl.clearFinanceCache);
router.get('/finance/gl-mappings',            ...canFinance, financeCtrl.listGlMappings);
router.post('/finance/gl-mappings',           authMiddleware, requireRole(...ADMIN_ROLES), financeCtrl.saveGlMapping);
router.patch('/finance/gl-mappings/:mapId',   authMiddleware, requireRole(...ADMIN_ROLES), financeCtrl.saveGlMapping);
router.delete('/finance/gl-mappings/:mapId',  authMiddleware, requireRole(...ADMIN_ROLES), financeCtrl.deleteGlMapping);

// ── Production (inventory analysis by location) ──────────────────────────────
const canProduction = [authMiddleware, requireRole(...PRODUCTION_ROLES)];
router.get('/production/locations',  ...canProduction, productionCtrl.getLocations);
router.put('/production/locations',  authMiddleware, requireRole(...ADMIN_ROLES), productionCtrl.saveLocations);
router.get('/production/analysis',   ...canProduction, productionCtrl.analysis);

// ── Management Accounts ──────────────────────────────────────────────────────
// Finance + admin roles can read; admin only can write.
const canMgmt = [authMiddleware, requireRole(...FINANCE_ROLES)];
router.get('/mgmt/accounts',                                     ...canMgmt,   mgmtCtrl.listGlAccounts);
router.get('/mgmt/dimension-values',                             ...canMgmt,   mgmtCtrl.listDimensionValues);
router.get('/mgmt/run',                                          ...canMgmt,   mgmtCtrl.runReport);
router.get('/mgmt/line-detail',                                  ...canMgmt,   mgmtCtrl.getLineDetail);
router.get('/mgmt/templates',                                    ...canMgmt,   mgmtCtrl.listTemplates);
router.post('/mgmt/templates',                                   ...adminOnly, mgmtCtrl.saveTemplate);
router.patch('/mgmt/templates/:templateId',                      ...adminOnly, mgmtCtrl.saveTemplate);
router.delete('/mgmt/templates/:templateId',                     ...adminOnly, mgmtCtrl.deleteTemplate);
router.get('/mgmt/templates/:templateId/lines',                  ...canMgmt,   mgmtCtrl.listLines);
router.post('/mgmt/templates/:templateId/lines',                 ...adminOnly, mgmtCtrl.saveLine);
router.patch('/mgmt/templates/:templateId/lines/:lineId',        ...adminOnly, mgmtCtrl.saveLine);
router.delete('/mgmt/templates/:templateId/lines/:lineId',       ...adminOnly, mgmtCtrl.deleteLine);
router.get('/mgmt/lines/:lineId/formulas',                       ...canMgmt,   mgmtCtrl.listFormulas);
router.post('/mgmt/lines/:lineId/formulas',                      ...adminOnly, mgmtCtrl.saveFormula);
router.patch('/mgmt/lines/:lineId/formulas/:formulaId',          ...adminOnly, mgmtCtrl.saveFormula);
router.delete('/mgmt/lines/:lineId/formulas/:formulaId',         ...adminOnly, mgmtCtrl.deleteFormula);
router.get('/mgmt/templates/:templateId/measures',               ...canMgmt,   mgmtCtrl.listMeasures);
router.post('/mgmt/templates/:templateId/measures',              ...adminOnly, mgmtCtrl.saveMeasure);
router.patch('/mgmt/templates/:templateId/measures/:measureId',  ...adminOnly, mgmtCtrl.saveMeasure);
router.delete('/mgmt/templates/:templateId/measures/:measureId', ...adminOnly, mgmtCtrl.deleteMeasure);

// ── POS terminal ─────────────────────────────────────────────────────────────
const canPos    = [authMiddleware, requireRole(...POS_ROLES)];
const canManage = [authMiddleware, requireRole(...POS_MANAGER_ROLES)];
router.get( '/pos/items',                          ...canPos, posCtrl.getItems);
router.get( '/pos/payment-types',                  ...canPos, posCtrl.getPaymentTypes);
router.get( '/pos/my-shop',                        ...canPos, posCtrl.getMyShop);
router.get( '/pos/contacts',                       ...canPos, posCtrl.listContacts);
router.post('/pos/contacts',                       ...canPos, posCtrl.createContact);
router.get( '/pos/walk-in',                        ...canPos, posCtrl.getMyWalkIn);
router.post('/pos/orders',                         ...canPos, posCtrl.createOrder);
router.get( '/pos/orders',                         ...canPos, posCtrl.listOrders);
router.get( '/pos/orders/:orderId',                ...canPos, posCtrl.getOrder);
router.put( '/pos/orders/:orderId/lines',          ...canPos, posCtrl.setOrderLines);
router.post('/pos/orders/:orderId/checkout',       ...canPos, posCtrl.checkout);
router.post('/pos/orders/:orderId/checkout-multi', ...canPos, posCtrl.checkoutMulti);
router.post('/pos/orders/:orderId/complete',       ...canPos, posCtrl.completeOrder);
router.patch('/pos/orders/:orderId/contact',       ...canPos, posCtrl.setOrderContact);
router.post('/pos/orders/:orderId/cancel',         ...canPos, posCtrl.cancelOrder);
router.post('/pos/orders/:orderId/save',           ...canPos, posCtrl.saveCart);
router.post('/pos/orders/:orderId/resume',         ...canPos, posCtrl.resumeCart);
router.post('/pos/orders/:orderId/reprint',        ...canPos, posCtrl.reprintOrder);
router.post('/pos/orders/:orderId/sign',           ...canPos, posCtrl.signOrder);
router.post('/pos/orders/:orderId/credit-memo/sign', ...adminOnly, posCtrl.signCreditMemo);
router.get( '/pos/orders/:orderId/etims-preview',  ...canPos, posCtrl.previewEtimsPayload);
router.get( '/pos/orders/:orderId/pdf',            ...canPos, posCtrl.getOrderPdf);
router.post('/pos/orders/:orderId/print-confirmation', ...canPos, posCtrl.printConfirmation);
router.post('/pos/orders/:orderId/stk-push',       ...canPos, posCtrl.stkPush);
router.get( '/pos/payments/fetch',                 ...canPos, posCtrl.fetchPayments);
router.get( '/pos/payments/fetch-mpesa',           ...canPos, posCtrl.fetchMpesaLocal);
router.post('/pos/orders/:orderId/mpesa-match',    ...canPos, posCtrl.recordMpesaMatch);
router.get( '/pos/reports/mpesa-invoices',         ...canManage, posCtrl.mpesaInvoiceReport);
router.get( '/pos/reports/mpesa-payments',         ...canManage, posCtrl.mpesaPaymentReport);
// Daraja STK callback — public, no auth (Safaricom posts here). Tolerates duplicates / unmatched.
router.post('/pos/payments/mpesa-callback',        posCtrl.mpesaCallback);

router.get( '/pos/favourites',                     ...canPos, posCtrl.listFavourites);
router.post('/pos/favourites',                     ...canPos, posCtrl.addFavourite);
router.delete('/pos/favourites/:itemNo',           ...canPos, posCtrl.removeFavourite);

router.get( '/pos/shops',                          ...canPos, posCtrl.listShopsForTerminal);
router.get( '/pos/price-list/pdf',                 ...canPos, posCtrl.getPriceListPdf);
router.post('/pos/payments/:paymentId/confirm',    ...canPos, posCtrl.confirmPayment);

// ── POS Stock: requests, daily report, stock take ───────────────────────────
router.get(  '/pos/stock-requests',                            ...canPos, posStockCtrl.listRequests);
router.post( '/pos/stock-requests',                            ...canPos, posStockCtrl.createRequest);
router.get(  '/pos/stock-requests/:requestId',                 ...canPos, posStockCtrl.getRequest);
router.put(  '/pos/stock-requests/:requestId/lines',           ...canPos, posStockCtrl.setRequestLines);
router.post( '/pos/stock-requests/:requestId/submit',          ...canPos, posStockCtrl.submitRequest);
router.post( '/pos/stock-requests/:requestId/approve',         ...adminOnly, posStockCtrl.approveRequest);
router.post( '/pos/stock-requests/:requestId/cancel',          ...canPos, posStockCtrl.cancelRequest);
router.post( '/pos/stock-requests/:requestId/complete',        ...canPos, posStockCtrl.completeRequest);

// BC stock baseline (reset from BC on-hand) + incremental ledger loads
router.get(  '/pos/stock/bc-watermark',                        ...canPos, posStockCtrl.bcStockWatermark);
router.post( '/pos/stock/reset-from-bc',                       ...canPos, posStockCtrl.resetStockFromBc);
router.get(  '/pos/stock/bc-ledger-dates',                     ...canPos, posStockCtrl.bcLedgerDates);
router.post( '/pos/stock/load-from-bc',                        ...canPos, posStockCtrl.loadStockFromBc);

router.get(  '/pos/stock/daily-movements',                     ...canPos, posStockCtrl.dailyReport);

// ── POS Reports hub (admin / shop-admin shop-comparison; others scope to own shop) ──
router.get(  '/pos/reports/stock-position',                    ...canPos,    posStockCtrl.reportStockPosition);
router.get(  '/pos/reports/sales-by-item',                     ...canPos,    posStockCtrl.reportSalesByItem);
router.get(  '/pos/reports/sales-by-contact',                  ...canPos,    posStockCtrl.reportSalesByContact);
router.get(  '/pos/reports/shop-comparison',                   ...canManage, posStockCtrl.reportShopComparison);
router.get(  '/pos/reports/cash-movement',                     ...canPos,    posTillCtrl.reportCashMovement);
router.get(  '/pos/stock/daily-movements.csv',                 ...canPos, posStockCtrl.dailyReportCsv);
router.get(  '/pos/stock/item-transactions',                   ...canPos, posStockCtrl.itemTransactions);

// ── POS Till (cash sessions, transactions, cash report) ────────────────────
router.get(  '/pos/till/current',                              ...canPos, posTillCtrl.currentSession);
router.get(  '/pos/till/sessions',                             ...canPos, posTillCtrl.listSessions);
router.post( '/pos/till/sessions',                             ...canPos, posTillCtrl.openSession);
router.get(  '/pos/till/sessions/:sessionId',                  ...canPos, posTillCtrl.getSession);
router.post( '/pos/till/sessions/:sessionId/transactions',     ...canPos, posTillCtrl.addTransaction);
router.post( '/pos/till/sessions/:sessionId/close',            ...canPos, posTillCtrl.closeSession);
router.get(  '/pos/till/sessions/:sessionId/report',           ...canPos, posTillCtrl.getCashReport);

// ── POS Yield: third-party enrolment, transfers, portioning, write-offs ───

router.get(  '/pos/third-parties',                             ...canPos, posYieldCtrl.listThirdParties);
router.post( '/pos/third-parties',                             ...canManage, posYieldCtrl.saveThirdParty);
router.patch('/pos/third-parties/:thirdPartyId',               ...canManage, posYieldCtrl.saveThirdParty);
router.delete('/pos/third-parties/:thirdPartyId',              ...canManage, posYieldCtrl.deleteThirdParty);

router.get(  '/pos/transfers',                                 ...canPos, posYieldCtrl.listTransfers);
router.post( '/pos/transfers',                                 ...canManage, posYieldCtrl.createTransfer);
router.get(  '/pos/transfers/:transferId',                     ...canPos, posYieldCtrl.getTransfer);
router.put(  '/pos/transfers/:transferId/lines',               ...canManage, posYieldCtrl.setTransferLines);
router.post( '/pos/transfers/:transferId/post',                ...canManage, posYieldCtrl.postTransfer);

router.get(  '/pos/portionings',                               ...canPos, posYieldCtrl.listPortionings);
router.post( '/pos/portionings',                               ...canManage, posYieldCtrl.createPortioning);
router.get(  '/pos/portionings/:portioningId',                 ...canPos, posYieldCtrl.getPortioning);
router.put(  '/pos/portionings/:portioningId/lines',           ...canManage, posYieldCtrl.setPortioningLines);
router.post( '/pos/portionings/:portioningId/post',            ...canManage, posYieldCtrl.postPortioning);

router.get(  '/pos/write-offs',                                ...canPos, posYieldCtrl.listWriteOffs);
router.post( '/pos/write-offs',                                ...canManage, posYieldCtrl.postWriteOff);

router.get(  '/pos/manual-sales',                              ...canPos, posYieldCtrl.listManualSales);
router.post( '/pos/manual-sales',                              ...canManage, posYieldCtrl.recordManualSale);
router.post( '/pos/manual-sales/batch',                        ...canManage, posYieldCtrl.recordManualSaleBatch);

router.get(  '/pos/reports/yield',                             ...canPos, posYieldCtrl.yieldReport);
router.get(  '/pos/exports/:kind',                             ...canPos, posYieldCtrl.exportYieldCsv);

// ── POS Coupons (admin / shop-admin) ───────────────────────────────────────
router.get(  '/pos/coupons',                              ...canManage, posCouponCtrl.listCoupons);
router.post( '/pos/coupons',                              ...canManage, posCouponCtrl.issueCoupon);
router.get(  '/pos/coupons/:code',                        ...canPos,    posCouponCtrl.getCoupon);
router.get(  '/pos/coupons/:code/ledger',                 ...canManage, posCouponCtrl.listLedger);
router.post( '/pos/coupons/:code/redeem',                 ...canPos,    posCouponCtrl.redeemCoupon);
router.post( '/pos/coupons/:code/void',                   ...canManage, posCouponCtrl.voidCoupon);
router.get(  '/pos/coupons/:code/pdf',                    ...canManage, posCouponCtrl.couponPdf);
router.post( '/pos/coupons/:code/email',                  ...canManage, posCouponCtrl.emailCoupon);

// ── POS Targets (shop-admin) ───────────────────────────────────────────────
router.get(  '/pos/targets',                                   ...canPos,    posTargetCtrl.listTargets);
router.post( '/pos/targets',                                   ...canManage, posTargetCtrl.saveTarget);
router.delete('/pos/targets/:targetId',                        ...canManage, posTargetCtrl.deleteTarget);
router.post( '/pos/targets/batch',                             ...canManage, posTargetCtrl.saveTargetsBatch);
router.post( '/pos/targets/copy',                              ...canManage, posTargetCtrl.copyTargets);
router.get(  '/pos/targets/achievement',                       ...canPos,    posTargetCtrl.achievementReport);

// ── Audit log (admin / shop-admin) ─────────────────────────────────────────
const auditOnly = [authMiddleware, requireRole(...POS_MANAGER_ROLES)];
router.get(  '/audit',          ...auditOnly, auditCtrl.listEntries);
router.get(  '/audit/by-user',  ...auditOnly, auditCtrl.listByUser);
router.get(  '/audit.csv',      ...auditOnly, auditCtrl.exportCsv);

router.get(  '/pos/stock-takes',                               ...canPos, posStockCtrl.listTakes);
router.post( '/pos/stock-takes',                               ...canPos, posStockCtrl.createTake);
router.get(  '/pos/stock-takes/:stockTakeId',                  ...canPos, posStockCtrl.getTake);
router.patch('/pos/stock-takes/:stockTakeId/lines/:lineId',    ...canPos, posStockCtrl.updateTakeLine);
router.post( '/pos/stock-takes/:stockTakeId/complete',         ...canPos, posStockCtrl.completeTake);
router.post( '/pos/stock-takes/:stockTakeId/submit',           ...canPos,    posStockCtrl.submitTake);
router.post( '/pos/stock-takes/:stockTakeId/approve',          ...canManage, posStockCtrl.approveTake);
router.get(  '/pos/stock-takes/:stockTakeId/bc-journal.csv',   ...canManage, posStockCtrl.exportTakeBcJournal);
router.get(  '/pos/stock-requests/:requestId/bc-journal.csv',  ...canManage, posStockCtrl.exportRequestBcJournal);

// ── POS admin setup ───────────────────────────────────────────────────────────
// POS setup is scoped to POS_MANAGER_ROLES (admin + shop-admin). Global admin
// concerns (Users, SMTP, schedules, finance) stay on adminOnly above.
router.get(   '/pos/setup/shops',                  ...canManage, posCtrl.listShops);
router.post(  '/pos/setup/shops',                  ...canManage, posCtrl.saveShop);
router.patch( '/pos/setup/shops/:shopId',          ...canManage, posCtrl.saveShop);
router.delete('/pos/setup/shops/:shopId',          ...canManage, posCtrl.deleteShop);

router.get(   '/pos/setup/categories',             ...canManage, posCtrl.listCategories);
router.post(  '/pos/setup/categories',             ...canManage, posCtrl.saveCategory);
router.patch( '/pos/setup/categories/:categoryId', ...canManage, posCtrl.saveCategory);
router.delete('/pos/setup/categories/:categoryId', ...canManage, posCtrl.deleteCategory);

router.get(   '/pos/setup/items',                  ...canManage, posCtrl.listSetupItems);
router.get(   '/pos/setup/bc-items',               ...canManage, posCtrl.listBcItems);
router.get(   '/pos/setup/bc-contacts',            ...canManage, posCtrl.listBcContacts);
router.get(   '/pos/setup/bc-salespersons',        ...canManage, posCtrl.listBcSalespersons);
router.get(   '/pos/setup/bc-salespersons/:code/signature', ...canManage, posCtrl.getSalespersonSignature);
router.post(  '/pos/setup/contacts/import',        ...canManage, posCtrl.importContacts);
router.get(   '/pos/setup/contacts',               ...canManage, posCtrl.listSetupContacts);
router.delete('/pos/setup/contacts/:contactId',    ...canManage, posCtrl.deleteSetupContact);
router.post(  '/pos/setup/items',                  ...canManage, posCtrl.saveItem);
router.patch( '/pos/setup/items/:itemId',          ...canManage, posCtrl.saveItem);
router.delete('/pos/setup/items/:itemId',          ...canManage, posCtrl.deleteItem);
router.post(  '/pos/setup/items/:itemId/photo',    ...canManage, posCtrl.uploadItemPhoto);

router.post(  '/pos/setup/sync-from-bc',           ...canManage, posCtrl.syncFromBc);
router.post(  '/pos/setup/sync-from-bc/:kind',     ...canManage, posCtrl.syncStepFromBc);

// Cashier ↔ Shops
router.get(   '/pos/setup/cashier-shops',          ...canManage, posCtrl.listCashiersWithShops);
router.get(   '/pos/setup/cashier-shops/:userId',  ...canManage, posCtrl.getCashierShops);
router.put(   '/pos/setup/cashier-shops/:userId',  ...canManage, posCtrl.setCashierShops);
router.get(   '/pos/setup/vat-rates',              ...canManage, posCtrl.listVatRates);
router.post(  '/pos/setup/vat-rates',              ...canManage, posCtrl.saveVatRate);
router.patch( '/pos/setup/vat-rates/:vatRateId',   ...canManage, posCtrl.saveVatRate);
router.delete('/pos/setup/vat-rates/:vatRateId',   ...canManage, posCtrl.deleteVatRate);

router.get(   '/pos/setup/special-prices',                       ...canManage, posCtrl.listSpecialPrices);
router.post(  '/pos/setup/special-prices',                       ...canManage, posCtrl.saveSpecialPrice);
router.patch( '/pos/setup/special-prices/:specialPriceId',       ...canManage, posCtrl.saveSpecialPrice);
router.delete('/pos/setup/special-prices/:specialPriceId',       ...canManage, posCtrl.deleteSpecialPrice);
router.post(  '/pos/setup/special-prices/import',                ...canManage, posCtrl.importSpecialPricesBatch);
router.get(   '/pos/setup/special-prices.csv',                   ...canManage, posCtrl.exportSpecialPricesCsv);
router.get(   '/pos/setup/special-prices/template.csv',          ...canManage, posCtrl.specialPricesTemplate);

router.get(   '/pos/setup/print-config',           ...canManage, posCtrl.getPrintCfg);
router.post(  '/pos/setup/print-config',           ...canManage, posCtrl.savePrintCfg);
router.get(   '/pos/setup/printers',               ...canManage, posCtrl.listPrinters);

router.get(   '/pos/setup/etims-config',           ...canManage, posCtrl.getEtimsCfg);
router.post(  '/pos/setup/etims-config',           ...canManage, posCtrl.saveEtimsCfg);
router.get(   '/pos/setup/etims-config/bc-defaults', ...canManage, posCtrl.getEtimsBcDefaults);

router.get(   '/pos/setup/inventory-config',       ...canManage, posCtrl.getInventoryCfg);
router.post(  '/pos/setup/inventory-config',       ...canManage, posCtrl.saveInventoryCfg);
router.get(   '/pos/setup/payment-types',          ...canManage, posCtrl.listSetupPaymentTypes);
router.post(  '/pos/setup/payment-types',          ...canManage, posCtrl.savePaymentType);
router.patch( '/pos/setup/payment-types/:typeId',  ...canManage, posCtrl.savePaymentType);
router.delete('/pos/setup/payment-types/:typeId',  ...canManage, posCtrl.deletePaymentType);

// ── Costing (WMS calibra via linked server — see config/wms.js) ──────────────
const canCost = [authMiddleware, requireRole(...COSTING_ROLES)];
router.get(   '/costing/rows',                  ...canCost, costingCtrl.list);
router.get(   '/costing/recipes',               ...canCost, costingCtrl.listRecipes);
router.get(   '/costing/processes',             ...canCost, costingCtrl.listProcesses);
router.get(   '/costing/columns',               ...canCost, costingCtrl.listColumns);
router.get(   '/costing/rows/:id',              ...canCost, costingCtrl.getOne);
router.post(  '/costing/rows',                  ...canCost, costingCtrl.create);
router.patch( '/costing/rows/:id',              ...canCost, costingCtrl.update);
router.delete('/costing/rows/:id',              ...canCost, costingCtrl.remove);
router.delete('/costing/recipes/:recipe',       ...canCost, costingCtrl.removeRecipe);
router.post(  '/costing/bulk-upsert',           ...canCost, costingCtrl.bulkUpsert);
router.post(  '/costing/bulk-replace',          ...canCost, costingCtrl.bulkReplace);

// Recipe templates (template_header + template_lines). Static paths first.
router.get(   '/costing/templates',             ...canCost, templatesCtrl.listHeaders);
router.get(   '/costing/templates/columns',     ...canCost, templatesCtrl.listColumns);
router.post(  '/costing/templates',             ...canCost, templatesCtrl.createHeader);
router.post(  '/costing/templates/lines',       ...canCost, templatesCtrl.createLine);
router.post(  '/costing/templates/:no/lines/replace', ...canCost, templatesCtrl.replaceLines);
router.patch( '/costing/templates/lines/:id',   ...canCost, templatesCtrl.updateLine);
router.delete('/costing/templates/lines/:id',   ...canCost, templatesCtrl.deleteLine);
router.get(   '/costing/templates/:no/lines',   ...canCost, templatesCtrl.listLines);
router.get(   '/costing/templates/:no',         ...canCost, templatesCtrl.getTemplate);
router.patch( '/costing/templates/:id',         ...canCost, templatesCtrl.updateHeader);
router.delete('/costing/templates/:id',         ...canCost, templatesCtrl.deleteTemplate);

// ── Dispatch / pick-and-pack ──────────────────────────────────────────────────
const canDispatch     = [authMiddleware, requireRole(...DISPATCH_ROLES)];
const canDispRegistry = [authMiddleware, requireRole(...DISPATCH_REGISTRY_ROLES)];
const canDispSuper    = [authMiddleware, requireRole(...DISPATCH_SUPERVISOR_ROLES)];
// Registry (confirm the 4 parts)
router.post( '/dispatch/import',              ...canDispRegistry, dispatchCtrl.importFromBc);
router.get(  '/dispatch/registry-companies',  ...canDispRegistry, dispatchCtrl.registryCompanies);
router.get(  '/dispatch/confirmation',        ...canDispRegistry, dispatchCtrl.listConfirmation);
router.get(  '/dispatch/confirmations/report', ...canDispRegistry, dispatchCtrl.confirmationReport);
router.get(  '/dispatch/orders/:id',          ...canDispatch,     dispatchCtrl.getOrder);
router.post( '/dispatch/orders/:id/confirm',  ...canDispRegistry, dispatchCtrl.confirmPart);
// Per-user registry company permissions (supervisor/admin)
router.get(  '/dispatch/users/:userId/companies', ...canDispSuper, dispatchCtrl.getUserCompanies);
router.put(  '/dispatch/users/:userId/companies', ...canDispSuper, dispatchCtrl.setUserCompanies);
// Assignment (supervisor → packer)
router.get(  '/dispatch/unassigned',          ...canDispSuper,    dispatchCtrl.listUnassigned);
router.get(  '/dispatch/packers',             ...canDispSuper,    dispatchCtrl.listPackers);
router.post( '/dispatch/orders/:id/assign',   ...canDispSuper,    dispatchCtrl.assign);

// ── Weekly domestic sales targets (upload to FCLWHS.FACT_WEEKLYTARGETS) ──────
const canSalesTargets = [authMiddleware, requireRole('admin', 'sales')];
router.get( '/weekly-targets',         ...canSalesTargets, weeklyTargetsCtrl.list);
router.get( '/weekly-targets/months',  ...canSalesTargets, weeklyTargetsCtrl.months);
router.get( '/weekly-targets/columns', ...canSalesTargets, weeklyTargetsCtrl.columns);
router.post('/weekly-targets/upload',  ...canSalesTargets, weeklyTargetsCtrl.upload);
router.post('/weekly-targets/split',   ...canSalesTargets, weeklyTargetsCtrl.split);

// ── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/login',          authCtrl.login);
router.post('/auth/login-ad',       authCtrl.loginAD);
router.post('/auth/create-user',    authMiddleware, authCtrl.createUser);
// Service-to-service: validate AD credentials, return profile only (no JWT issued)
router.post('/auth/validate-ad',    apiKeyAuth, authCtrl.validateAD);

export default router;
