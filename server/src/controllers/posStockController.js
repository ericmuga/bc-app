/**
 * controllers/posStockController.js
 * Stock requests, daily movements report, stock take.
 */
import * as Pos      from '../models/PosModel.js';
import * as Stock    from '../models/PosStockModel.js';
import logger from '../services/logger.js';

function ok(res, data) { return res.json(data); }
function err(res, e, code = 500) {
  logger.error('pos-stock error', { error: e.message });
  return res.status(code).json({ error: e.message });
}

async function userShopCode(req) {
  // Managers (admin / shop-admin) can switch shops via the X-Shop-Code header
  // (set when they pick a shop in the admin UI). Otherwise fall back to the
  // user's own assigned shop, then the shopCode in the body if provided.
  const isManager = ['admin', 'shop-admin'].includes(req.user.role);
  if (isManager) {
    const h = req.headers['x-shop-code'];
    if (h) return String(h).trim().toUpperCase();
    const own = await Pos.getUserShopCode(req.user.userId);
    if (own) return own;
    if (req.body?.shopCode) return String(req.body.shopCode).trim().toUpperCase();
    if (req.query?.shopCode) return String(req.query.shopCode).trim().toUpperCase();
    return null;
  }
  return Pos.getUserShopCode(req.user.userId);
}

// Elevation: managers (admin / shop-admin) pass straight through; anyone else
// must supply a valid admin/shop-admin username + password in the request body.
async function ensureManager(req) {
  if (['admin', 'shop-admin'].includes(req.user.role)) return;
  const { adminUsername, adminPassword } = req.body || {};
  if (!adminUsername || !adminPassword) {
    const e = new Error('Admin authorization required'); e.code = 'ELEVATION'; throw e;
  }
  await Pos.verifyManagerCredentials(adminUsername, adminPassword);
}

// ── BC stock baseline / fresh loads ──────────────────────────────────────────

export async function bcStockWatermark(req, res) {
  try {
    const shopCode = await userShopCode(req);
    ok(res, { shopCode, watermark: await Stock.getStockWatermark(shopCode) });
  } catch (e) { err(res, e); }
}

export async function resetStockFromBc(req, res) {
  try {
    const shopCode = await userShopCode(req);
    if (!shopCode) return res.status(400).json({ error: 'No shop in context' });
    await ensureManager(req);
    const result = await Stock.resetStockFromBc({
      shopCode,
      company:  req.body?.company || undefined,
      userId:   req.user.userId,
      userName: req.user.userName,
    });
    ok(res, result);
  } catch (e) { err(res, e, e.code === 'ELEVATION' ? 403 : 500); }
}

export async function bcLedgerDates(req, res) {
  try {
    const shopCode = await userShopCode(req);
    const wm = await Stock.getStockWatermark(shopCode);
    if (!wm) return res.status(400).json({ error: 'Run Stock Reset first to set a baseline' });
    const dates = await Stock.bcLedgerDatesSince(wm.SourceCompany || 'FCL', wm.LocationCode, wm.LastEntryNo);
    ok(res, { shopCode, watermark: wm, dates });
  } catch (e) { err(res, e); }
}

export async function loadStockFromBc(req, res) {
  try {
    const shopCode = await userShopCode(req);
    if (!shopCode) return res.status(400).json({ error: 'No shop in context' });
    await ensureManager(req);
    const uptoEntryNo = Number(req.body?.uptoEntryNo || 0);
    if (!uptoEntryNo) return res.status(400).json({ error: 'uptoEntryNo required' });
    const result = await Stock.loadStockFromBc({
      shopCode, uptoEntryNo,
      asOfDate: req.body?.asOfDate || null,
      userId:   req.user.userId,
      userName: req.user.userName,
    });
    ok(res, result);
  } catch (e) { err(res, e, e.code === 'ELEVATION' ? 403 : 500); }
}

// ── Stock Requests ───────────────────────────────────────────────────────────

export async function listRequests(req, res) {
  try {
    const shopCode = await userShopCode(req);
    ok(res, await Stock.listStockRequests({ shopCode, role: req.user.role }));
  } catch (e) {
    logger.error('listRequests failed', {
      error: e.message,
      sqlCode: e.code || e.number,
      user: req.user?.userId,
      role: req.user?.role,
      stack: e.stack,
    });
    return res.status(500).json({
      error: e.message,
      sqlCode: e.code || e.number || null,
      hint: 'See server logs for the full stack trace.',
    });
  }
}

export async function getRequest(req, res) {
  try {
    const r = await Stock.getStockRequest(req.params.requestId);
    if (!r) return res.status(404).json({ error: 'Not found' });
    ok(res, r);
  } catch (e) { err(res, e); }
}

export async function createRequest(req, res) {
  try {
    const shopCode = await userShopCode(req);
    if (!shopCode) return res.status(400).json({ error: 'No shop assigned — pick a shop from the admin selector or set ShopCode on your user profile' });
    const result = await Stock.createStockRequest({
      shopCode,
      requestedBy:   req.user.userId,
      requestedName: req.user.userName,
      notes:         req.body.notes || null,
    });
    ok(res, result);
  } catch (e) { err(res, e); }
}

