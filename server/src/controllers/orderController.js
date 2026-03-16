/**
 * controllers/orderController.js
 */
import Order from '../models/Order.js';
import logger from '../services/logger.js';

/** POST /api/webhook/orders  – called by Business Central */
export async function receiveOrder(req, res) {
  try {
    const { header, lines } = req.body;
    if (!header?.orderNo || !Array.isArray(lines)) {
      return res.status(400).json({ error: 'Invalid payload: header.orderNo and lines[] required' });
    }

    const inserted = await Order.upsert(req.companyId, header, lines);
    if (!inserted) {
      logger.info('Order already exists — skipped', { company: req.companyId, orderNo: header.orderNo });
      return res.status(200).json({ message: 'Order already exists', orderNo: header.orderNo });
    }
    await Order.audit(req.companyId, 'OrderReceived', header.orderNo, 'Order', 'BC', 'Business Central', { lineCount: lines.length });

    logger.info('Order received from BC', { company: req.companyId, orderNo: header.orderNo });
    return res.status(201).json({ message: 'Order saved', orderNo: header.orderNo });
  } catch (err) {
    logger.error('receiveOrder error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/orders?q=&dateFrom=&dateTo=&status=&customerNo=&salesperson=&route=&sector= */
export async function listOrders(req, res) {
  try {
    const { q, dateFrom, dateTo, status, customerNo, salesperson, route, sector } = req.query;
    const orders = await Order.search(req.companyId, { q, dateFrom, dateTo, status, customerNo, salesperson, route, sector });
    return res.json(orders);
  } catch (err) {
    logger.error('listOrders error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/orders/:orderNo */
export async function getOrder(req, res) {
  try {
    const doc = await Order.findWithLines(req.companyId, req.params.orderNo);
    if (!doc) return res.status(404).json({ error: 'Order not found' });
    return res.json(doc);
  } catch (err) {
    logger.error('getOrder error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/** POST /api/orders/:orderNo/confirm */
export async function confirmOrder(req, res) {
  try {
    const { orderNo } = req.params;
    const { userId, userName } = req.user;

    // Check if already confirmed – if so, log as COPY
    const doc = await Order.findWithLines(req.companyId, orderNo);
    if (!doc) return res.status(404).json({ error: 'Order not found' });

    if (doc.header.Status === 'Confirmed') {
      await Order.audit(req.companyId, 'OrderCopy', orderNo, 'Order', userId, userName, {
        attemptedAt: new Date().toISOString(),
        previousConfirmedAt: doc.header.ConfirmedAt,
      });
      return res.status(409).json({
        error: 'Order already confirmed',
        code: 'ALREADY_CONFIRMED',
        confirmedAt: doc.header.ConfirmedAt,
        confirmedBy: doc.header.ConfirmedBy,
      });
    }

    const updated = await Order.confirm(req.companyId, orderNo, userId, userName);
    if (!updated) return res.status(409).json({ error: 'Could not confirm order' });

    await Order.audit(req.companyId, 'OrderConfirmed', orderNo, 'Order', userId, userName);
    return res.json({ message: 'Order confirmed', orderNo });
  } catch (err) {
    logger.error('confirmOrder error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/orders/:orderNo/audit */
export async function getOrderAudit(req, res) {
  try {
    const log = await Order.getAuditLog(req.companyId, req.params.orderNo);
    return res.json(log);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/** GET /api/orders/summary?groupBy=CustomerNo&dateFrom=&dateTo= */
export async function orderSummary(req, res) {
  try {
    const { groupBy, dateFrom, dateTo } = req.query;
    const rows = await Order.summary(req.companyId, { groupBy, dateFrom, dateTo });
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
