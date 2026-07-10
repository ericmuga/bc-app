/**
 * services/passwordReset/otpService.js
 *
 * OTP lifecycle backed by [dbo].[PasswordResetChallenges] and reset tokens
 * backed by [dbo].[PasswordResetTokens].
 *
 *   • Standard tier  — one OTP channel (email OR sms), one verification.
 *   • Privileged tier — TWO independent OTPs (email AND sms), both must be
 *                       verified before a reset token is issued.
 *
 * OTPs are NEVER stored in plaintext — only their bcrypt hash. The plaintext
 * is returned to the caller exactly once for delivery, then discarded.
 *
 * Reset tokens are opaque random hex; only their SHA-256 hash is stored.
 */
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db, sql } from '../../db/pool.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function otpExpiryMinutes() { return Math.max(1, Number(process.env.PR_OTP_EXPIRY_MINUTES) || 5); }
function otpLength()        { return Math.max(4, Math.min(10, Number(process.env.PR_OTP_LENGTH) || 6)); }
function maxAttempts()      { return Math.max(1, Number(process.env.PR_OTP_MAX_ATTEMPTS) || 5); }
function resendCooldownSec(){ return Math.max(15, Number(process.env.PR_OTP_RESEND_COOLDOWN_SECONDS) || 60); }
function maxDailySends()    { return Math.max(1, Number(process.env.PR_OTP_MAX_DAILY_SENDS) || 5); }
function tokenExpiryMinutes(){return Math.max(1, Number(process.env.PR_RESET_TOKEN_EXPIRY_MINUTES) || 10); }
function bindToClient()     { return String(process.env.PR_BIND_TOKEN_TO_CLIENT || 'true').toLowerCase() !== 'false'; }

