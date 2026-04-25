import { db, sql } from '../db/pool.js';

async function ensureAppSettingsTable() {
  const pool = await db.getPool();
  await pool.request().query(`
    IF OBJECT_ID('[dbo].[AppSettings]', 'U') IS NULL
    BEGIN
      CREATE TABLE [dbo].[AppSettings] (
        [SettingKey] NVARCHAR(100) NOT NULL PRIMARY KEY,
        [SettingValue] NVARCHAR(MAX) NULL,
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
      )
    END
  `);
}

async function ensureReportSchedulesSchema() {
  const pool = await db.getPool();
  await pool.request().query(`
    IF OBJECT_ID('[dbo].[ReportSchedules]', 'U') IS NULL
    BEGIN
      CREATE TABLE [dbo].[ReportSchedules] (
        [ScheduleId] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        [Name] NVARCHAR(200) NOT NULL,
        [ReportType] NVARCHAR(50) NOT NULL,
        [DeliveryFormat] NVARCHAR(10) NOT NULL DEFAULT 'xlsx',
        [Frequency] NVARCHAR(20) NOT NULL DEFAULT 'daily',
        [IntervalHours] INT NULL,
        [DayOfWeek] INT NULL,
        [DayOfMonth] INT NULL,
        [TimeOfDay] NVARCHAR(5) NOT NULL DEFAULT '08:00',
        [LookbackDays] INT NOT NULL DEFAULT 7,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [RecipientUserIdsJson] NVARCHAR(MAX) NULL,
        [FiltersJson] NVARCHAR(MAX) NULL,
        [LastRunAt] DATETIME2 NULL,
        [NextRunAt] DATETIME2 NULL,
        [LastStatus] NVARCHAR(20) NULL,
        [LastError] NVARCHAR(MAX) NULL,
        [CreatedBy] NVARCHAR(100) NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
      )
    END
  `);
  for (const [col, def] of [
    ['IntervalHours', 'INT NULL'],
    ['RecipientUserIdsJson', 'NVARCHAR(MAX) NULL'],
    ['LookbackDays', 'INT NOT NULL DEFAULT 7'],
    ['FiltersJson', 'NVARCHAR(MAX) NULL'],
    ['LastRunAt', 'DATETIME2 NULL'],
    ['NextRunAt', 'DATETIME2 NULL'],
    ['LastStatus', 'NVARCHAR(20) NULL'],
    ['LastError', 'NVARCHAR(MAX) NULL'],
    ['CreatedBy', 'NVARCHAR(100) NULL'],
    ['CreatedAt', 'DATETIME2 NOT NULL DEFAULT GETUTCDATE()'],
    ['UpdatedAt', 'DATETIME2 NOT NULL DEFAULT GETUTCDATE()'],
  ]) {
    await pool.request().query(`
      IF COL_LENGTH('dbo.ReportSchedules', '${col}') IS NULL
        ALTER TABLE [dbo].[ReportSchedules] ADD [${col}] ${def}
    `);
  }
}

function mapUser(row) {
  return {
    userId: row.UserId,
    username: row.Username,
    displayName: row.DisplayName,
    email: row.Email,
    role: row.Role,
    isActive: Boolean(row.IsActive),
    receiveScheduledReports: Boolean(row.ReceiveScheduledReports),
    authProvider: row.AuthProvider,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
  };
}

function mapSchedule(row) {
  return {
    scheduleId: row.ScheduleId,
    name: row.Name,
    reportType: row.ReportType,
    deliveryFormat: row.DeliveryFormat,
    frequency: row.Frequency,
    intervalHours: row.IntervalHours,
    dayOfWeek: row.DayOfWeek,
    dayOfMonth: row.DayOfMonth,
    timeOfDay: row.TimeOfDay,
    lookbackDays: row.LookbackDays,
    isActive: Boolean(row.IsActive),
    recipientUserIds: row.RecipientUserIdsJson ? JSON.parse(row.RecipientUserIdsJson) : [],
    filters: row.FiltersJson ? JSON.parse(row.FiltersJson) : {},
    lastRunAt: row.LastRunAt,
    nextRunAt: row.NextRunAt,
    lastStatus: row.LastStatus,
    lastError: row.LastError,
    createdBy: row.CreatedBy,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt,
  };
}

export async function listUsers() {
  const pool = await db.getPool();
  const result = await pool.request().query(`
    SELECT
      UserId,
      Username,
      DisplayName,
      Email,
      Role,
      IsActive,
      CASE
        WHEN COL_LENGTH('dbo.Users', 'ReceiveScheduledReports') IS NULL THEN CAST(0 AS bit)
        ELSE ReceiveScheduledReports
      END AS ReceiveScheduledReports,
      AuthProvider,
      CreatedAt,
      UpdatedAt
    FROM [dbo].[Users]
    ORDER BY DisplayName, Username
  `);
  return result.recordset.map(mapUser);
}

