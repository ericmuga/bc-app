/**
 * controllers/posTargetController.js
 * Daily sales targets — list / save / delete / batch upload / copy / achievement.
 */
import * as Pos    from '../models/PosModel.js';
import * as Target from '../models/PosTargetModel.js';
import logger from '../services/logger.js';

function ok(res, data) { return res.json(data); }
function err(res, e, code = 500) {
  logger.error('pos-target error', { error: e.message });
  return res.status(code).json({ error: e.message });
}

async function shopCodeFor(req) {
  const isManager = ['admin', 'shop-admin'].includes(req.user.role);
  if (isManager) {
    const h = req.headers['x-shop-code'];
    if (h) return String(h).trim().toUpperCase();
    return Pos.getUserShopCode(req.user.userId);
  }
  return Pos.getUserShopCode(req.user.userId);
}

export async function listTargets(req, res) {
  try {
    const shopCode = req.query.shopCode || await shopCodeFor(req);
    if (!shopCode) return res.status(400).json({ error: 'shopCode required' });
    const dateFrom = req.query.dateFrom;
    const dateTo   = req.query.dateTo;
    if (!dateFrom || !dateTo) return res.status(400).json({ error: 'dateFrom, dateTo required' });
    ok(res, await Target.listTargets({ shopCode, dateFrom, dateTo, itemNo: req.query.itemNo || null }));
  } catch (e) { err(res, e); }
}

export async function saveTarget(req, res) {
  try {
    const shopCode = req.body.shopCode || await shopCodeFor(req);
    const targetId = await Target.saveTarget({
      ...req.body,
      shopCode,
      modifiedBy: req.user.userId,
    });
    ok(res, { targetId });
  } catch (e) { err(res, e, 400); }
}

export async function deleteTarget(req, res) {
  try { await Target.deleteTarget(req.params.targetId); ok(res, { ok: true }); }
  catch (e) { err(res, e, 400); }
}

export async function saveTargetsBatch(req, res) {
  try {
    const shopCode = req.body.shopCode || await shopCodeFor(req);
    if (!shopCode) return res.status(400).json({ error: 'shopCode required' });
    if (!req.body.targetDate) return res.status(400).json({ error: 'targetDate required' });
    if (!Array.isArray(req.body.lines) || !req.body.lines.length) {
      return res.status(400).json({ error: 'lines array required' });
    }
    const result = await Target.saveTargetsBatch({
      shopCode,
      targetDate: req.body.targetDate,
      lines:      req.body.lines,
      createdBy:  req.user.userId,
    });
    ok(res, result);
  } catch (e) { err(res, e, 400); }
}

export async function copyTargets(req, res) {
  try {
    const shopCode = req.body.shopCode || await shopCodeFor(req);
    if (!shopCode || !req.body.fromDate || !req.body.toDate) {
      return res.status(400).json({ error: 'shopCode, fromDate, toDate required' });
    }
    const result = await Target.copyTargets({
      shopCode,
      fromDate:  req.body.fromDate,
      toDate:    req.body.toDate,
      createdBy: req.user.userId,
    });
    ok(res, result);
  } catch (e) { err(res, e, 400); }
}

export async function achievementReport(req, res) {
  try {
    const shopCode = req.query.shopCode || await shopCodeFor(req);
    if (!shopCode) return res.status(400).json({ error: 'shopCode required' });
    if (!req.query.dateFrom || !req.query.dateTo) {
      return res.status(400).json({ error: 'dateFrom, dateTo required' });
    }
    ok(res, await Target.achievementReport({
      shopCode,
      dateFrom: req.query.dateFrom,
      dateTo:   req.query.dateTo,
    }));
  } catch (e) { err(res, e); }
}
