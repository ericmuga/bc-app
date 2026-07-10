/**
 * services/passwordReset/auditService.js
 *
 * Writes security-relevant events to [dbo].[PasswordResetAuditLogs].
 * Designed to NEVER throw — audit failures should not block reset attempts,
 * they're logged via winston as a fallback.
 */
import { db, sql } from '../../db/pool.js';
import logger from '../logger.js';

export const EVENTS = Object.freeze({
  REQUEST_RECEIVED:            'RESET_REQUEST_RECEIVED',
  ACCOUNT_NOT_FOUND:           'ACCOUNT_NOT_FOUND',
  ACCOUNT_DISABLED:            'ACCOUNT_DISABLED_BLOCKED',
  ACCOUNT_LOCKED:              'ACCOUNT_LOCKED_BLOCKED',
  PRIVILEGED_BLOCKED:          'ACCOUNT_PRIVILEGED_BLOCKED',
  PRIVILEGED_ALLOWED_TIER:     'ACCOUNT_PRIVILEGED_TIERED',
  SERVICE_BLOCKED:             'ACCOUNT_SERVICE_BLOCKED',
  EXPLICIT_BLOCKLIST:          'ACCOUNT_EXPLICITLY_BLOCKED',
  OUT_OF_SCOPE_OU:             'ACCOUNT_OUT_OF_SCOPE_OU',
  NO_DELIVERY_METHOD:          'NO_DELIVERY_METHOD_BLOCKED',
  PRIV_MISSING_DUAL_CHANNEL:   'PRIVILEGED_MISSING_DUAL_CHANNEL',
  OTP_CREATED:                 'OTP_CREATED',
  OTP_SENT_EMAIL:              'OTP_SENT_EMAIL',
  OTP_SENT_SMS:                'OTP_SENT_SMS',
  OTP_SEND_FAILED:             'OTP_SEND_FAILED',
  OTP_VERIFY_SUCCESS:          'OTP_VERIFY_SUCCESS',
  OTP_VERIFY_FAILED:           'OTP_VERIFY_FAILED',
  OTP_EXPIRED:                 'OTP_EXPIRED',
  OTP_MAX_ATTEMPTS:            'OTP_MAX_ATTEMPTS_EXCEEDED',
  OTP_RESEND_COOLDOWN:         'OTP_RESEND_COOLDOWN',
  OTP_DAILY_LIMIT:             'OTP_DAILY_LIMIT_REACHED',
  RESET_TOKEN_CREATED:         'RESET_TOKEN_CREATED',
  RESET_TOKEN_INVALID:         'RESET_TOKEN_INVALID',
  RESET_TOKEN_EXPIRED:         'RESET_TOKEN_EXPIRED',
  RESET_TOKEN_BINDING_MISMATCH:'RESET_TOKEN_BINDING_MISMATCH',
  PASSWORD_POLICY_FAILED:      'PASSWORD_POLICY_FAILED',
  PASSWORD_RESET_SUCCESS:      'PASSWORD_RESET_SUCCESS',
  PASSWORD_RESET_FAILED:       'PASSWORD_RESET_FAILED',
  RATE_LIMIT_BLOCKED:          'RATE_LIMIT_BLOCKED',
  SUSPICIOUS_ACTIVITY:         'SUSPICIOUS_ACTIVITY_BLOCKED',
});

/**
 * Write one audit row. Never throws.
 *
 * @param {object} evt
 * @param {string} evt.eventType        from EVENTS
 * @param {'ok'|'blocked'|'failed'} evt.status
 * @param {string} [evt.username]
 * @param {string} [evt.reason]
 * @param {string} [evt.challengeId]
 * @param {'standard'|'privileged'} [evt.tier]
 * @param {string} [evt.destinationMasked]
 * @param {string} [evt.ipAddress]
 * @param {string} [evt.userAgent]
 * @param {string} [evt.correlationId]
 * @param {object} [evt.metadata]
 */
export async function record(evt) {
  try {
    const pool = await db.getPool();
    const req  = pool.request();
    req.input('Username',          sql.NVarChar(100), evt.username ?? null);
    req.input('EventType',         sql.NVarChar(80),  evt.eventType);
    req.input('Status',            sql.NVarChar(20),  evt.status);
    req.input('Reason',            sql.NVarChar(300), evt.reason ?? null);
    req.input('ChallengeId',       sql.UniqueIdentifier, evt.challengeId ?? null);
    req.input('Tier',              sql.NVarChar(20),  evt.tier ?? null);
    req.input('DestinationMasked', sql.NVarChar(200), evt.destinationMasked ?? null);
    req.input('IpAddress',         sql.NVarChar(60),  evt.ipAddress ?? null);
    req.input('UserAgent',         sql.NVarChar(400), evt.userAgent ?? null);
    req.input('CorrelationId',     sql.NVarChar(80),  evt.correlationId ?? null);
    req.input('Metadata',          sql.NVarChar(sql.MAX), evt.metadata ? JSON.stringify(evt.metadata) : null);
    await req.query(`
      INSERT INTO [dbo].[PasswordResetAuditLogs]
        (Username, EventType, Status, Reason, ChallengeId, Tier, DestinationMasked, IpAddress, UserAgent, CorrelationId, Metadata)
      VALUES
        (@Username, @EventType, @Status, @Reason, @ChallengeId, @Tier, @DestinationMasked, @IpAddress, @UserAgent, @CorrelationId, @Metadata)
    `);
  } catch (err) {
    logger.warn('passwordReset audit write failed', { error: err.message, evt });
  }
}

/** Admin: list recent audit rows with optional filters. */
export async function list({ username, eventType, since, limit = 200 } = {}) {
  const pool = await db.getPool();
  const req  = pool.request();
  const where = [];
  if (username)  { req.input('Username',  sql.NVarChar(100), username);  where.push('Username = @Username'); }
  if (eventType) { req.input('EventType', sql.NVarChar(80),  eventType); where.push('EventType = @EventType'); }
  if (since)     { req.input('Since',     sql.DateTime2,     since);     where.push('CreatedAt >= @Since'); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  req.input('Limit', sql.Int, Math.min(Number(limit) || 200, 1000));
  const { recordset } = await req.query(`
    SELECT TOP (@Limit) LogId, Username, EventType, Status, Reason, ChallengeId, Tier,
           DestinationMasked, IpAddress, UserAgent, CorrelationId, Metadata, CreatedAt
    FROM [dbo].[PasswordResetAuditLogs]
    ${whereSql}
    ORDER BY CreatedAt DESC
  `);
  return recordset;
}
