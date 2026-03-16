/**
 * controllers/invoiceController.js
 */
import Invoice from '../models/Invoice.js';
import Order from '../models/Order.js';
import logger from '../services/logger.js';

/** POST /api/webhook/invoices  – called by Business Central with ETIMS data */
export async function receiveInvoice(req, res) {
  try {
    const { orderNo, invoiceNo, invoicedAt, etimsInvoiceNo, etimsData, qrcodeUrl, lines } = req.body;
    if (!invoiceNo || !invoicedAt) {
      return res.status(400).json({ error: 'invoiceNo and invoicedAt are required' });
    }

    if (orderNo) {
      // Move order to invoice (deduplication: order leaves SalesHeader)
      await Order.moveToInvoice(req.companyId, orderNo, {
        invoiceNo, invoicedAt, etimsInvoiceNo, etimsData, qrcodeUrl,
      });
      await Invoice.audit(req.companyId, 'InvoiceReceived', invoiceNo, 'Invoice', 'BC', 'Business Central', {
        orderNo, etimsInvoiceNo,
      });
      logger.info('Order moved to invoice', { company: req.companyId, orderNo, invoiceNo });
      return res.status(201).json({ message: 'Invoice created from order', invoiceNo, orderNo });
    }

    // Standalone invoice (no order reference)
    return res.status(400).json({ error: 'orderNo is required to match existing order' });
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

/** GET /api/invoices/summary?groupBy=&dateFrom=&dateTo= */
export async function invoiceSummary(req, res) {
  try {
    const { groupBy, dateFrom, dateTo } = req.query;
    const rows = await Invoice.summary(req.companyId, { groupBy, dateFrom, dateTo });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