export async function setRequestLines(req, res) {
  try {
    if (!Array.isArray(req.body.lines)) return res.status(400).json({ error: 'lines required' });
    await Stock.setStockRequestLines(req.params.requestId, req.body.lines);
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}

export async function submitRequest(req, res) {
  try { await Stock.submitStockRequest(req.params.requestId); ok(res, { ok: true }); }
  catch (e) { err(res, e, 400); }
}

export async function approveRequest(req, res) {
  try { await Stock.approveStockRequest(req.params.requestId, req.user.userName); ok(res, { ok: true }); }
  catch (e) { err(res, e, 400); }
}

export async function cancelRequest(req, res) {
  try { await Stock.cancelStockRequest(req.params.requestId); ok(res, { ok: true }); }
  catch (e) { err(res, e, 400); }
}

export async function completeRequest(req, res) {
  try {
    await Stock.completeStockRequest(req.params.requestId, req.body.lines || [], req.user.userId);
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}

// ── POS Reports hub ─────────────────────────────────────────────────────────

function csvBlob(headers, rows, esc = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}) {
  let csv = '﻿' + headers.join(',') + '\r\n';
  for (const r of rows) csv += r.map(esc).join(',') + '\r\n';
  return csv;
}

export async function reportStockPosition(req, res) {
  try {
    const isAdmin = ['admin', 'shop-admin'].includes(req.user.role);
    const shopCode = req.query.shopCode || (isAdmin ? null : await Pos.getUserShopCode(req.user.userId));
    const data = await Stock.stockPositionReport({
      shopCode, dateFrom: req.query.dateFrom, dateTo: req.query.dateTo,
      itemNo: req.query.itemNo || null,
    });
    if (req.query.format === 'csv') {
      const csv = csvBlob(
        ['ItemNo','Description','Opening','TransferIn','PositiveAdj','PortionIn','Sales','WriteOff','PortionOut','NegativeAdj','Closing'],
        data.map(r => [r.itemNo, r.description, r.opening, r.transferIn, r.positiveAdj, r.portionIn, r.sales, r.writeOff, r.portionOut, r.negativeAdj, r.closing])
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="stock-position-${req.query.dateFrom}_${req.query.dateTo}.csv"`);
      return res.send(csv);
    }
    ok(res, data);
  } catch (e) { err(res, e, 400); }
}

export async function reportSalesByItem(req, res) {
  try {
    const isAdmin = ['admin', 'shop-admin'].includes(req.user.role);
    const shopCode = req.query.shopCode || (isAdmin ? null : await Pos.getUserShopCode(req.user.userId));
    const data = await Stock.salesByItemReport({ shopCode, dateFrom: req.query.dateFrom, dateTo: req.query.dateTo });
    if (req.query.format === 'csv') {
      const csv = csvBlob(['ItemNo','Description','Qty','Value'],
                          data.map(r => [r.itemNo, r.description, r.qty, r.value]));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="sales-by-item-${req.query.dateFrom}_${req.query.dateTo}.csv"`);
      return res.send(csv);
    }
    ok(res, data);
  } catch (e) { err(res, e, 400); }
}

export async function reportSalesByContact(req, res) {
  try {
    const isAdmin = ['admin', 'shop-admin'].includes(req.user.role);
    const shopCode = req.query.shopCode || (isAdmin ? null : await Pos.getUserShopCode(req.user.userId));
    const data = await Stock.salesByContactReport({ shopCode, dateFrom: req.query.dateFrom, dateTo: req.query.dateTo });
    if (req.query.format === 'csv') {
      const csv = csvBlob(['ContactNo','ContactName','Orders','Value'],
                          data.map(r => [r.contactNo, r.contactName, r.orders, r.value]));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="sales-by-contact-${req.query.dateFrom}_${req.query.dateTo}.csv"`);
      return res.send(csv);
    }
    ok(res, data);
  } catch (e) { err(res, e, 400); }
}

export async function reportShopComparison(req, res) {
  try {
    const data = await Stock.shopComparisonReport({ dateFrom: req.query.dateFrom, dateTo: req.query.dateTo });
    if (req.query.format === 'csv') {
      const csv = csvBlob(['ShopCode','ShopName','Orders','Value'],
                          data.map(r => [r.shopCode, r.shopName, r.orders, r.value]));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="shop-comparison-${req.query.dateFrom}_${req.query.dateTo}.csv"`);
      return res.send(csv);
    }
    ok(res, data);
  } catch (e) { err(res, e, 400); }
}

// ── Stock take approval workflow + BC export ────────────────────────────────

