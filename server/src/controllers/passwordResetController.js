/**
 * controllers/passwordResetController.js
 *
 * Public-facing self-service password reset endpoints:
 *   POST /api/password-reset/request       — start a challenge
 *   POST /api/password-reset/verify-otp    — verify one OTP (email|sms)
 *   POST /api/password-reset/resend-otp    — re-send OTP for a channel
 *   POST /api/password-reset/complete      — set new AD password
 *
 * Public responses are intentionally generic to prevent enumeration. All
 * reasons (account disabled, privileged, etc.) are written to audit logs.
 */
import crypto from 'node:crypto';
import * as ad     from '../services/passwordReset/adService.js';
import * as otp    from '../services/passwordReset/otpService.js';
import * as notify from '../services/passwordReset/notificationService.js';
import * as audit  from '../services/passwordReset/auditService.js';
import { clientIp } from '../services/passwordReset/rateLimit.js';
import logger from '../services/logger.js';

const GENERIC_MESSAGE = 'If the account is eligible, a verification code will be sent.';

function ua(req)  { return String(req.headers['user-agent'] || '').slice(0, 400); }
function ip(req)  { return clientIp(req); }
function corr()   { return crypto.randomBytes(8).toString('hex'); }

function isFeatureEnabled() {
  return String(process.env.PR_ENABLED || 'true').toLowerCase() !== 'false';
}

function validatePassword(pwd) {
  if (typeof pwd !== 'string') return 'Password is required';
  if (pwd.length < 8)          return 'Password must be at least 8 characters';
  if (pwd.length > 127)        return 'Password is too long';
  // AD enforces complexity itself; we only check obvious basics here.
  if (!/[A-Z]/.test(pwd))      return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(pwd))      return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(pwd))      return 'Password must contain a digit';
  if (!/[^A-Za-z0-9]/.test(pwd)) return 'Password must contain a symbol';
  return null;
}

// ── POST /api/password-reset/request ────────────────────────────────────────

export async function requestReset(req, res) {
  if (!isFeatureEnabled()) return res.status(503).json({ error: 'Password reset is disabled' });

  const correlationId = corr();
  const ipAddress = ip(req);
  const userAgent = ua(req);
  const sam = ad.normalizeSam(req.body?.username);

  // Always reply with the generic envelope after this point. We capture the
  // genuine ChallengeId so eligible users can proceed; for everyone else we
  // return a "fake" empty payload so the client cannot distinguish outcomes.
  const reply = (payload = {}) => res.json({ message: GENERIC_MESSAGE, ...payload });

  audit.record({
    eventType: audit.EVENTS.REQUEST_RECEIVED, status: 'ok',
    username: sam || null, ipAddress, userAgent, correlationId,
  });

  if (!sam) {
    return reply();
  }

  try {
    const user = await ad.lookupUser(sam);
    if (!user) {
      audit.record({ eventType: audit.EVENTS.ACCOUNT_NOT_FOUND, status: 'blocked',
        username: sam, ipAddress, userAgent, correlationId });
      return reply();
    }

    const verdict = await ad.classifyEligibility(user);
    if (!verdict.eligible) {
      const evt = audit.EVENTS[verdict.reasonCode] ?? audit.EVENTS.SUSPICIOUS_ACTIVITY;
      audit.record({ eventType: evt, status: 'blocked',
        username: sam, ipAddress, userAgent, correlationId,
        reason: verdict.reason });
      // Notify security on privileged-blocked attempts so it shows up on the radar
      if (verdict.reasonCode === 'PRIVILEGED_BLOCKED') {
        notify.sendSecurityAlert({
          subject: 'Password reset blocked: privileged account not on allowlist',
          body: `User: ${sam}\nIP: ${ipAddress}\nUA: ${userAgent}\nReason: ${verdict.reason}\nCorrelation: ${correlationId}`,
        });
      }
      return reply();
    }

    // Daily quota — global per-user across resends
    if (!(await otp.isWithinDailyQuota(sam))) {
      audit.record({ eventType: audit.EVENTS.OTP_DAILY_LIMIT, status: 'blocked',
        username: sam, ipAddress, userAgent, correlationId });
      return reply();
    }

    const { tier, destinations } = verdict;
    const needEmail = tier === 'privileged' ? Boolean(destinations.email) : Boolean(destinations.email);
    const needSms   = tier === 'privileged' ? Boolean(destinations.sms)   : Boolean(destinations.sms && !destinations.email);
    // For standard tier we prefer email if available, else SMS. Privileged requires BOTH.

    const challenge = await otp.createChallenge({
      username: sam,
      tier,
      emailDestMasked: needEmail ? destinations.emailMasked : null,
      smsDestMasked:   needSms   ? destinations.smsMasked   : null,
      needEmail, needSms,
      ipAddress, userAgent,
    });

    audit.record({ eventType: audit.EVENTS.OTP_CREATED, status: 'ok',
      username: sam, tier, challengeId: challenge.challengeId,
      ipAddress, userAgent, correlationId });

    if (tier === 'privileged') {
      audit.record({ eventType: audit.EVENTS.PRIVILEGED_ALLOWED_TIER, status: 'ok',
        username: sam, challengeId: challenge.challengeId, correlationId });
    }

    // Fire-and-don't-await delivery so the client can't time-correlate channels
    if (needEmail) {
      notify.sendOtpEmail({ to: destinations.email, otp: challenge.emailOtp, expiresMinutes: otp.otpExpiryMinutes() })
        .then((r) => audit.record({
          eventType: r.ok ? audit.EVENTS.OTP_SENT_EMAIL : audit.EVENTS.OTP_SEND_FAILED,
          status: r.ok ? 'ok' : 'failed',
          username: sam, challengeId: challenge.challengeId, tier,
          destinationMasked: destinations.emailMasked,
          ipAddress, userAgent, correlationId,
          reason: r.ok ? null : r.error,
        }));
    }
    if (needSms) {
      notify.sendOtpSms({ to: destinations.sms, otp: challenge.smsOtp, expiresMinutes: otp.otpExpiryMinutes() })
        .then((r) => audit.record({
          eventType: r.ok ? audit.EVENTS.OTP_SENT_SMS : audit.EVENTS.OTP_SEND_FAILED,
          status: r.ok ? 'ok' : 'failed',
          username: sam, challengeId: challenge.challengeId, tier,
          destinationMasked: destinations.smsMasked,
          ipAddress, userAgent, correlationId,
          reason: r.ok ? null : r.error,
        }));
    }

    return reply({
      challengeId: challenge.challengeId,
      tier,
      channels: {
        email: needEmail ? { masked: destinations.emailMasked } : null,
        sms:   needSms   ? { masked: destinations.smsMasked   } : null,
      },
      expiresInMinutes: otp.otpExpiryMinutes(),
    });
  } catch (err) {
    logger.error('password-reset/request error', { error: err.message });
    return reply(); // never leak internal errors on the public endpoint
  }
}

