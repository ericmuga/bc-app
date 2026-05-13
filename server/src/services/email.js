/**
 * services/email.js
 * Tiny wrapper around the existing SMTP setup (env or AppSettings) so any
 * controller can call sendEmail({ to, subject, text, html, attachments }).
 */
import nodemailer from 'nodemailer';
import * as Admin from '../models/Admin.js';
import logger from './logger.js';

async function getTransporter() {
  const settings = await Admin.getSmtpSettings();
  const host = settings['smtp.host'] || process.env.SMTP_HOST;
  const port = Number(settings['smtp.port'] || process.env.SMTP_PORT || 587);
  const user = settings['smtp.user'] || process.env.SMTP_USER;
  const pass = settings['smtp.pass'] || process.env.SMTP_PASS;
  const from = settings['smtp.from'] || process.env.SMTP_FROM;
  const secure = String(settings['smtp.secure'] || '').toLowerCase() === 'true' || port === 465;

  if (!host || !user || !pass || !from) {
    throw new Error('SMTP settings are incomplete. Configure host, port, user, password, and from address in Admin Setup → SMTP, or via env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).');
  }
  return {
    from,
    transport: nodemailer.createTransport({
      host, port, secure, family: 4, auth: { user, pass }, tls: { servername: host },
    }),
  };
}

export async function sendEmail({ to, cc, bcc, subject, text, html, attachments } = {}) {
  if (!to || (Array.isArray(to) && !to.length)) throw new Error('to address required');
  const { transport, from } = await getTransporter();
  const info = await transport.sendMail({
    from, to, cc, bcc, subject,
    text: text || (html ? '' : ''),
    html: html || undefined,
    attachments: attachments || [],
  });
  logger.info('email sent', { to, subject, messageId: info.messageId });
  return info;
}
