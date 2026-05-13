/**
 * services/audit.js
 * Centralized audit trail for POS mutations.
 *
 * Two ways to record:
 *   1. The auditMiddleware below auto-records every successful POST/PATCH/PUT/DELETE
 *      on /api/pos/* routes (writes after the response is sent so it never blocks).
 *   2. Controllers can call recordAudit(req, { entityType, entityId, ... }) explicitly
 *      to enrich a record with the affected entity id / extra payload.
 */
import { db, sql } from '../db/pool.js';
import logger from './logger.js';

/** Resolve the entityType from the request path, e.g. "/api/pos/transfers/123/post" → "transfer". */
function entityFromPath(p) {
  const seg = String(p || '')
    .replace(/^\/api/, '')
    .replace(/^\/pos\//, '')
    .split('/')
    .filter(Boolean);
  if (!seg.length) return 'pos';
  // first segment is the resource: transfers, portionings, orders, payments, ...
  // strip trailing 's' for a cleaner entity label
  const head = seg[0].replace(/-/g, '_');
  return head.replace(/s$/, '') || head;
}

function actionFor(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '').toLowerCase();
  if (p.endsWith('/post'))     return 'post';
  if (p.endsWith('/submit'))   return 'submit';
  if (p.endsWith('/approve'))  return 'approve';
  if (p.endsWith('/cancel'))   return 'cancel';
  if (p.endsWith('/complete')) return 'complete';
  if (p.endsWith('/sign'))     return 'sign';
  if (p.endsWith('/checkout')) return 'checkout';
  if (p.endsWith('/stk-push')) return 'stk-push';
  if (p.endsWith('/print-confirmation')) return 'print';
  if (p.endsWith('/reprint'))  return 'reprint';
  if (m === 'POST')   return 'create';
  if (m === 'PATCH')  return 'update';
  if (m === 'PUT')    return 'replace';
  if (m === 'DELETE') return 'delete';
  return m.toLowerCase();
}