// ── POST /api/password-reset/verify-otp ─────────────────────────────────────

export async function verifyOtp(req, res) {
  if (!isFeatureEnabled()) return res.status(503).json({ error: 'Password reset is disabled' });

  const correlationId = corr();
  const ipAddress = ip(req);
  const userAgent = ua(req);

  const challengeId = String(req.body?.challengeId || '').trim();
  const channel     = String(req.body?.channel     || '').trim().toLowerCase();
  const otpInput    = String(req.body?.otp         || '').trim();

  if (!challengeId || !['email','sms'].includes(channel) || !otpInput) {
    return res.status(400).json({ error: 'challengeId, channel and otp are required' });
  }

  const result = await otp.verifyOtp(challengeId, channel, otpInput);

  switch (result.code) {
    case otp.VERIFY.OK: {
      const ch = result.challenge;
      audit.record({ eventType: audit.EVENTS.OTP_VERIFY_SUCCESS, status: 'ok',
        username: ch.Username, challengeId, tier: ch.Tier,
        ipAddress, userAgent, correlationId, metadata: { channel } });

      if (otp.isFullyVerified(ch)) {
        const { tokenPlain, expiresAt } = await otp.issueResetToken(ch, { ipAddress, userAgent });
        audit.record({ eventType: audit.EVENTS.RESET_TOKEN_CREATED, status: 'ok',
          username: ch.Username, challengeId, tier: ch.Tier,
          ipAddress, userAgent, correlationId });
        return res.json({
          status: 'ready',
          resetToken: tokenPlain,
          expiresAt,
        });
      }
      // Still need another channel (privileged tier)
      return res.json({
        status: 'need-more',
        verified: { email: Boolean(ch.EmailVerifiedAt), sms: Boolean(ch.SmsVerifiedAt) },
      });
    }
    case otp.VERIFY.NOT_FOUND:
      audit.record({ eventType: audit.EVENTS.OTP_VERIFY_FAILED, status: 'failed',
        challengeId, ipAddress, userAgent, correlationId, reason: 'not_found' });
      return res.status(400).json({ error: 'Invalid or expired code' });
    case otp.VERIFY.EXPIRED:
      audit.record({ eventType: audit.EVENTS.OTP_EXPIRED, status: 'blocked',
        username: result.challenge?.Username, challengeId, ipAddress, userAgent, correlationId });
      return res.status(400).json({ error: 'Invalid or expired code' });
    case otp.VERIFY.CONSUMED:
      audit.record({ eventType: audit.EVENTS.OTP_VERIFY_FAILED, status: 'blocked',
        username: result.challenge?.Username, challengeId, ipAddress, userAgent, correlationId, reason: 'consumed' });
      return res.status(400).json({ error: 'Invalid or expired code' });
    case otp.VERIFY.MAX_ATTEMPTS:
      audit.record({ eventType: audit.EVENTS.OTP_MAX_ATTEMPTS, status: 'blocked',
        username: result.challenge?.Username, challengeId, ipAddress, userAgent, correlationId });
      return res.status(400).json({ error: 'Too many attempts. Start over.' });
    case otp.VERIFY.WRONG:
      audit.record({ eventType: audit.EVENTS.OTP_VERIFY_FAILED, status: 'failed',
        username: result.challenge?.Username, challengeId, ipAddress, userAgent, correlationId, reason: 'wrong' });
      return res.status(400).json({ error: 'Invalid or expired code' });
    case otp.VERIFY.CHANNEL_NOT_ARMED:
      return res.status(400).json({ error: 'Channel not available for this challenge' });
    default:
      return res.status(400).json({ error: 'Invalid or expired code' });
  }
}

