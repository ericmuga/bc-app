import nodemailer from 'nodemailer';
import dns from 'node:dns';
import * as Admin from '../models/Admin.js';
import * as BcReport from '../models/BcReport.js';
import { buildReportAttachment } from './reportExport.js';
import logger from './logger.js';

let intervalHandle = null;
let tickInFlight = false;

dns.setDefaultResultOrder('ipv4first');

function parseTimeOfDay(timeOfDay = '08:00') {
  const [hours, minutes] = String(timeOfDay).split(':').map((part) => Number(part) || 0);
  return { hours, minutes };
}

export function computeNextRunAt(schedule, baseDate = new Date()) {
  if (schedule.frequency === 'interval') {
    const intervalHours = Number(schedule.intervalHours || 0);
    return new Date(baseDate.getTime() + intervalHours * 60 * 60 * 1000);
  }
  const next = new Date(baseDate);
  next.setSeconds(0, 0);
  const { hours, minutes } = parseTimeOfDay(schedule.timeOfDay);
  next.setHours(hours, minutes, 0, 0);

  if (schedule.frequency === 'daily') {
    if (next <= baseDate) next.setDate(next.getDate() + 1);
    return next;
  }

  if (schedule.frequency === 'weekly') {
    const targetDay = Number(schedule.dayOfWeek || 1);
    const currentDay = ((next.getDay() + 6) % 7) + 1;
    let delta = targetDay - currentDay;
    if (delta < 0 || (delta === 0 && next <= baseDate)) delta += 7;
    next.setDate(next.getDate() + delta);
    return next;
  }

  const targetDate = Math.min(Number(schedule.dayOfMonth || 1), 28);
  next.setDate(targetDate);
  if (next <= baseDate) next.setMonth(next.getMonth() + 1);
  next.setDate(Math.min(targetDate, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  return next;
}

function buildRuntimeFilters(schedule) {
  const today = new Date();
  const lookbackDays = Math.max(1, Number(schedule.lookbackDays) || 7);
  const from = new Date(today);
  from.setDate(today.getDate() - (lookbackDays - 1));
  const filters = { ...(schedule.filters || {}) };
  filters.dateFrom = from.toISOString().slice(0, 10);
  filters.dateTo = today.toISOString().slice(0, 10);
  return filters;
}

async function getTransporter() {
  const settings = await Admin.getSmtpSettings();
  const host = settings['smtp.host'] || process.env.SMTP_HOST;
  const port = Number(settings['smtp.port'] || process.env.SMTP_PORT || 587);
  const user = settings['smtp.user'] || process.env.SMTP_USER;
  const pass = settings['smtp.pass'] || process.env.SMTP_PASS;
  const from = settings['smtp.from'] || process.env.SMTP_FROM;
  const secure = String(settings['smtp.secure'] || '').toLowerCase() === 'true' || port === 465;

  if (!host || !user || !pass || !from) {
    throw new Error('SMTP settings are incomplete. Configure host, port, user, password, and from address in Admin Setup or environment variables.');
  }

  return {
    from,
    transport: nodemailer.createTransport({
      host,
      port,
      secure,
      family: 4,
      auth: { user, pass },
      tls: {
        servername: host,
      },
    }),
  };
}

async function sendScheduleEmail(schedule, attachment, recipients) {
  const { transport, from } = await getTransporter();
  const to = recipients.map((recipient) => recipient.Email).filter(Boolean);
  if (!to.length) throw new Error('No opted-in recipients with email addresses');

  await transport.sendMail({
    from,
    to,
    subject: `${schedule.name} - ${new Date().toLocaleDateString('en-KE')}`,
    text: `Attached is the scheduled report "${schedule.name}".`,
    attachments: [attachment],
  });
}

async function executeSchedule(schedule) {
  const recipients = await Admin.listScheduleRecipients(schedule.recipientUserIds || []);
  const filters = buildRuntimeFilters(schedule);
  const result = await BcReport.runReport(schedule.reportType, filters);
  const attachment = buildReportAttachment({
    reportType: schedule.reportType,
    result,
    scheduleName: schedule.name,
    deliveryFormat: schedule.deliveryFormat,
  });
  await sendScheduleEmail(schedule, attachment, recipients);
  return { recipientCount: recipients.length };
}

export async function runScheduledReportNow(scheduleId) {
  const schedule = await Admin.getSchedule(scheduleId);
  if (!schedule) throw new Error('Schedule not found');
  const outcome = await executeSchedule(schedule);
  const now = new Date();
  await Admin.updateScheduleRun(schedule.scheduleId, {
    lastRunAt: now,
    nextRunAt: schedule.isActive ? computeNextRunAt(schedule, now) : null,
    lastStatus: 'sent',
    lastError: null,
  });
  return { message: 'Schedule sent', ...outcome };
}

async function tick() {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const dueSchedules = await Admin.listDueSchedules();
    for (const schedule of dueSchedules) {
      const now = new Date();
      try {
        await executeSchedule(schedule);
        await Admin.updateScheduleRun(schedule.scheduleId, {
          lastRunAt: now,
          nextRunAt: computeNextRunAt(schedule, now),
          lastStatus: 'sent',
          lastError: null,
        });
      } catch (err) {
        logger.error('scheduled report failed', { scheduleId: schedule.scheduleId, error: err.message });
        await Admin.updateScheduleRun(schedule.scheduleId, {
          lastRunAt: now,
          nextRunAt: computeNextRunAt(schedule, now),
          lastStatus: 'failed',
          lastError: err.message,
        });
      }
    }
  } finally {
    tickInFlight = false;
  }
}

export function startReportScheduler() {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    tick().catch((err) => logger.error('scheduled tick failed', { error: err.message }));
  }, 60_000);
  tick().catch((err) => logger.error('initial scheduled tick failed', { error: err.message }));
}
