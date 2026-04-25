import * as Admin from '../models/Admin.js';
import logger from '../services/logger.js';
import { ROLES } from '../services/access.js';
import { computeNextRunAt, runScheduledReportNow } from '../services/reportScheduler.js';

const VALID_ROLES = [ROLES.ADMIN, ROLES.SALES, ROLES.DISPATCH, ROLES.SECURITY, ROLES.ANALYST];
const VALID_REPORT_TYPES = ['postingGroup', 'sector', 'salesperson', 'route', 'weekOnWeek', 'productPerformance'];
const VALID_FORMATS = ['xlsx', 'pdf'];
const VALID_FREQUENCIES = ['interval', 'daily', 'weekly', 'monthly'];
const VALID_INTERVAL_HOURS = [2, 4, 6, 8, 12];

function sanitizeSchedule(body) {
  return {
    scheduleId: body.scheduleId || null,
    name: String(body.name || '').trim(),
    reportType: String(body.reportType || '').trim(),
    deliveryFormat: String(body.deliveryFormat || 'xlsx').trim().toLowerCase(),
    frequency: String(body.frequency || 'daily').trim().toLowerCase(),
    intervalHours: body.intervalHours != null && body.intervalHours !== '' ? Number(body.intervalHours) : null,
    dayOfWeek: body.dayOfWeek != null && body.dayOfWeek !== '' ? Number(body.dayOfWeek) : null,
    dayOfMonth: body.dayOfMonth != null && body.dayOfMonth !== '' ? Number(body.dayOfMonth) : null,
    timeOfDay: String(body.timeOfDay || '08:00').trim(),
    lookbackDays: Math.max(1, Number(body.lookbackDays) || 7),
    isActive: body.isActive !== false,
    recipientUserIds: Array.isArray(body.recipientUserIds) ? body.recipientUserIds.filter(Boolean) : [],
    filters: body.filters && typeof body.filters === 'object' ? body.filters : {},
  };
}

export async function getSmtpSettings(_req, res) {
  try {
    return res.json(await Admin.getSmtpSettings());
  } catch (err) {
    logger.error('admin/getSmtpSettings error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function saveSmtpSettings(req, res) {
  try {
    await Admin.saveSmtpSettings({
      'smtp.host': String(req.body.host || '').trim(),
      'smtp.port': String(req.body.port || '').trim(),
      'smtp.user': String(req.body.user || '').trim(),
      'smtp.pass': String(req.body.pass || '').trim(),
      'smtp.from': String(req.body.from || '').trim(),
      'smtp.secure': String(req.body.secure ? 'true' : 'false'),
    });
    return res.json({ message: 'SMTP settings saved' });
  } catch (err) {
    logger.error('admin/saveSmtpSettings error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function listUsers(_req, res) {
  try {
    return res.json(await Admin.listUsers());
  } catch (err) {
    logger.error('admin/listUsers error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function updateUser(req, res) {
  const payload = {
    displayName: String(req.body.displayName || '').trim(),
    email: String(req.body.email || '').trim(),
    role: String(req.body.role || '').trim().toLowerCase(),
    isActive: req.body.isActive !== false,
    receiveScheduledReports: Boolean(req.body.receiveScheduledReports),
  };
  if (!payload.displayName) return res.status(400).json({ error: 'displayName is required' });
  if (!VALID_ROLES.includes(payload.role)) return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  try {
    await Admin.updateUser(req.params.userId, payload);
    return res.json({ message: 'User updated' });
  } catch (err) {
    logger.error('admin/updateUser error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function listSchedules(_req, res) {
  try {
    return res.json(await Admin.listSchedules());
  } catch (err) {
    logger.error('admin/listSchedules error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function saveSchedule(req, res) {
  const schedule = sanitizeSchedule({ ...req.body, scheduleId: req.params.scheduleId || req.body.scheduleId });
  if (!schedule.name) return res.status(400).json({ error: 'name is required' });
  if (!VALID_REPORT_TYPES.includes(schedule.reportType)) return res.status(400).json({ error: `reportType must be one of: ${VALID_REPORT_TYPES.join(', ')}` });
  if (!VALID_FORMATS.includes(schedule.deliveryFormat)) return res.status(400).json({ error: `deliveryFormat must be one of: ${VALID_FORMATS.join(', ')}` });
  if (!VALID_FREQUENCIES.includes(schedule.frequency)) return res.status(400).json({ error: `frequency must be one of: ${VALID_FREQUENCIES.join(', ')}` });
  if (schedule.frequency === 'interval' && !VALID_INTERVAL_HOURS.includes(schedule.intervalHours)) return res.status(400).json({ error: `intervalHours must be one of: ${VALID_INTERVAL_HOURS.join(', ')}` });
  if (schedule.frequency === 'weekly' && !(schedule.dayOfWeek >= 1 && schedule.dayOfWeek <= 7)) return res.status(400).json({ error: 'dayOfWeek must be 1-7 for weekly schedules' });
  if (schedule.frequency === 'monthly' && !(schedule.dayOfMonth >= 1 && schedule.dayOfMonth <= 31)) return res.status(400).json({ error: 'dayOfMonth must be 1-31 for monthly schedules' });
  if (!schedule.recipientUserIds.length) return res.status(400).json({ error: 'Select at least one recipient user' });
  schedule.createdBy = req.user?.userName || req.user?.userId || 'system';
  schedule.nextRunAt = schedule.isActive ? computeNextRunAt(schedule, new Date()) : null;

  try {
    const scheduleId = await Admin.saveSchedule(schedule);
    return res.status(req.body.scheduleId ? 200 : 201).json({ scheduleId, message: 'Schedule saved' });
  } catch (err) {
    logger.error('admin/saveSchedule error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteSchedule(req, res) {
  try {
    await Admin.deleteSchedule(req.params.scheduleId);
    return res.json({ message: 'Schedule deleted' });
  } catch (err) {
    logger.error('admin/deleteSchedule error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}

export async function runScheduleNow(req, res) {
  try {
    const outcome = await runScheduledReportNow(req.params.scheduleId);
    return res.json(outcome);
  } catch (err) {
    logger.error('admin/runScheduleNow error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
}