// ── POST /api/password-reset/resend-otp ─────────────────────────────────────

export async function resendOtp(req, res) {
  if (!isFeatureEnabled()) return res.status(503).json({ error: 'Password reset is disabled' });

  const correlationId = corr();
  const ipAddress = ip(req);
  const userAgent = ua(req);
  const challengeId = String(req.body?.challengeId || '').trim();
  const channel     = String(req.body?.channel     || '').trim().toLowerCase();

  if (!challengeId || !['email','sms','both'].includes(channel)) {
    return res.status(400).json({ error: 'challengeId and channel are required' });
  }

  const channels = {
    email: channel === 'email' || channel === 'both',
    sms:   channel === 'sms'   || channel === 'both',
  };
  const result = await otp.rotateOtps(challengeId, channels);

  if (result.code === otp.RESEND.NOT_FOUND)
    return res.status(400).json({ error: 'Invalid challenge' });
  if (result.code === otp.RESEND.EXPIRED || result.code === otp.RESEND.CONSUMED)
    return res.status(400).json({ error: 'Challenge expired. Start over.' });
  if (result.code === otp.RESEND.COOLDOWN) {
    audit.record({ eventType: audit.EVENTS.OTP_RESEND_COOLDOWN, status: 'blocked',
      username: result.challenge?.Username, challengeId, ipAddress, userAgent, correlationId });
    return res.status(429).json({ error: 'Please wait before requesting another code.' });
  }
  if (result.code === otp.RESEND.DAILY_LIMIT) {
    audit.record({ eventType: audit.EVENTS.OTP_DAILY_LIMIT, status: 'blocked',
      username: result.challenge?.Username, challengeId, ipAddress, userAgent, correlationId });
    return res.status(429).json({ error: 'Daily limit reached. Try again tomorrow.' });
  }

  const ch = result.challenge;

  // Re-fetch user for delivery addresses
  try {
    const user = await ad.lookupUser(ch.Username);
    const dest = user ? {
      email: user.mail,
      sms:   user.mobile || user.telephone,
    } : { email: null, sms: null };

    if (result.emailOtp && dest.email) {
      notify.sendOtpEmail({ to: dest.email, otp: result.emailOtp, expiresMinutes: otp.otpExpiryMinutes() })
        .then((r) => audit.record({
          eventType: r.ok ? audit.EVENTS.OTP_SENT_EMAIL : audit.EVENTS.OTP_SEND_FAILED,
          status: r.ok ? 'ok' : 'failed',
          username: ch.Username, challengeId, tier: ch.Tier,
          destinationMasked: ch.EmailDestMasked,
          ipAddress, userAgent, correlationId,
          reason: r.ok ? null : r.error,
        }));
    }
    if (result.smsOtp && dest.sms) {
      notify.sendOtpSms({ to: dest.sms, otp: result.smsOtp, expiresMinutes: otp.otpExpiryMinutes() })
        .then((r) => audit.record({
          eventType: r.ok ? audit.EVENTS.OTP_SENT_SMS : audit.EVENTS.OTP_SEND_FAILED,
          status: r.ok ? 'ok' : 'failed',
          username: ch.Username, challengeId, tier: ch.Tier,
          destinationMasked: ch.SmsDestMasked,
          ipAddress, userAgent, correlationId,
          reason: r.ok ? null : r.error,
        }));
    }
  } catch (err) {
    logger.error('password-reset/resend lookup error', { error: err.message });
  }

  return res.json({ status: 'sent', cooldownSeconds: otp.resendCooldownSec() });
}

// ── POST /api/password-reset/complete ───────────────────────────────────────