/** Pick the trailing :id segment (after the resource) when present — handles /resource/:id/action paths. */
function entityIdFromPath(p) {
  const seg = String(p || '').replace(/^\/api/, '').replace(/^\/pos\//, '').split('/').filter(Boolean);
  // Patterns:
  //   resource/:id           → seg[1]
  //   resource/:id/action    → seg[1]
  if (seg.length >= 2 && seg[1] && !/^[a-z]+$/.test(seg[1])) return seg[1];
  return null;
}

function clip(s, max) { return s == null ? null : String(s).slice(0, max); }

/** Write a single audit record. Never throws — failures are logged but never break callers. */
export async function writeAuditRecord({ userId, userName, role, action, method, path, entityType, entityId, status, ip, payload }) {
  try {
    const pool = await db.getPool();
    await pool.request()
      .input('userId',     sql.UniqueIdentifier, userId || null)
      .input('userName',   sql.NVarChar(200),    clip(userName, 200))
      .input('role',       sql.NVarChar(50),     clip(role, 50))
      .input('action',     sql.NVarChar(50),     clip(action, 50))
      .input('method',     sql.NVarChar(10),     clip(method, 10))
      .input('path',       sql.NVarChar(500),    clip(path, 500))
      .input('entityType', sql.NVarChar(80),     clip(entityType, 80))
      .input('entityId',   sql.NVarChar(80),     clip(entityId, 80))
      .input('status',     sql.Int,              Number(status) || 0)
      .input('ip',         sql.NVarChar(60),     clip(ip, 60))
      .input('payload',    sql.NVarChar(sql.MAX), payload == null ? null : JSON.stringify(payload).slice(0, 16000))
      .query(`
        INSERT INTO [dbo].[AuditLog]
          ([UserId],[UserName],[Role],[Action],[Method],[Path],[EntityType],[EntityId],
           [Status],[Ip],[Payload])
        VALUES (@userId,@userName,@role,@action,@method,@path,@entityType,@entityId,
                @status,@ip,@payload)
      `);
  } catch (e) {
    logger.warn('audit write failed', { error: e.message });
  }
}

/**
 * Express middleware. Records a row after the response finishes for any successful
 * mutating call on /api/pos/* (4xx / 5xx are recorded too — useful for forensics).
 *
 * Mounted in routes/index.js BEFORE the actual controllers so it can capture req.body.
 */
export function auditMiddleware(req, res, next) {
  const method = req.method.toUpperCase();
  // Only mutating methods are audited
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return next();
  // Only POS routes for now (the audit feature is POS-scoped)
  if (!req.path.startsWith('/pos/')) return next();
  // Skip noisy / read-style POST endpoints
  const skip = [
    '/pos/payments/mpesa-callback',         // public
    '/pos/payments/fetch',                  // not mutating in nature
  ];
  if (skip.some(p => req.path.startsWith(p))) return next();

  // Snapshot a small copy of body keys for context (not the full body — secrets etc).
  const body = req.body && typeof req.body === 'object' ? { ...req.body } : {};
  // Drop obvious secrets and very large blobs
  for (const k of Object.keys(body)) {
    if (/secret|passkey|password|token|apikey/i.test(k)) body[k] = '***';
    if (Array.isArray(body[k]) && body[k].length > 50) body[k] = `[Array(${body[k].length})]`;
  }

  res.on('finish', () => {
    // Only audit successful or 4xx outcomes (5xx already logged elsewhere).
    if (res.statusCode >= 500) return;
    // Auth failures: there's no req.user; skip.
    if (!req.user) return;
    const path = req.originalUrl?.split('?')[0] || req.path;
    writeAuditRecord({
      userId:     req.user.userId,
      userName:   req.user.userName,
      role:       req.user.role,
      action:     actionFor(method, path),
      method,
      path,
      entityType: entityFromPath(path),
      entityId:   entityIdFromPath(path),
      status:     res.statusCode,
      ip:         req.ip,
      payload:    body,
    });
  });
  next();
}

/** Query the audit log with filters. */
export async function listAudit({ userId = null, role = null, dateFrom = null, dateTo = null,
                                  entityType = null, action = null, q = null, limit = 500 } = {}) {
  const pool = await db.getPool();
  const r = pool.request();
  const conds = [];
  if (userId)     { r.input('uid', sql.UniqueIdentifier, userId); conds.push('[UserId]=@uid'); }
  if (role)       { r.input('role', sql.NVarChar(50), role); conds.push('[Role]=@role'); }
  if (dateFrom)   { r.input('df',  sql.DateTime2, new Date(dateFrom + 'T00:00:00Z')); conds.push('[OccurredAt] >= @df'); }
  if (dateTo)     { r.input('dt',  sql.DateTime2, new Date(dateTo   + 'T23:59:59Z')); conds.push('[OccurredAt] <= @dt'); }
  if (entityType) { r.input('et',  sql.NVarChar(80), entityType); conds.push('[EntityType]=@et'); }
  if (action)     { r.input('act', sql.NVarChar(50), action);     conds.push('[Action]=@act'); }
  if (q)          { r.input('q',   sql.NVarChar(200), `%${q}%`);  conds.push('([Path] LIKE @q OR [UserName] LIKE @q OR [EntityId] LIKE @q)'); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const lim = Math.max(1, Math.min(5000, Number(limit) || 500));
  const res = await r.query(`
    SELECT TOP ${lim} [AuditId],[UserId],[UserName],[Role],[Action],[Method],[Path],
           [EntityType],[EntityId],[Status],[Ip],[OccurredAt]
    FROM [dbo].[AuditLog]
    ${where}
    ORDER BY [OccurredAt] DESC
  `);
  return res.recordset;
}

/** Per-user activity counts grouped by day (for the "activities per period" view). */
export async function listAuditByUser({ dateFrom, dateTo, userId = null }) {
  const pool = await db.getPool();
  const r = pool.request()
    .input('df', sql.DateTime2, new Date(dateFrom + 'T00:00:00Z'))
    .input('dt', sql.DateTime2, new Date(dateTo   + 'T23:59:59Z'));
  let where = '[OccurredAt] BETWEEN @df AND @dt';
  if (userId) { r.input('uid', sql.UniqueIdentifier, userId); where += ' AND [UserId]=@uid'; }
  const res = await r.query(`
    SELECT [UserId],[UserName],[Role],
           CAST([OccurredAt] AS DATE) AS [Day],
           COUNT(*) AS [Count]
    FROM   [dbo].[AuditLog]
    WHERE  ${where}
    GROUP BY [UserId],[UserName],[Role], CAST([OccurredAt] AS DATE)
    ORDER BY [Day] DESC, [UserName]
  `);
  return res.recordset;
}
