/**
 * services/passwordReset/rateLimit.js
 *
 * Per-route rate limiting for the password-reset flow. Uses express-rate-limit's
 * default in-memory store — fine for a single-instance Node process. If scaled
 * horizontally, swap the store for a Redis-backed one.
 *
 * Each limiter writes a RATE_LIMIT_BLOCKED audit row when it blocks.
 */
import rateLimit from 'express-rate-limit';
import * as audit from './auditService.js';

const WINDOW_MS = 15 * 60 * 1000;

function clientIp(req) {
  // honor X-Forwarded-For if present (reverse proxy)
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function handler(req, res, _next, opts) {
  audit.record({
    eventType: audit.EVENTS.RATE_LIMIT_BLOCKED,
    status: 'blocked',
    username:  req.body?.username || null,
    ipAddress: clientIp(req),
    userAgent: req.headers['user-agent'],
    reason:    `Rate limit exceeded on ${req.originalUrl}`,
    metadata:  { limit: opts.max, windowMs: opts.windowMs },
  });
  // Always return the generic message — never reveal that this specific user
  // triggered the limit
  res.status(429).json({
    message: 'If the account is eligible, a verification code will be sent.',
  });
}

/**
 * /password-reset/request — limit per IP and per username.
 * The "per username" key uses normalized body.username.
 */
export function requestLimiter() {
  return [
    rateLimit({
      windowMs: WINDOW_MS,
      max: Number(process.env.PR_RATE_REQUEST_PER_IP) || 20,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: clientIp,
      handler,
    }),
    rateLimit({
      windowMs: WINDOW_MS,
      max: Number(process.env.PR_RATE_REQUEST_PER_USERNAME) || 5,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        const u = String(req.body?.username || '').trim().toLowerCase();
        return u ? `u:${u}` : `ip:${clientIp(req)}`;
      },
      handler,
    }),
  ];
}

/** OTP verify endpoint — per IP only. Per-challenge attempt cap is enforced in OTP service. */
export function verifyLimiter() {
  return rateLimit({
    windowMs: WINDOW_MS,
    max: Number(process.env.PR_RATE_VERIFY_PER_IP) || 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: clientIp,
    handler,
  });
}

export { clientIp };