function generateOtp() {
  const len = otpLength();
  const max = 10 ** len;
  // crypto.randomInt gives a uniform integer in [0, max)
  const n = crypto.randomInt(0, max);
  return String(n).padStart(len, '0');
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function generateOpaqueId() {
  return crypto.randomBytes(24).toString('hex');
}

async function bhash(plain) { return bcrypt.hash(String(plain), 10); }
async function bcompare(plain, hash) { return hash ? bcrypt.compare(String(plain), hash) : false; }

// ── daily send-quota check ──────────────────────────────────────────────────

async function dailySendCount(username) {
  const pool = await db.getPool();
  const req  = pool.request();
  req.input('Username', sql.NVarChar(100), username);
  const { recordset } = await req.query(`
    SELECT COUNT(*) AS c
    FROM [dbo].[PasswordResetAuditLogs]
    WHERE LOWER(Username) = LOWER(@Username)
      AND EventType IN ('OTP_SENT_EMAIL', 'OTP_SENT_SMS')
      AND CreatedAt >= DATEADD(DAY, -1, GETUTCDATE())
  `);
  return Number(recordset[0]?.c) || 0;
}

export async function isWithinDailyQuota(username) {
  return (await dailySendCount(username)) < maxDailySends();
}

// ── create challenge ────────────────────────────────────────────────────────

/**
 * Create a fresh challenge. Returns the ChallengeId and the plaintext OTPs
 * needed for delivery. The plaintext is NOT persisted.
 *
 * @param {object} opts
 * @param {string} opts.username
 * @param {'standard'|'privileged'} opts.tier
 * @param {string} [opts.emailDestMasked]
 * @param {string} [opts.smsDestMasked]
 * @param {boolean} [opts.needEmail]
 * @param {boolean} [opts.needSms]
 * @param {string} [opts.ipAddress]
 * @param {string} [opts.userAgent]
 */
export async function createChallenge(opts) {
  const challengeId = crypto.randomUUID();
  const expiresAt   = new Date(Date.now() + otpExpiryMinutes() * 60 * 1000);

  const emailOtp = opts.needEmail ? generateOtp() : null;
  const smsOtp   = opts.needSms   ? generateOtp() : null;

  const emailHash = emailOtp ? await bhash(emailOtp) : null;
  const smsHash   = smsOtp   ? await bhash(smsOtp)   : null;

  const pool = await db.getPool();
  const req  = pool.request();
  req.input('ChallengeId',     sql.UniqueIdentifier, challengeId);
  req.input('Username',        sql.NVarChar(100),    opts.username);
  req.input('Tier',            sql.NVarChar(20),     opts.tier);
  req.input('EmailOtpHash',    sql.NVarChar(200),    emailHash);
  req.input('EmailDestMasked', sql.NVarChar(200),    opts.emailDestMasked ?? null);
  req.input('SmsOtpHash',      sql.NVarChar(200),    smsHash);
  req.input('SmsDestMasked',   sql.NVarChar(200),    opts.smsDestMasked ?? null);
  req.input('ExpiresAt',       sql.DateTime2,        expiresAt);
  req.input('IpAddress',       sql.NVarChar(60),     opts.ipAddress ?? null);
  req.input('UserAgent',       sql.NVarChar(400),    opts.userAgent ?? null);

  await req.query(`
    INSERT INTO [dbo].[PasswordResetChallenges]
      (ChallengeId, Username, Tier, EmailOtpHash, EmailDestMasked, SmsOtpHash, SmsDestMasked,
       ExpiresAt, IpAddress, UserAgent)
    VALUES
      (@ChallengeId, @Username, @Tier, @EmailOtpHash, @EmailDestMasked, @SmsOtpHash, @SmsDestMasked,
       @ExpiresAt, @IpAddress, @UserAgent)
  `);

  return {
    challengeId,
    expiresAt,
    emailOtp,   // plaintext — for delivery only, discard after send
    smsOtp,
  };
}

// ── fetch challenge ────────────────────────────────────────────────────────

export async function getChallenge(challengeId) {
  if (!challengeId) return null;
  const pool = await db.getPool();
  const req  = pool.request();
  req.input('ChallengeId', sql.UniqueIdentifier, challengeId);
  const { recordset } = await req.query(`
    SELECT ChallengeId, Username, Tier, EmailOtpHash, EmailVerifiedAt, EmailDestMasked,
           SmsOtpHash, SmsVerifiedAt, SmsDestMasked,
           AttemptCount, ResendCount, LastResendAt, ExpiresAt, ConsumedAt,
           IpAddress, UserAgent, CreatedAt
    FROM [dbo].[PasswordResetChallenges]
    WHERE ChallengeId = @ChallengeId
  `);
  return recordset[0] ?? null;
}

// ── verify OTP ──────────────────────────────────────────────────────────────

const VERIFY = Object.freeze({
  OK:                'ok',
  NOT_FOUND:         'not_found',
  EXPIRED:           'expired',
  CONSUMED:          'consumed',
  MAX_ATTEMPTS:      'max_attempts',
  WRONG:             'wrong',
  CHANNEL_NOT_ARMED: 'channel_not_armed',
});

/**
 * Verify a single channel's OTP. Returns one of VERIFY codes plus the latest challenge row.
 *
 * @param {string} challengeId
 * @param {'email'|'sms'} channel
 * @param {string} otp
 */
export async function verifyOtp(challengeId, channel, otp) {
  const ch = await getChallenge(challengeId);
  if (!ch)                              return { code: VERIFY.NOT_FOUND };
  if (ch.ConsumedAt)                    return { code: VERIFY.CONSUMED, challenge: ch };
  if (new Date(ch.ExpiresAt) < new Date()) return { code: VERIFY.EXPIRED,  challenge: ch };
  if (ch.AttemptCount >= maxAttempts()) return { code: VERIFY.MAX_ATTEMPTS, challenge: ch };

  const hash = channel === 'email' ? ch.EmailOtpHash : ch.SmsOtpHash;
  if (!hash) return { code: VERIFY.CHANNEL_NOT_ARMED, challenge: ch };

  const ok = await bcompare(otp, hash);

  // Always bump attempt count to prevent infinite guessing; mark verified on success
  const pool = await db.getPool();
  const req  = pool.request();
  req.input('ChallengeId', sql.UniqueIdentifier, challengeId);
  if (ok) {
    if (channel === 'email') {
      await req.query(`
        UPDATE [dbo].[PasswordResetChallenges]
        SET EmailVerifiedAt = GETUTCDATE(),
            AttemptCount = AttemptCount + 1,
            UpdatedAt = GETUTCDATE()
        WHERE ChallengeId = @ChallengeId
      `);
    } else {
      await req.query(`
        UPDATE [dbo].[PasswordResetChallenges]
        SET SmsVerifiedAt = GETUTCDATE(),
            AttemptCount = AttemptCount + 1,
            UpdatedAt = GETUTCDATE()
        WHERE ChallengeId = @ChallengeId
      `);
    }
    return { code: VERIFY.OK, challenge: await getChallenge(challengeId) };
  }
  await req.query(`
    UPDATE [dbo].[PasswordResetChallenges]
    SET AttemptCount = AttemptCount + 1,
        UpdatedAt = GETUTCDATE()
    WHERE ChallengeId = @ChallengeId
  `);
  return { code: VERIFY.WRONG, challenge: await getChallenge(challengeId) };
}

/**
 * Has the challenge satisfied its tier?
 *   standard   → either channel verified
 *   privileged → BOTH email AND sms verified
 */
export function isFullyVerified(challenge) {
  if (!challenge) return false;
  if (challenge.Tier === 'privileged') {
    return Boolean(challenge.EmailVerifiedAt && challenge.SmsVerifiedAt);
  }
  return Boolean(challenge.EmailVerifiedAt || challenge.SmsVerifiedAt);
}

// ── resend ─────────────────────────────────────────────────────────────────

const RESEND = Object.freeze({
  OK:           'ok',
  NOT_FOUND:    'not_found',
  EXPIRED:      'expired',
  CONSUMED:     'consumed',
  COOLDOWN:     'cooldown',
  DAILY_LIMIT:  'daily_limit',
});

/**
 * Generate a fresh OTP for one or both channels and store it on the existing
 * challenge. Returns the new plaintext OTPs and a status code.
 */
export async function rotateOtps(challengeId, channels /* {email:bool, sms:bool} */) {
  const ch = await getChallenge(challengeId);
  if (!ch)                              return { code: RESEND.NOT_FOUND };
  if (ch.ConsumedAt)                    return { code: RESEND.CONSUMED, challenge: ch };
  if (new Date(ch.ExpiresAt) < new Date()) return { code: RESEND.EXPIRED,  challenge: ch };
  const cooldownMs = resendCooldownSec() * 1000;
  if (ch.LastResendAt && (Date.now() - new Date(ch.LastResendAt).getTime()) < cooldownMs) {
    return { code: RESEND.COOLDOWN, challenge: ch };
  }
  if (!(await isWithinDailyQuota(ch.Username))) {
    return { code: RESEND.DAILY_LIMIT, challenge: ch };
  }

  const emailOtp = channels.email && ch.EmailOtpHash ? generateOtp() : null;
  const smsOtp   = channels.sms   && ch.SmsOtpHash   ? generateOtp() : null;
  const emailHash = emailOtp ? await bhash(emailOtp) : null;
  const smsHash   = smsOtp   ? await bhash(smsOtp)   : null;

  const pool = await db.getPool();
  const req  = pool.request();
  req.input('ChallengeId',  sql.UniqueIdentifier, challengeId);
  req.input('EmailOtpHash', sql.NVarChar(200),    emailHash);
  req.input('SmsOtpHash',   sql.NVarChar(200),    smsHash);
  await req.query(`
    UPDATE [dbo].[PasswordResetChallenges]
    SET EmailOtpHash    = COALESCE(@EmailOtpHash, EmailOtpHash),
        EmailVerifiedAt = CASE WHEN @EmailOtpHash IS NOT NULL THEN NULL ELSE EmailVerifiedAt END,
        SmsOtpHash      = COALESCE(@SmsOtpHash, SmsOtpHash),
        SmsVerifiedAt   = CASE WHEN @SmsOtpHash IS NOT NULL THEN NULL ELSE SmsVerifiedAt END,
        ResendCount     = ResendCount + 1,
        LastResendAt    = GETUTCDATE(),
        UpdatedAt       = GETUTCDATE()
    WHERE ChallengeId = @ChallengeId
  `);
  return { code: RESEND.OK, challenge: await getChallenge(challengeId), emailOtp, smsOtp };
}

// ── reset tokens ───────────────────────────────────────────────────────────

/**
 * After full verification, issue a single-use reset token bound to the client.
 * Stores SHA-256 hash only; returns plaintext token to the caller.
 */
export async function issueResetToken(challenge, { ipAddress, userAgent }) {
  const tokenPlain = generateOpaqueId();
  const tokenHash  = sha256Hex(tokenPlain);
  const tokenId    = crypto.randomUUID();
  const expiresAt  = new Date(Date.now() + tokenExpiryMinutes() * 60 * 1000);

  const pool = await db.getPool();
  const req  = pool.request();
  req.input('TokenId',     sql.UniqueIdentifier, tokenId);
  req.input('Username',    sql.NVarChar(100),    challenge.Username);
  req.input('TokenHash',   sql.NVarChar(200),    tokenHash);
  req.input('ChallengeId', sql.UniqueIdentifier, challenge.ChallengeId);
  req.input('Tier',        sql.NVarChar(20),     challenge.Tier);
  req.input('IpAddress',   sql.NVarChar(60),     ipAddress ?? null);
  req.input('UserAgent',   sql.NVarChar(400),    userAgent ?? null);
  req.input('ExpiresAt',   sql.DateTime2,        expiresAt);
  await req.query(`
    INSERT INTO [dbo].[PasswordResetTokens]
      (TokenId, Username, TokenHash, ChallengeId, Tier, IpAddress, UserAgent, ExpiresAt)
    VALUES
      (@TokenId, @Username, @TokenHash, @ChallengeId, @Tier, @IpAddress, @UserAgent, @ExpiresAt)
  `);

  // Mark challenge as consumed so it can't be reused
  const req2 = pool.request();
  req2.input('ChallengeId', sql.UniqueIdentifier, challenge.ChallengeId);
  await req2.query(`
    UPDATE [dbo].[PasswordResetChallenges]
    SET ConsumedAt = GETUTCDATE(), UpdatedAt = GETUTCDATE()
    WHERE ChallengeId = @ChallengeId
  `);

  return { tokenId, tokenPlain, expiresAt };
}

const TOKEN = Object.freeze({
  OK: 'ok', NOT_FOUND: 'not_found', EXPIRED: 'expired',
  CONSUMED: 'consumed', BINDING_MISMATCH: 'binding_mismatch',
});

/**
 * Validate a reset token and atomically mark it consumed. The caller still
 * has to perform the AD password change AFTER this returns OK.
 */
export async function consumeResetToken(tokenPlain, { ipAddress, userAgent }) {
  if (!tokenPlain) return { code: TOKEN.NOT_FOUND };
  const tokenHash = sha256Hex(tokenPlain);

  const pool = await db.getPool();
  const req  = pool.request();
  req.input('TokenHash', sql.NVarChar(200), tokenHash);
  const { recordset } = await req.query(`
    SELECT TOP 1 *
    FROM [dbo].[PasswordResetTokens]
    WHERE TokenHash = @TokenHash
  `);
  const row = recordset[0];
  if (!row)               return { code: TOKEN.NOT_FOUND };
  if (row.ConsumedAt)     return { code: TOKEN.CONSUMED, token: row };
  if (new Date(row.ExpiresAt) < new Date()) return { code: TOKEN.EXPIRED, token: row };

  if (bindToClient()) {
    const ipOk = !row.IpAddress || row.IpAddress === ipAddress;
    const uaOk = !row.UserAgent || row.UserAgent === userAgent;
    if (!ipOk || !uaOk) {
      return { code: TOKEN.BINDING_MISMATCH, token: row };
    }
  }

  const req2 = pool.request();
  req2.input('TokenId', sql.UniqueIdentifier, row.TokenId);
  const upd = await req2.query(`
    UPDATE [dbo].[PasswordResetTokens]
    SET ConsumedAt = GETUTCDATE(), UpdatedAt = GETUTCDATE()
    WHERE TokenId = @TokenId AND ConsumedAt IS NULL;
    SELECT @@ROWCOUNT AS rc;
  `);
  if (!upd.recordset?.[0]?.rc) {
    // Race condition: another request consumed it
    return { code: TOKEN.CONSUMED, token: row };
  }
  return { code: TOKEN.OK, token: row };
}

/**
 * Expire all live OTPs and reset tokens for a user (e.g. after successful reset).
 */
export async function invalidateAllForUser(username) {
  const pool = await db.getPool();
  const req  = pool.request();
  req.input('Username', sql.NVarChar(100), username);
  await req.query(`
    UPDATE [dbo].[PasswordResetChallenges]
       SET ConsumedAt = COALESCE(ConsumedAt, GETUTCDATE()), UpdatedAt = GETUTCDATE()
     WHERE LOWER(Username) = LOWER(@Username) AND ConsumedAt IS NULL;

    UPDATE [dbo].[PasswordResetTokens]
       SET ConsumedAt = COALESCE(ConsumedAt, GETUTCDATE()), UpdatedAt = GETUTCDATE()
     WHERE LOWER(Username) = LOWER(@Username) AND ConsumedAt IS NULL;
  `);
}

export { VERIFY, RESEND, TOKEN, otpExpiryMinutes, tokenExpiryMinutes, resendCooldownSec, maxAttempts };
