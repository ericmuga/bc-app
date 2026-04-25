/**
 * controllers/invoiceController.js
 */
import Invoice from '../models/Invoice.js';
import Order from '../models/Order.js';
import logger from '../services/logger.js';
import { getOrSet } from '../services/reportCache.js';

/** POST /api/webhook/invoices  – called by Business Central with ETIMS data */
export async function receiveInvoice(req, res) {
  try {
    const {
      orderNo, invoiceNo, invoicedAt, postingDate, printingDatetime, bcUserId,
      etimsInvoiceNo, etimsData, qrcodeUrl, lines,
      customerPin, salespersonName, shipToName, shipmentMethod, paymentTerms, externalDocNo,
      companyName, companyPin, companyEmail, companyVatReg, noPrinted,
    } = req.body;
    if (!invoiceNo || !invoicedAt) {
      return res.status(400).json({ error: 'invoiceNo and invoicedAt are required' });
    }

    const invoiceFields = {
      invoiceNo, invoicedAt, postingDate, printingDatetime, bcUserId,
      etimsInvoiceNo, etimsData, qrcodeUrl,
      customerPin, salespersonName, shipToName, shipmentMethod, paymentTerms, externalDocNo,
      companyName, companyPin, companyEmail, companyVatReg, noPrinted,
    };

    if (orderNo) {
      // Move order to invoice (idempotent — skips silently if invoice already exists)
      const created = await Order.moveToInvoice(req.companyId, orderNo, invoiceFields, Array.isArray(lines) ? lines : null);
      if (!created) {
        logger.info('Invoice already exists — duplicate webhook ignored', { company: req.companyId, invoiceNo });
        return res.status(200).json({ message: 'Invoice already exists', invoiceNo, orderNo });
      }
      await Invoice.audit(req.companyId, 'InvoiceReceived', invoiceNo, 'Invoice', 'BC', 'Business Central', {
        orderNo, etimsInvoiceNo,
      });
      logger.info('Order moved to invoice', { company: req.companyId, orderNo, invoiceNo });
      return res.status(201).json({ message: 'Invoice created from order', invoiceNo, orderNo });
    }

    // Standalone invoice — no matching order, insert directly without touching SalesHeader
    const { customerNo, customerName, salespersonCode, routeCode, sectorCode, orderDate } = req.body;
    await Invoice.insertDirect(req.companyId, {
      ...invoiceFields,
      customerNo, customerName, salespersonCode, routeCode, sectorCode, orderDate,
    }, Array.isArray(lines) ? lines : []);
    await Invoice.audit(req.companyId, 'InvoiceReceived', invoiceNo, 'Invoice', 'BC', 'Business Central', {
      standalone: true, etimsInvoiceNo,
    });
    logger.info('Standalone invoice stored', { company: req.companyId, invoiceNo });
    return res.status(201).json({ message: 'Standalone invoice stored', invoiceNo });
  } catch (err) {
    logger.error('receiveInvoice error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/invoices */
export async function listInvoices(req, res) {
  try {
    const { q, dateFrom, dateTo, status, customerNo, salesperson, route, sector } = req.query;
    const invoices = await Invoice.search(req.companyId, { q, dateFrom, dateTo, status, customerNo, salesperson, route, sector });
    return res.json(invoices);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/invoices/:invoiceNo */
export async function getInvoice(req, res) {
  try {
    const doc = await Invoice.findWithLines(req.companyId, req.params.invoiceNo);
    if (!doc) return res.status(404).json({ error: 'Invoice not found' });
    return res.json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** POST /api/invoices/:invoiceNo/confirm */
export async function confirmInvoice(req, res) {
  try {
    const { invoiceNo } = req.params;
    const { userId, userName } = req.user;

    const doc = await Invoice.findWithLines(req.companyId, invoiceNo);
    if (!doc) return res.status(404).json({ error: 'Invoice not found' });

    if (doc.header.Status === 'Confirmed') {
      await Invoice.audit(req.companyId, 'InvoiceCopy', invoiceNo, 'Invoice', userId, userName, {
        attemptedAt: new Date().toISOString(),
        previousConfirmedAt: doc.header.ConfirmedAt,
      });
      return res.status(409).json({
        error: 'Invoice already confirmed',
        code: 'ALREADY_CONFIRMED',
        confirmedAt: doc.header.ConfirmedAt,
        confirmedBy: doc.header.ConfirmedBy,
      });
    }

    await Invoice.confirm(req.companyId, invoiceNo, userId, userName);
    await Invoice.audit(req.companyId, 'InvoiceConfirmed', invoiceNo, 'Invoice', userId, userName);
    return res.json({ message: 'Invoice confirmed', invoiceNo });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/invoices/:invoiceNo/audit */
export async function getInvoiceAudit(req, res) {
  try {
    const log = await Invoice.getAuditLog(req.companyId, req.params.invoiceNo);
    return res.json(log);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/invoices/by-qrcode?url=... */
export async function getByQRCode(req, res) {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url query param required' });
    const doc = await Invoice.findByQRCode(req.companyId, url);
    if (!doc) return res.status(404).json({ error: 'Invoice not found for this QR code' });
    return res.json(doc);
  } catch (err) {
    logger.error('getByQRCode error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/invoices/lines?<same filters as list> */
export async function exportInvoiceLines(req, res) {
  try {
    const { q, dateFrom, dateTo, status, customerNo, salesperson, route, sector, postingGroup } = req.query;
    const refresh = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase());
    const cacheQuery = { ...req.query };
    delete cacheQuery.refresh;
    const { value, cached } = await getOrSet('invoices-lines', { companyId: req.companyId, query: cacheQuery }, () => Invoice.exportLines(req.companyId, { q, dateFrom, dateTo, status, customerNo, salesperson, route, sector, postingGroup }), { ttlMs: 5 * 60_000, refresh });
    res.set('X-Report-Cache', cached ? 'HIT' : 'MISS');
    return res.json(value);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/invoices/summary?groupBy=&dateFrom=&dateTo= */
export async function invoiceSummary(req, res) {
  try {
    const { groupBy, dateFrom, dateTo } = req.query;
    const refresh = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase());
    const cacheQuery = { ...req.query };
    delete cacheQuery.refresh;
    const { value, cached } = await getOrSet('invoices-summary', { companyId: req.companyId, query: cacheQuery }, () => Invoice.summary(req.companyId, { groupBy, dateFrom, dateTo }), { ttlMs: 5 * 60_000, refresh });
    res.set('X-Report-Cache', cached ? 'HIT' : 'MISS');
    return res.json(value);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
