/**
 * routes/index.js
 */
import { Router } from 'express';
import { authMiddleware, webhookAuth, requireRole } from '../middleware/auth.js';
import { companyMiddleware } from '../middleware/company.js';
import * as orderCtrl   from '../controllers/orderController.js';
import * as invoiceCtrl from '../controllers/invoiceController.js';
import * as companyCtrl from '../controllers/companyController.js';

import * as authCtrl   from '../controllers/authController.js';
import * as reportCtrl from '../controllers/reportController.js';

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
router.get( '/orders',                   authMiddleware, company, orderCtrl.listOrders);
router.get( '/orders/summary',           authMiddleware, company, orderCtrl.orderSummary);
router.get( '/orders/lines',             authMiddleware, company, orderCtrl.exportOrderLines);
router.get( '/orders/:orderNo',          authMiddleware, company, orderCtrl.getOrder);
router.post('/orders/:orderNo/confirm',  authMiddleware, company, orderCtrl.confirmOrder);
router.get( '/orders/:orderNo/audit',    authMiddleware, company, orderCtrl.getOrderAudit);

// ── Invoice routes (App UI) ──────────────────────────────────────────────────
router.get( '/invoices',                   authMiddleware, company, invoiceCtrl.listInvoices);
router.get( '/invoices/summary',           authMiddleware, company, invoiceCtrl.invoiceSummary);
router.get( '/invoices/lines',             authMiddleware, company, invoiceCtrl.exportInvoiceLines);
router.get( '/invoices/by-qrcode',         authMiddleware, company, invoiceCtrl.getByQRCode);
router.get( '/invoices/:invoiceNo',        authMiddleware, company, invoiceCtrl.getInvoice);
router.post('/invoices/:invoiceNo/confirm',authMiddleware, company, invoiceCtrl.confirmInvoice);
router.get( '/invoices/:invoiceNo/audit',  authMiddleware, company, invoiceCtrl.getInvoiceAudit);

// ── BC Direct Reports ────────────────────────────────────────────────────────
// Accessible by admin and analyst roles only.
const canReport = [authMiddleware, requireRole('admin', 'analyst')];
router.get('/bc-reports/companies',          ...canReport, reportCtrl.listCompanies);
router.get('/bc-reports/run',                ...canReport, reportCtrl.runReport);
router.get('/bc-reports/posting-groups',     ...canReport, reportCtrl.listPostingGroups);
router.get('/bc-reports/sectors',            ...canReport, reportCtrl.listSectors);
router.get('/bc-reports/gen-bus-pgs',        ...canReport, reportCtrl.listGenBusPostingGroups);
router.get('/bc-reports/salespersons',       ...canReport, reportCtrl.listSalespersons);
router.get('/bc-reports/routes',             ...canReport, reportCtrl.listRoutes);

// ── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/login',       authCtrl.login);
router.post('/auth/login-ad',    authCtrl.loginAD);
router.post('/auth/create-user', authMiddleware, authCtrl.createUser);

export default router;