export async function getSmtpSettings() {
  await ensureAppSettingsTable();
  const pool = await db.getPool();
  const exists = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('[dbo].[AppSettings]', 'U') IS NULL THEN 0 ELSE 1 END AS existsFlag
  `);
  if (!exists.recordset[0]?.existsFlag) return {};
  const result = await pool.request().query(`
    SELECT SettingKey, SettingValue
    FROM [dbo].[AppSettings]
    WHERE SettingKey LIKE 'smtp.%'
    ORDER BY SettingKey
  `);
  return Object.fromEntries(result.recordset.map((row) => [row.SettingKey, row.SettingValue]));
}

export async function saveSmtpSettings(settings) {
  await ensureAppSettingsTable();
  const pool = await db.getPool();
  for (const [key, value] of Object.entries(settings)) {
    const req = pool.request();
    req.input('SettingKey', sql.NVarChar(100), key);
    req.input('SettingValue', sql.NVarChar(sql.MAX), value ?? '');
    await req.query(`
      MERGE [dbo].[AppSettings] AS t
      USING (SELECT @SettingKey AS SettingKey) AS s ON t.SettingKey = s.SettingKey
      WHEN MATCHED THEN
        UPDATE SET SettingValue = @SettingValue, UpdatedAt = GETUTCDATE()
      WHEN NOT MATCHED THEN
        INSERT (SettingKey, SettingValue) VALUES (@SettingKey, @SettingValue);
    `);
  }
}

export async function updateUser(userId, payload) {
  const pool = await db.getPool();
  const req = pool.request();
  req.input('UserId', sql.UniqueIdentifier, userId);
  req.input('DisplayName', sql.NVarChar(200), payload.displayName);
  req.input('Email', sql.NVarChar(200), payload.email || null);
  req.input('Role', sql.NVarChar(20), payload.role);
  req.input('IsActive', sql.Bit, payload.isActive ? 1 : 0);
  req.input('ReceiveScheduledReports', sql.Bit, payload.receiveScheduledReports ? 1 : 0);
  await req.query(`
    IF COL_LENGTH('dbo.Users', 'ReceiveScheduledReports') IS NULL
    BEGIN
      UPDATE [dbo].[Users]
      SET DisplayName = @DisplayName,
          Email = @Email,
          Role = @Role,
          IsActive = @IsActive,
          UpdatedAt = GETUTCDATE()
      WHERE UserId = @UserId
    END
    ELSE
    BEGIN
      UPDATE [dbo].[Users]
      SET DisplayName = @DisplayName,
          Email = @Email,
          Role = @Role,
          IsActive = @IsActive,
          ReceiveScheduledReports = @ReceiveScheduledReports,
          UpdatedAt = GETUTCDATE()
      WHERE UserId = @UserId
    END
  `);
}

export async function listSchedules() {
  const pool = await db.getPool();
  const exists = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('[dbo].[ReportSchedules]', 'U') IS NULL THEN 0 ELSE 1 END AS existsFlag
  `);
  if (!exists.recordset[0]?.existsFlag) return [];
  const result = await pool.request().query(`
    SELECT *
    FROM [dbo].[ReportSchedules]
    ORDER BY Name
  `);
  return result.recordset.map(mapSchedule);
}

