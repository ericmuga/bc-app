/**
 * controllers/passwordResetAdminController.js
 *
 * Admin endpoints for the password-reset feature:
 *   • read the audit log
 *   • manage the privileged allowlist (selected Domain Admins)
 *   • manage the explicit blocklist
 *
 * All routes are mounted under /api/admin/password-reset/* and protected by
 * the standard adminOnly middleware in routes/index.js.
 */
import { db, sql } from '../db/pool.js';
import * as audit from '../services/passwordReset/auditService.js';
import logger from '../services/logger.js';

// ── Audit ───────────────────────────────────────────────────────────────────

export async function listAudit(req, res) {
  try {
    const rows = await audit.list({
      username:  req.query.username,
      eventType: req.query.eventType,
      since:     req.query.since,
      limit:     req.query.limit,
    });
    return res.json(rows);
  } catch (err) {
    logger.error('pr/admin/listAudit error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

// ── Allowlist (privileged users approved for self-service reset) ────────────

export async function listAllowlist(_req, res) {
  try {
    const pool = await db.getPool();
    const { recordset } = await pool.request().query(`
      SELECT AllowId, Username, Reason, CreatedBy, IsActive, CreatedAt, UpdatedAt
      FROM [dbo].[PasswordResetAllowlist]
      ORDER BY Username
    `);
    return res.json(recordset);
  } catch (err) {
    logger.error('pr/admin/listAllowlist error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function addAllowlist(req, res) {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const reason   = String(req.body?.reason   || '').trim() || null;
  if (!username) return res.status(400).json({ error: 'username is required' });

  try {
    const pool = await db.getPool();
    const r = pool.request();
    r.input('Username',  sql.NVarChar(100), username);
    r.input('Reason',    sql.NVarChar(300), reason);
    r.input('CreatedBy', sql.NVarChar(100), req.user?.userName || null);
    await r.query(`
      MERGE [dbo].[PasswordResetAllowlist] AS t
      USING (SELECT @Username AS Username) AS s ON LOWER(t.Username) = LOWER(s.Username)
      WHEN MATCHED THEN
        UPDATE SET Reason = @Reason, IsActive = 1, UpdatedAt = GETUTCDATE()
      WHEN NOT MATCHED THEN
        INSERT (Username, Reason, CreatedBy) VALUES (@Username, @Reason, @CreatedBy);
    `);
    return res.status(201).json({ message: 'Allowlist entry saved', username });
  } catch (err) {
    logger.error('pr/admin/addAllowlist error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function removeAllowlist(req, res) {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id is required' });
  try {
    const pool = await db.getPool();
    const r = pool.request();
    r.input('AllowId', sql.UniqueIdentifier, id);
    await r.query(`DELETE FROM [dbo].[PasswordResetAllowlist] WHERE AllowId = @AllowId`);
    return res.json({ message: 'Removed' });
  } catch (err) {
    logger.error('pr/admin/removeAllowlist error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

// ── Blocklist (always denied) ───────────────────────────────────────────────

export async function listBlocklist(_req, res) {
  try {
    const pool = await db.getPool();
    const { recordset } = await pool.request().query(`
      SELECT BlockId, Username, Reason, CreatedBy, IsActive, CreatedAt, UpdatedAt
      FROM [dbo].[PasswordResetBlocklist]
      ORDER BY Username
    `);
    return res.json(recordset);
  } catch (err) {
    logger.error('pr/admin/listBlocklist error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function addBlocklist(req, res) {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const reason   = String(req.body?.reason   || '').trim();
  if (!username) return res.status(400).json({ error: 'username is required' });
  if (!reason)   return res.status(400).json({ error: 'reason is required' });

  try {
    const pool = await db.getPool();
    const r = pool.request();
    r.input('Username',  sql.NVarChar(100), username);
    r.input('Reason',    sql.NVarChar(300), reason);
    r.input('CreatedBy', sql.NVarChar(100), req.user?.userName || null);
    await r.query(`
      MERGE [dbo].[PasswordResetBlocklist] AS t
      USING (SELECT @Username AS Username) AS s ON LOWER(t.Username) = LOWER(s.Username)
      WHEN MATCHED THEN
        UPDATE SET Reason = @Reason, IsActive = 1, UpdatedAt = GETUTCDATE()
      WHEN NOT MATCHED THEN
        INSERT (Username, Reason, CreatedBy) VALUES (@Username, @Reason, @CreatedBy);
    `);
    return res.status(201).json({ message: 'Blocklist entry saved', username });
  } catch (err) {
    logger.error('pr/admin/addBlocklist error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function removeBlocklist(req, res) {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'id is required' });
  try {
    const pool = await db.getPool();
    const r = pool.request();
    r.input('BlockId', sql.UniqueIdentifier, id);
    await r.query(`DELETE FROM [dbo].[PasswordResetBlocklist] WHERE BlockId = @BlockId`);
    return res.json({ message: 'Removed' });
  } catch (err) {
    logger.error('pr/admin/removeBlocklist error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}
