/**
 * controllers/posYieldController.js
 * Third-party transfers, portionings, write-offs, and the yield report.
 */
import * as Pos   from '../models/PosModel.js';
import * as Yield from '../models/PosYieldModel.js';
import logger from '../services/logger.js';

function ok(res, data) { return res.json(data); }
function err(res, e, code = 500) {
  logger.error('pos-yield error', { error: e.message });
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

// ── Third Parties ───────────────────────────────────────────────────────────

export async function listThirdParties(req, res) {
  try { ok(res, await Yield.listThirdParties()); } catch (e) { err(res, e); }
}
export async function saveThirdParty(req, res) {
  try {
    const id = await Yield.saveThirdParty({ thirdPartyId: req.params.thirdPartyId || null, ...req.body });
    ok(res, { thirdPartyId: id });
  } catch (e) { err(res, e); }
}
export async function deleteThirdParty(req, res) {
  try { await Yield.deleteThirdParty(req.params.thirdPartyId); ok(res, { ok: true }); }
  catch (e) { err(res, e); }
}

// ── Transfers ───────────────────────────────────────────────────────────────

export async function listTransfers(req, res) {
  try {
    // Admin and shop-admin see all transfers; regular shop role sees only those routed to their shop
    const isManager = ['admin', 'shop-admin'].includes(req.user.role);
    const shopCode = isManager ? null : await Pos.getUserShopCode(req.user.userId);
    ok(res, await Yield.listTransfers({ shopCode }));
  } catch (e) { err(res, e); }
}
export async function getTransfer(req, res) {
  try {
    const t = await Yield.getTransfer(req.params.transferId);
    if (!t) return res.status(404).json({ error: 'Not found' });
    ok(res, t);
  } catch (e) { err(res, e); }
}
export async function createTransfer(req, res) {
  try {
    if (!req.body.thirdPartyId) return res.status(400).json({ error: 'thirdPartyId required (HQ → third party)' });
    const result = await Yield.createTransfer({
      transferDate: req.body.transferDate,
      thirdPartyId: req.body.thirdPartyId,
      notes:        req.body.notes,
      createdBy:    req.user.userId,
    });
    ok(res, result);
  } catch (e) { err(res, e, 400); }
}
export async function setTransferLines(req, res) {
  try {
    if (!Array.isArray(req.body.lines)) return res.status(400).json({ error: 'lines required' });
    await Yield.setTransferLines(req.params.transferId, req.body.lines);
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}
export async function postTransfer(req, res) {
  try { await Yield.postTransfer(req.params.transferId); ok(res, { ok: true }); }
  catch (e) { err(res, e, 400); }
}

// ── Portionings ─────────────────────────────────────────────────────────────

export async function listPortionings(req, res) {
  try {
    const shopCode = await shopCodeFor(req);
    ok(res, await Yield.listPortionings({ shopCode }));
  } catch (e) { err(res, e); }
}
export async function getPortioning(req, res) {
  try {
    const p = await Yield.getPortioning(req.params.portioningId);
    if (!p) return res.status(404).json({ error: 'Not found' });
    ok(res, p);
  } catch (e) { err(res, e); }
}
export async function createPortioning(req, res) {
  try {
    const shopCode = req.body.shopCode || await shopCodeFor(req);
    if (!shopCode) return res.status(400).json({ error: 'shopCode required' });
    const result = await Yield.createPortioning({
      portioningDate:       req.body.portioningDate,
      sourceTransferLineId: req.body.sourceTransferLineId,
      shopCode,
      notes:                req.body.notes,
      createdBy:            req.user.userId,
    });
    ok(res, result);
  } catch (e) { err(res, e); }
}
export async function setPortioningLines(req, res) {
  try {
    if (!Array.isArray(req.body.lines)) return res.status(400).json({ error: 'lines required' });
    await Yield.setPortioningLines(req.params.portioningId, req.body.lines);
    ok(res, { ok: true });
  } catch (e) { err(res, e, 400); }
}
export async function postPortioning(req, res) {
  try { await Yield.postPortioning(req.params.portioningId); ok(res, { ok: true }); }
  catch (e) { err(res, e, 400); }
}

// ── Write-offs ──────────────────────────────────────────────────────────────

export async function listWriteOffs(req, res) {
  try {
    const shopCode = await shopCodeFor(req);
    ok(res, await Yield.listWriteOffs({
      shopCode,
      dateFrom: req.query.dateFrom,
      dateTo:   req.query.dateTo,
    }));
  } catch (e) { err(res, e); }
}
export async function postWriteOff(req, res) {
  try {
    const shopCode = req.body.shopCode || await shopCodeFor(req);
    if (!shopCode) return res.status(400).json({ error: 'shopCode required' });
    const result = await Yield.postWriteOff({
      shopCode,
      writeOffDate:         req.body.writeOffDate,
      itemNo:               req.body.itemNo,
      description:          req.body.description,
      quantity:             req.body.quantity,
      unitOfMeasure:        req.body.unitOfMeasure,
      unitCost:             req.body.unitCost,
      reason:               req.body.reason,
      notes:                req.body.notes,
      sourceTransferLineId: req.body.sourceTransferLineId,
      sourcePortioningId:   req.body.sourcePortioningId,
      createdBy:            req.user.userId,
    });
    ok(res, result);
  } catch (e) { err(res, e, 400); }
}

// ── Manual sales (for portion items not sold via POS terminal) ─────────────

export async function listManualSales(req, res) {
  try {
    const shopCode = await shopCodeFor(req);
    ok(res, await Yield.listManualSales({
      shopCode,
      dateFrom: req.query.dateFrom,
      dateTo:   req.query.dateTo,
    }));
  } catch (e) { err(res, e); }
}

export async function recordManualSaleBatch(req, res) {
  try {
    const shopCode = req.body.shopCode || await shopCodeFor(req);
    if (!shopCode) return res.status(400).json({ error: 'shopCode required' });
    if (!Array.isArray(req.body.lines) || !req.body.lines.length) {
      return res.status(400).json({ error: 'lines array required' });
    }
    const result = await Yield.recordManualSalesBatch({
      shopCode,
      saleDate:  req.body.saleDate,
      notes:     req.body.notes,
      lines:     req.body.lines,
      createdBy: req.user.userId,
    });
    ok(res, result);
  } catch (e) { err(res, e, 400); }
}

export async function recordManualSale(req, res) {
  try {
    const shopCode = req.body.shopCode || await shopCodeFor(req);
    if (!shopCode) return res.status(400).json({ error: 'shopCode required' });
    const result = await Yield.recordManualSale({
      shopCode,
      saleDate:      req.body.saleDate,
      itemNo:        req.body.itemNo,
      description:   req.body.description,
      quantity:      req.body.quantity,
      unitOfMeasure: req.body.unitOfMeasure,
      unitPrice:     req.body.unitPrice,
      notes:         req.body.notes,
      createdBy:     req.user.userId,
    });
    ok(res, result);
  } catch (e) { err(res, e, 400); }
}

// ── Excel/CSV export (header + lines combined for analysis) ─────────────────

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells) { return cells.map(csvEscape).join(',') + '\r\n'; }

function applyClientFilters(rows, { itemNo, search }) {
  if (!itemNo && !search) return rows;
  const q = (search || '').toLowerCase();
  return rows.filter(r => {
    if (itemNo && String(r.itemNo || '').toUpperCase() !== String(itemNo).toUpperCase()) return false;
    if (q && !`${r.itemNo || ''} ${r.description || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function withinDate(d, from, to) {
  if (!d) return true;
  const x = new Date(d).toISOString().slice(0, 10);
  if (from && x < from) return false;
  if (to   && x > to)   return false;
  return true;
}

export async function exportYieldCsv(req, res) {
  try {
    const { kind } = req.params;
    const dateFrom = req.query.dateFrom || null;
    const dateTo   = req.query.dateTo   || null;
    const itemNo   = req.query.itemNo   || null;
    const search   = req.query.q        || null;
    const shopCode = await shopCodeFor(req);

    let header = [];
    let rows   = [];

    if (kind === 'transfers') {
      const isManager = ['admin', 'shop-admin'].includes(req.user.role);
      const list = await Yield.listTransfers({ shopCode: isManager ? null : shopCode });
      header = ['TransferNo','TransferDate','ThirdParty','DestinationShop','Status','HeaderTotalCost',
                'ItemNo','Description','Quantity','UoM','UnitCost','LineCost'];
      for (const h of list) {
        if (!withinDate(h.TransferDate, dateFrom, dateTo)) continue;
        const detail = await Yield.getTransfer(h.TransferId);
        const filtered = applyClientFilters(detail.lines, { itemNo, search });
        if (!filtered.length) continue;
        for (const l of filtered) {
          rows.push([
            detail.transferNo, new Date(detail.transferDate).toISOString().slice(0,10),
            detail.thirdPartyName || '', detail.destinationShopCode || '',
            detail.status, detail.totalCost,
            l.itemNo, l.description, l.quantity, l.unitOfMeasure, l.unitCost, l.lineCost,
          ]);
        }
      }
    } else if (kind === 'portionings') {
      const list = await Yield.listPortionings({ shopCode });
      header = ['PortioningNo','PortioningDate','Shop','Status','SourceItemNo','SourceDescription','SourceQty','SourceUoM','SourceTotalCost',
                'OutputItemNo','OutputDescription','OutputQty','OutputUoM','AllocatedCost'];
      for (const h of list) {
        if (!withinDate(h.PortioningDate, dateFrom, dateTo)) continue;
        const detail = await Yield.getPortioning(h.PortioningId);
        const filtered = applyClientFilters(detail.lines, { itemNo, search });
        if (!filtered.length && itemNo) continue;
        const lines = filtered.length ? filtered : detail.lines;
        if (!lines.length) {
          rows.push([
            detail.portioningNo, new Date(detail.portioningDate).toISOString().slice(0,10),
            detail.shopCode, detail.status,
            detail.sourceItemNo, detail.sourceDescription, detail.sourceQuantity, detail.sourceUom, detail.sourceTotalCost,
            '', '', '', '', '',
          ]);
          continue;
        }
        for (const l of lines) {
          rows.push([
            detail.portioningNo, new Date(detail.portioningDate).toISOString().slice(0,10),
            detail.shopCode, detail.status,
            detail.sourceItemNo, detail.sourceDescription, detail.sourceQuantity, detail.sourceUom, detail.sourceTotalCost,
            l.itemNo, l.description, l.quantity, l.unitOfMeasure, l.allocatedCost,
          ]);
        }
      }
    } else if (kind === 'manual-sales') {
      const list = await Yield.listManualSales({ shopCode, dateFrom, dateTo });
      header = ['ManualSaleNo','SaleDate','Shop','ItemNo','Description','Quantity','UoM','UnitPrice','TotalAmount','Notes','CreatedBy'];
      const filtered = list.filter(r => {
        if (itemNo && String(r.ItemNo || '').toUpperCase() !== String(itemNo).toUpperCase()) return false;
        if (search) {
          const q = String(search).toLowerCase();
          if (!`${r.ItemNo || ''} ${r.Description || ''}`.toLowerCase().includes(q)) return false;
        }
        return true;
      });
      for (const r of filtered) {
        rows.push([
          r.ManualSaleNo, new Date(r.SaleDate).toISOString().slice(0,10),
          r.ShopCode, r.ItemNo, r.Description, Number(r.Quantity),
          r.UnitOfMeasure || '', Number(r.UnitPrice), Number(r.TotalAmount),
          r.Notes || '', r.CreatedBy || '',
        ]);
      }
    } else if (kind === 'write-offs') {
      const list = await Yield.listWriteOffs({ shopCode, dateFrom, dateTo });
      header = ['WriteOffNo','WriteOffDate','Shop','ItemNo','Description','Quantity','UoM','UnitCost','TotalCost','Reason','Notes','CreatedBy'];
      const filtered = list.filter(r => {
        if (itemNo && String(r.ItemNo || '').toUpperCase() !== String(itemNo).toUpperCase()) return false;
        if (search) {
          const q = String(search).toLowerCase();
          if (!`${r.ItemNo || ''} ${r.Description || ''}`.toLowerCase().includes(q)) return false;
        }
        return true;
      });
      for (const r of filtered) {
        rows.push([
          r.WriteOffNo, new Date(r.WriteOffDate).toISOString().slice(0,10),
          r.ShopCode, r.ItemNo, r.Description, Number(r.Quantity),
          r.UnitOfMeasure || '', Number(r.UnitCost), Number(r.TotalCost),
          r.Reason || '', r.Notes || '', r.CreatedBy || '',
        ]);
      }
    } else {
      return res.status(400).json({ error: 'unknown kind — use transfers|portionings|manual-sales|write-offs' });
    }

    let csv = '﻿';   // BOM so Excel detects UTF-8
    csv += csvRow(header);
    for (const r of rows) csv += csvRow(r);

    const stamp = new Date().toISOString().slice(0,10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="yield-${kind}-${stamp}.csv"`);
    return res.send(csv);
  } catch (e) { return err(res, e); }
}

// ── Yield report ────────────────────────────────────────────────────────────

export async function yieldReport(req, res) {
  try {
    const shopCode = await shopCodeFor(req);
    const dateFrom = req.query.dateFrom;
    const dateTo   = req.query.dateTo;
    if (!dateFrom || !dateTo) return res.status(400).json({ error: 'dateFrom, dateTo required' });
    ok(res, await Yield.yieldReport({ dateFrom, dateTo, shopCode }));
  } catch (e) { err(res, e); }
}
