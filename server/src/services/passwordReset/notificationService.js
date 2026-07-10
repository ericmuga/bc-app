/**
 * services/passwordReset/notificationService.js
 *
 * OTP delivery — email (SMTP via existing nodemailer + AppSettings) and SMS
 * (Infobip REST API). Each function returns { ok: bool, info?: any, error?: string }
 * and NEVER throws on delivery failure — the caller decides whether to surface
 * a generic failure to the user.
 */
import nodemailer from 'nodemailer';
import * as Admin from '../../models/Admin.js';
import logger    from '../logger.js';

// ── email transport (reuses SMTP settings from AppSettings + env fallback) ──

async function buildTransport() {
  const settings = await Admin.getSmtpSettings();
  const host = settings['smtp.host'] || process.env.SMTP_HOST;
  const port = Number(settings['smtp.port'] || process.env.SMTP_PORT || 587);
  const user = settings['smtp.user'] || process.env.SMTP_USER;
  const pass = settings['smtp.pass'] || process.env.SMTP_PASS;
  const from = process.env.PR_EMAIL_FROM
            || settings['smtp.from']
            || process.env.SMTP_FROM;
  const secure = String(settings['smtp.secure'] || '').toLowerCase() === 'true' || port === 465;

  if (!host || !user || !pass || !from) {
    throw new Error('SMTP settings incomplete — configure host/user/pass/from in Admin Setup or env.');
  }

  return {
    from,
    transport: nodemailer.createTransport({
      host, port, secure, family: 4,
      auth: { user, pass },
      tls: { servername: host },
    }),
  };
}

function emailBody(otp, minutes) {
  return [
    `Your password reset verification code is: ${otp}`,
    '',
    `This code expires in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    '',
    'If you did not request this, contact IT support immediately and DO NOT share this code with anyone.',
  ].join('\n');
}

/**
 * Send the OTP email. Returns { ok, error? }.
 */
export async function sendOtpEmail({ to, otp, expiresMinutes }) {
  if (!to) return { ok: false, error: 'No email destination' };
  try {
    const { transport, from } = await buildTransport();
    const info = await transport.sendMail({
      from,
      to,
      subject: 'Your password reset verification code',
      text:    emailBody(otp, expiresMinutes),
    });
    return { ok: true, info: { messageId: info?.messageId } };
  } catch (err) {
    logger.warn('password-reset email send failed', { error: err.message });
    return { ok: false, error: err.message };
  }
}

/**
 * Notify the user that their password was successfully reset.
 */
export async function sendResetConfirmationEmail({ to, displayName }) {
  if (!to) return { ok: false, error: 'No email destination' };
  try {
    const { transport, from } = await buildTransport();
    await transport.sendMail({
      from,
      to,
      subject: 'Your password was reset',
      text: [
        `Hello ${displayName || ''},`,
        '',
        'Your Active Directory password was just reset using the self-service portal.',
        '',
        'If this was NOT you, contact IT support immediately.',
      ].join('\n'),
    });
    return { ok: true };
  } catch (err) {
    logger.warn('password-reset confirmation email failed', { error: err.message });
    return { ok: false, error: err.message };
  }
}

/**
 * Alert the security team about a suspicious or noteworthy event.
 */
export async function sendSecurityAlert({ subject, body }) {
  const to = process.env.PR_SECURITY_ALERT_EMAIL;
  if (!to) return { ok: false, error: 'PR_SECURITY_ALERT_EMAIL not configured' };
  try {
    const { transport, from } = await buildTransport();
    await transport.sendMail({ from, to, subject, text: body });
    return { ok: true };
  } catch (err) {
    logger.warn('password-reset security alert failed', { error: err.message });
    return { ok: false, error: err.message };
  }
}

// ── SMS via Infobip ─────────────────────────────────────────────────────────

function normaliseE164(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  // Kenyan numbers: 07xxxxxxxx → 2547xxxxxxxx, 7xxxxxxxx → 2547xxxxxxxx
  if (digits.startsWith('254') && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith('0')   && digits.length >= 10) return `+254${digits.slice(1)}`;
  if (digits.startsWith('7')   && digits.length >= 9)  return `+254${digits}`;
  if (digits.startsWith('+'))                          return digits;
  return `+${digits}`;
}

function smsBody(otp, minutes) {
  return `Your password reset code is ${otp}. It expires in ${minutes} minute${minutes === 1 ? '' : 's'}. If you did not request this, contact IT.`;
}

/**
 * Send the OTP SMS via Infobip's /sms/2/text/advanced endpoint.
 * Returns { ok, error? }.
 */
export async function sendOtpSms({ to, otp, expiresMinutes }) {
  if (!to) return { ok: false, error: 'No SMS destination' };
  const base = process.env.INFOBIP_BASE_URL;
  const key  = process.env.INFOBIP_API_KEY;
  const from = process.env.INFOBIP_SENDER || 'PWReset';
  if (!base || !key) {
    return { ok: false, error: 'Infobip is not configured (INFOBIP_BASE_URL / INFOBIP_API_KEY)' };
  }

  const dest = normaliseE164(to);
  if (!dest) return { ok: false, error: 'Invalid destination phone number' };

  const url = `${base.replace(/\/+$/, '')}/sms/2/text/advanced`;
  const body = {
    messages: [{
      from,
      destinations: [{ to: dest.replace(/^\+/, '') }],
      text: smsBody(otp, expiresMinutes),
    }],
  };

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10_000);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `App ${key}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    clearTimeout(timer);

    const text = await resp.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}

    if (!resp.ok) {
      logger.warn('password-reset SMS send failed', { status: resp.status, body: text.slice(0, 300) });
      return { ok: false, error: `Infobip HTTP ${resp.status}` };
    }
    // messageId / status.groupName are useful for tracing
    const m = json?.messages?.[0];
    return { ok: true, info: { messageId: m?.messageId, status: m?.status?.groupName } };
  } catch (err) {
    logger.warn('password-reset SMS send error', { error: err.message });
    return { ok: false, error: err.message };
  }
}
