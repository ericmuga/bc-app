/**
 * controllers/auditController.js
 * Read-only audit log endpoints — visible to admin / shop-admin only (wired in routes/index.js).
 */
import * as Audit from '../services/audit.js';
import logger from '../services/logger.js';

function ok(res, data) { return res.json(data); }
function err(res, e, code = 500) {
  logger.error('audit error', { error: e.message });
  return res.status(code).json({ error: e.message });
}

export async function listEntries(req, res) {
  try {
    const data = await Audit.listAudit({
      userId:     req.query.userId     || null,
      role:       req.query.role       || null,
      dateFrom:   req.query.dateFrom   || null,
      dateTo:     req.query.dateTo     || null,
      entityType: req.query.entityType || null,
      action:     req.query.action     || null,
      q:          req.query.q          || null,
      limit:      req.query.limit      || 500,
    });
    ok(res, data);
  } catch (e) { err(res, e); }
}

export async function listByUser(req, res) {
  try {
    if (!req.query.dateFrom || !req.query.dateTo) {
      return res.status(400).json({ error: 'dateFrom, dateTo required' });
    }
    const data = await Audit.listAuditByUser({
      dateFrom: req.query.dateFrom,
      dateTo:   req.query.dateTo,
      userId:   req.query.userId || null,
    });
    ok(res, data);
  } catch (e) { err(res, e); }
}

export async function exportCsv(req, res) {
  try {
    const rows = await Audit.listAudit({
      userId:     req.query.userId     || null,
      role:       req.query.role       || null,
      dateFrom:   req.query.dateFrom   || null,
      dateTo:     req.query.dateTo     || null,
      entityType: req.query.entityType || null,
      action:     req.query.action     || null,
      q:          req.query.q          || null,
      limit:      req.query.limit      || 5000,
    });
    const esc = (v) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const fmt = (d) => d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) : '';
    const header = ['OccurredAt','UserName','Role','Action','Method','Path','EntityType','EntityId','Status','Ip'];
    let csv = '﻿' + header.join(',') + '\r\n';
    for (const r of rows) {
      csv += [fmt(r.OccurredAt), r.UserName, r.Role, r.Action, r.Method, r.Path,
              r.EntityType, r.EntityId, r.Status, r.Ip].map(esc).join(',') + '\r\n';
    }
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${stamp}.csv"`);
    return res.send(csv);
  } catch (e) { err(res, e); }
}
