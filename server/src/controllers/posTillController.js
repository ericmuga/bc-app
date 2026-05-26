/**
 * controllers/posTillController.js
 * Cash till sessions, transactions, cash report.
 */
import * as Pos  from '../models/PosModel.js';
import * as Till from '../models/PosTillModel.js';
import logger from '../services/logger.js';

function ok(res, data) { return res.json(data); }
function err(res, e, code = 500) {
  logger.error('pos-till error', { error: e.message });
  return res.status(code).json({ error: e.message });
}

async function shopCodeFor(req) {
  if (req.user.role === 'admin') {
    const h = req.headers['x-shop-code'];
    if (h) return String(h).trim().toUpperCase();
    return Pos.getUserShopCode(req.user.userId);
  }
  return Pos.getUserShopCode(req.user.userId);
}

export async function currentSession(req, res) {
  try { ok(res, await Till.getCurrentSession(req.user.userId)); } catch (e) { err(res, e); }
}

export async function listSessions(req, res) {
  try {
    const shopCode = await shopCodeFor(req);
    ok(res, await Till.listSessions({
      shopCode,
      role:          req.user.role,
      cashierUserId: req.user.userId,
    }));
  } catch (e) { err(res, e); }
}

export async function getSession(req, res) {
  try {
    const s = await Till.getSession(req.params.sessionId);
    if (!s) return res.status(404).json({ error: 'Not found' });
    ok(res, s);
  } catch (e) { err(res, e); }
}

export async function openSession(req, res) {
  try {
    const shopCode = await shopCodeFor(req);
    if (!shopCode) return res.status(400).json({ error: 'No shop assigned/selected' });
    const result = await Till.openSession({
      shopCode,
      cashierUserId: req.user.userId,
      cashierName:   req.user.userName,
      notes:         req.body.notes || null,
      balances:      req.body.balances || [],
    });
    ok(res, result);
  } catch (e) { err(res, e, 400); }
}

export async function addTransaction(req, res) {
  try {
    await Till.addTransaction(req.params.sessionId, {
      paymentTypeCode: req.body.paymentTypeCode,
      transactionType: req.body.transactionType,
      amount:          req.body.amount,
      reference:       req.body.reference || null,
      notes:           req.body.notes || null,
      createdBy:       req.user.userId,
    });
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}

export async function closeSession(req, res) {
  try {
    await Till.closeSession(req.params.sessionId, req.body.declared || {});
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}

export async function getCashReport(req, res) {
  try {
    const r = await Till.cashReport(req.params.sessionId);
    if (!r) return res.status(404).json({ error: 'Session not found' });
    ok(res, r);
  } catch (e) { err(res, e); }
}

/** GET /pos/reports/cash-movement?dateFrom=&dateTo=&shopCode=&format=csv */
export async function reportCashMovement(req, res) {
  try {
    const isAdmin = ['admin', 'shop-admin'].includes(req.user.role);
    const Pos = await import('../models/PosModel.js');
    const shopCode = req.query.shopCode || (isAdmin ? null : await Pos.getUserShopCode(req.user.userId));
    const cashierUserId = isAdmin ? (req.query.cashierUserId || null) : req.user.userId;
    const data = await Till.cashMovementReport({
      shopCode, cashierUserId,
      dateFrom: req.query.dateFrom, dateTo: req.query.dateTo,
    });

    if (req.query.format === 'csv') {
      const esc = (v) => {
        if (v == null) return '';
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ['SessionNo','Shop','Cashier','OpenedAt','ClosedAt','Status',
                      'PaymentTypeCode','PaymentTypeName','Opening','Sales','CashIn','CashOut','Expected','Declared','Variance'];
      let csv = '﻿' + header.join(',') + '\r\n';
      for (const r of data.rows) {
        csv += [r.sessionNo, r.shopCode, r.cashierName,
                r.openedAt ? new Date(r.openedAt).toISOString() : '',
                r.closedAt ? new Date(r.closedAt).toISOString() : '',
                r.status, r.paymentTypeCode, r.paymentTypeName,
                r.opening, r.sales, r.cashIn, r.cashOut, r.expected,
                r.declared == null ? '' : r.declared,
                r.variance == null ? '' : r.variance].map(esc).join(',') + '\r\n';
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition',
        `attachment; filename="cash-movement-${req.query.dateFrom}_${req.query.dateTo}.csv"`);
      return res.send(csv);
    }
    ok(res, data);
  } catch (e) { err(res, e, 400); }
}