export async function completeReset(req, res) {
  if (!isFeatureEnabled()) return res.status(503).json({ error: 'Password reset is disabled' });

  const correlationId = corr();
  const ipAddress = ip(req);
  const userAgent = ua(req);

  const resetToken  = String(req.body?.resetToken  || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (!resetToken) return res.status(400).json({ error: 'resetToken is required' });

  const pwdError = validatePassword(newPassword);
  if (pwdError) {
    audit.record({ eventType: audit.EVENTS.PASSWORD_POLICY_FAILED, status: 'failed',
      ipAddress, userAgent, correlationId, reason: pwdError });
    return res.status(400).json({ error: pwdError });
  }

  const tokenResult = await otp.consumeResetToken(resetToken, { ipAddress, userAgent });
  if (tokenResult.code !== otp.TOKEN.OK) {
    const evt = {
      [otp.TOKEN.NOT_FOUND]:        audit.EVENTS.RESET_TOKEN_INVALID,
      [otp.TOKEN.EXPIRED]:          audit.EVENTS.RESET_TOKEN_EXPIRED,
      [otp.TOKEN.CONSUMED]:         audit.EVENTS.RESET_TOKEN_INVALID,
      [otp.TOKEN.BINDING_MISMATCH]: audit.EVENTS.RESET_TOKEN_BINDING_MISMATCH,
    }[tokenResult.code] || audit.EVENTS.RESET_TOKEN_INVALID;
    audit.record({ eventType: evt, status: 'blocked',
      username: tokenResult.token?.Username, ipAddress, userAgent, correlationId,
      reason: tokenResult.code });
    return res.status(400).json({ error: 'Invalid or expired reset token. Start over.' });
  }

  const tokenRow = tokenResult.token;
  const username = tokenRow.Username;

  // Re-check eligibility right before the AD modify — state may have changed
  // (admin disabled the account, removed from allowlist, etc.)
  let user, verdict;
  try {
    user = await ad.lookupUser(username);
    verdict = await ad.classifyEligibility(user);
  } catch (err) {
    logger.error('password-reset/complete lookup error', { error: err.message });
    audit.record({ eventType: audit.EVENTS.PASSWORD_RESET_FAILED, status: 'failed',
      username, ipAddress, userAgent, correlationId, reason: 'lookup error' });
    return res.status(500).json({ error: 'Unable to complete the reset. Contact IT support.' });
  }

  if (!user || !verdict.eligible) {
    audit.record({ eventType: audit.EVENTS.PASSWORD_RESET_FAILED, status: 'blocked',
      username, ipAddress, userAgent, correlationId,
      reason: `re-check failed: ${verdict?.reason || 'no user'}` });
    return res.status(400).json({ error: 'Account is no longer eligible.' });
  }
  // If the token's tier mismatches the current eligibility tier, refuse.
  if (tokenRow.Tier !== verdict.tier) {
    audit.record({ eventType: audit.EVENTS.PASSWORD_RESET_FAILED, status: 'blocked',
      username, ipAddress, userAgent, correlationId, reason: 'tier mismatch' });
    return res.status(400).json({ error: 'Account eligibility changed. Start over.' });
  }

  // Prevent obvious bad passwords containing username
  if (newPassword.toLowerCase().includes(username.toLowerCase())) {
    audit.record({ eventType: audit.EVENTS.PASSWORD_POLICY_FAILED, status: 'failed',
      username, ipAddress, userAgent, correlationId, reason: 'contains username' });
    return res.status(400).json({ error: 'Password must not contain your username.' });
  }

  // Perform the AD modify
  try {
    await ad.resetPassword(user.dn, newPassword);
  } catch (err) {
    audit.record({ eventType: audit.EVENTS.PASSWORD_RESET_FAILED, status: 'failed',
      username, ipAddress, userAgent, correlationId,
      reason: `AD: ${err.message}`, metadata: { code: err.code, name: err.adName } });
    return res.status(400).json({
      error: 'The password did not satisfy the domain policy or could not be applied. Choose a different password and try again.',
    });
  }

  // Invalidate any other live challenges/tokens for this user
  await otp.invalidateAllForUser(username);

  audit.record({ eventType: audit.EVENTS.PASSWORD_RESET_SUCCESS, status: 'ok',
    username, tier: verdict.tier, ipAddress, userAgent, correlationId });

  // Best-effort confirmation email (do not block the response on it)
  if (user.mail) {
    notify.sendResetConfirmationEmail({ to: user.mail, displayName: user.displayName }).catch(() => {});
  }
  // For privileged resets, always alert security
  if (verdict.tier === 'privileged') {
    notify.sendSecurityAlert({
      subject: `[SECURITY] Privileged AD password reset: ${username}`,
      body: `User: ${username}\nDisplayName: ${user.displayName}\nIP: ${ipAddress}\nUA: ${userAgent}\nCorrelation: ${correlationId}\nTime (UTC): ${new Date().toISOString()}`,
    }).catch(() => {});
  }

  return res.json({ status: 'ok', message: 'Password reset successfully.' });
}