export async function getSchedule(scheduleId) {
  const pool = await db.getPool();
  const exists = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('[dbo].[ReportSchedules]', 'U') IS NULL THEN 0 ELSE 1 END AS existsFlag
  `);
  if (!exists.recordset[0]?.existsFlag) return null;
  const req = pool.request();
  req.input('ScheduleId', sql.UniqueIdentifier, scheduleId);
  const result = await req.query(`SELECT * FROM [dbo].[ReportSchedules] WHERE ScheduleId = @ScheduleId`);
  return result.recordset[0] ? mapSchedule(result.recordset[0]) : null;
}

export async function saveSchedule(schedule) {
  await ensureReportSchedulesSchema();
  const pool = await db.getPool();
  const req = pool.request();
  req.input('ScheduleId', sql.UniqueIdentifier, schedule.scheduleId || null);
  req.input('Name', sql.NVarChar(200), schedule.name);
  req.input('ReportType', sql.NVarChar(50), schedule.reportType);
  req.input('DeliveryFormat', sql.NVarChar(10), schedule.deliveryFormat);
  req.input('Frequency', sql.NVarChar(20), schedule.frequency);
  req.input('IntervalHours', sql.Int, schedule.intervalHours ?? null);
  req.input('DayOfWeek', sql.Int, schedule.dayOfWeek ?? null);
  req.input('DayOfMonth', sql.Int, schedule.dayOfMonth ?? null);
  req.input('TimeOfDay', sql.NVarChar(5), schedule.timeOfDay);
  req.input('LookbackDays', sql.Int, schedule.lookbackDays);
  req.input('IsActive', sql.Bit, schedule.isActive ? 1 : 0);
  req.input('RecipientUserIdsJson', sql.NVarChar(sql.MAX), JSON.stringify(schedule.recipientUserIds || []));
  req.input('FiltersJson', sql.NVarChar(sql.MAX), JSON.stringify(schedule.filters || {}));
  req.input('NextRunAt', sql.DateTime2, schedule.nextRunAt || null);
  req.input('CreatedBy', sql.NVarChar(100), schedule.createdBy || null);

  const result = await req.query(`
    DECLARE @Out TABLE (ScheduleId UNIQUEIDENTIFIER);
    MERGE [dbo].[ReportSchedules] AS t
    USING (SELECT @ScheduleId AS ScheduleId) AS s ON t.ScheduleId = s.ScheduleId
    WHEN MATCHED THEN
      UPDATE SET
        Name = @Name,
        ReportType = @ReportType,
        DeliveryFormat = @DeliveryFormat,
        Frequency = @Frequency,
        IntervalHours = @IntervalHours,
        DayOfWeek = @DayOfWeek,
        DayOfMonth = @DayOfMonth,
        TimeOfDay = @TimeOfDay,
        LookbackDays = @LookbackDays,
        IsActive = @IsActive,
        RecipientUserIdsJson = @RecipientUserIdsJson,
        FiltersJson = @FiltersJson,
        NextRunAt = @NextRunAt,
        UpdatedAt = GETUTCDATE()
    WHEN NOT MATCHED THEN
      INSERT (Name, ReportType, DeliveryFormat, Frequency, IntervalHours, DayOfWeek, DayOfMonth, TimeOfDay, LookbackDays, IsActive, RecipientUserIdsJson, FiltersJson, NextRunAt, CreatedBy)
      VALUES (@Name, @ReportType, @DeliveryFormat, @Frequency, @IntervalHours, @DayOfWeek, @DayOfMonth, @TimeOfDay, @LookbackDays, @IsActive, @RecipientUserIdsJson, @FiltersJson, @NextRunAt, @CreatedBy)
    OUTPUT inserted.ScheduleId INTO @Out;
    SELECT ScheduleId FROM @Out;
  `);
  return result.recordset[0]?.ScheduleId || schedule.scheduleId;
}

export async function deleteSchedule(scheduleId) {
  const pool = await db.getPool();
  const req = pool.request();
  req.input('ScheduleId', sql.UniqueIdentifier, scheduleId);
  await req.query(`DELETE FROM [dbo].[ReportSchedules] WHERE ScheduleId = @ScheduleId`);
}

export async function listDueSchedules() {
  const pool = await db.getPool();
  const exists = await pool.request().query(`
    SELECT CASE WHEN OBJECT_ID('[dbo].[ReportSchedules]', 'U') IS NULL THEN 0 ELSE 1 END AS existsFlag
  `);
  if (!exists.recordset[0]?.existsFlag) return [];
  const result = await pool.request().query(`
    SELECT *
    FROM [dbo].[ReportSchedules]
    WHERE IsActive = 1
      AND NextRunAt IS NOT NULL
      AND NextRunAt <= GETUTCDATE()
    ORDER BY NextRunAt
  `);
  return result.recordset.map(mapSchedule);
}

export async function updateScheduleRun(scheduleId, payload) {
  const pool = await db.getPool();
  const req = pool.request();
  req.input('ScheduleId', sql.UniqueIdentifier, scheduleId);
  req.input('LastRunAt', sql.DateTime2, payload.lastRunAt || null);
  req.input('NextRunAt', sql.DateTime2, payload.nextRunAt || null);
  req.input('LastStatus', sql.NVarChar(20), payload.lastStatus || null);
  req.input('LastError', sql.NVarChar(sql.MAX), payload.lastError || null);
  await req.query(`
    UPDATE [dbo].[ReportSchedules]
    SET LastRunAt = @LastRunAt,
        NextRunAt = @NextRunAt,
        LastStatus = @LastStatus,
        LastError = @LastError,
        UpdatedAt = GETUTCDATE()
    WHERE ScheduleId = @ScheduleId
  `);
}

export async function listScheduleRecipients(userIds = []) {
  if (!userIds.length) return [];
  const pool = await db.getPool();
  const req = pool.request();
  userIds.forEach((userId, idx) => req.input(`UserId${idx + 1}`, sql.UniqueIdentifier, userId));
  const result = await req.query(`
    SELECT UserId, Username, DisplayName, Email
    FROM [dbo].[Users]
    WHERE IsActive = 1
      AND Email IS NOT NULL
      AND LTRIM(RTRIM(Email)) <> ''
      AND UserId IN (${userIds.map((_, idx) => `@UserId${idx + 1}`).join(', ')})
    ORDER BY DisplayName, Username
  `);
  return result.recordset;
}
