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
import { ADMIN_ROLES, INVOICE_ROLES, ORDER_ROLES, REPORT_ROLES, FINANCE_ROLES } from '../services/access.js';

const router = Router();
const company = companyMiddleware();

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
router.get( '/orders/:orderNo',          authMiddleware, requireRole(...ORDER_ROLES), company, orderCtrl.getOrder);
router.post('/orders/:orderNo/confirm',  authMiddleware, requireRole(...ORDER_ROLES), company, orderCtrl.confirmOrder);
router.get( '/orders/:orderNo/audit',    authMiddleware, requireRole(...ORDER_ROLES), company, orderCtrl.getOrderAudit);

// ── Invoice routes (App UI) ──────────────────────────────────────────────────
router.get( '/invoices',                   authMiddleware, requireRole(...INVOICE_ROLES), company, invoiceCtrl.listInvoices);
router.get( '/invoices/summary',           authMiddleware, requireRole(...REPORT_ROLES), company, invoiceCtrl.invoiceSummary);
router.get( '/invoices/lines',             authMiddleware, requireRole(...REPORT_ROLES), company, invoiceCtrl.exportInvoiceLines);
router.get( '/invoices/by-qrcode',         authMiddleware, requireRole(...INVOICE_ROLES), company, invoiceCtrl.getByQRCode);
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
router.get('/bc-reports/routes',             ...canReport, reportCtrl.listRoutes);
router.get('/bc-reports/customers',          ...canReport, reportCtrl.listCustomers);
router.get('/bc-reports/items',              ...canReport, reportCtrl.listItems);
router.get('/bc-reports/downloads',          ...canReport, reportCtrl.downloadDataset);
router.get('/bc-reports/blank-route-lines',  ...canReport, reportCtrl.blankRouteLines);
router.get('/bc-reports/customer-aging',     ...canReport, reportCtrl.customerAging);
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

// ── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/login',          authCtrl.login);
router.post('/auth/login-ad',       authCtrl.loginAD);
router.post('/auth/create-user',    authMiddleware, authCtrl.createUser);
// Service-to-service: validate AD credentials, return profile only (no JWT issued)
router.post('/auth/validate-ad',    apiKeyAuth, authCtrl.validateAD);

export default router;