export async function submitTake(req, res) {
  try {
    await Stock.submitStockTake(req.params.stockTakeId, req.user.userName || req.user.userId);
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}

export async function approveTake(req, res) {
  try {
    await Stock.approveStockTake(req.params.stockTakeId, req.user.userName || req.user.userId);
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}

export async function exportTakeBcJournal(req, res) {
  try {
    const { csv, fileName } = await Stock.buildStockTakeBcJournal(req.params.stockTakeId, {
      documentNo:  req.query.documentNo  || null,
      postingDate: req.query.postingDate || null,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(csv);
  } catch (e) { err(res, e, 400); }
}

export async function exportRequestBcJournal(req, res) {
  try {
    const { csv, fileName } = await Stock.buildStockRequestBcJournal(req.params.requestId, {
      documentNo:  req.query.documentNo  || null,
      postingDate: req.query.postingDate || null,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(csv);
  } catch (e) { err(res, e, 400); }
}

// ── Daily Movements Report ───────────────────────────────────────────────────

export async function dailyReport(req, res) {
  try {
    const shopCode = await userShopCode(req);
    if (!shopCode) return res.status(400).json({ error: 'shopCode required' });
    const dateFrom = req.query.dateFrom || new Date().toISOString().slice(0, 10);
    const dateTo   = req.query.dateTo   || dateFrom;
    const itemNo   = req.query.itemNo   || null;
    ok(res, await Stock.dailyMovementsReport({ shopCode, dateFrom, dateTo, itemNo }));
  } catch (e) { err(res, e); }
}

export async function dailyReportCsv(req, res) {
  try {
    const shopCode = await userShopCode(req);
    if (!shopCode) return res.status(400).json({ error: 'shopCode required' });
    const dateFrom = req.query.dateFrom || new Date().toISOString().slice(0, 10);
    const dateTo   = req.query.dateTo   || dateFrom;
    const itemNo   = req.query.itemNo   || null;
    const q        = req.query.q || '';
    let rows = await Stock.dailyMovementsReport({ shopCode, dateFrom, dateTo, itemNo });
    if (q) {
      const ql = String(q).toLowerCase();
      rows = rows.filter(r => `${r.itemNo} ${r.description}`.toLowerCase().includes(ql));
    }
    const esc = (v) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const fmtDate = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';
    const headers = ['Date','Shop','ItemNo','Description','Opening','TransferIn','PositiveAdj','Sales','NegativeAdj','Closing'];
    let csv = '﻿' + headers.join(',') + '\r\n';   // UTF-8 BOM for Excel
    for (const r of rows) {
      csv += [fmtDate(r.date), shopCode, r.itemNo, r.description,
              r.opening, r.transferIn, r.positiveAdj, r.sales, r.negativeAdj, r.closing]
              .map(esc).join(',') + '\r\n';
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',
      `attachment; filename="stock-movements-${shopCode}-${dateFrom}_${dateTo}.csv"`);
    return res.send(csv);
  } catch (e) { err(res, e); }
}

// ── Stock Take ───────────────────────────────────────────────────────────────

export async function listTakes(req, res) {
  try {
    const shopCode = await userShopCode(req);
    ok(res, await Stock.listStockTakes({ shopCode, role: req.user.role }));
  } catch (e) { err(res, e); }
}

export async function getTake(req, res) {
  try {
    const t = await Stock.getStockTake(req.params.stockTakeId);
    if (!t) return res.status(404).json({ error: 'Not found' });
    ok(res, t);
  } catch (e) { err(res, e); }
}

export async function createTake(req, res) {
  try {
    const shopCode = await userShopCode(req);
    if (!shopCode) return res.status(400).json({ error: 'No shop assigned — pick a shop from the admin selector or set ShopCode on your user profile' });
    if (!req.body.dateFrom || !req.body.dateTo) return res.status(400).json({ error: 'dateFrom/dateTo required' });
    const result = await Stock.createStockTake({
      shopCode,
      dateFrom:  req.body.dateFrom,
      dateTo:    req.body.dateTo,
      countedBy: req.user.userName,
      notes:     req.body.notes || null,
    });
    ok(res, result);
  } catch (e) { err(res, e); }
}

export async function updateTakeLine(req, res) {
  try {
    await Stock.updateStockTakeLine(req.params.lineId, {
      physicalStock: req.body.physicalStock,
      comments:      req.body.comments,
    });
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}

export async function completeTake(req, res) {
  try {
    await Stock.completeStockTake(req.params.stockTakeId, req.user.userId);
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}

export async function itemTransactions(req, res) {
  try {
    const shopCode = req.user.role === 'admin'
      ? (req.query.shopCode || await Pos.getUserShopCode(req.user.userId))
      : await Pos.getUserShopCode(req.user.userId);
    if (!shopCode) return res.status(400).json({ error: 'shopCode required' });
    if (!req.query.itemNo) return res.status(400).json({ error: 'itemNo required' });
    const dateFrom = req.query.dateFrom || new Date().toISOString().slice(0, 10);
    const dateTo   = req.query.dateTo   || dateFrom;
    ok(res, await Stock.listItemTransactions({ shopCode, itemNo: req.query.itemNo, dateFrom, dateTo }));
  } catch (e) { err(res, e); }
}
