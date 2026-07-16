/**
 * db/migrate.js
 * Run once per company to create all required tables.
 * Usage: node src/db/migrate.js FCL1
 *        node src/db/migrate.js FCL1 CM3
 *        node src/db/migrate.js --down FCL1
 *        node src/db/migrate.js --down FCL1 CM3
 */
import { db } from './pool.js';
import dotenv from 'dotenv';
dotenv.config();

const args   = process.argv.slice(2);
const isDown = args[0] === '--down';
const companies = isDown ? args.slice(1) : args;

if (!isDown && !companies.length) {
  console.error('Usage: node src/db/migrate.js [--down] [COMPANY_001 COMPANY_002 ...]');
  process.exit(1);
}

async function getMigratedSchemas() {
  await db.connect();
  const pool = await db.getPool();
  const result = await pool.request().query(`
    SELECT s.name
    FROM sys.schemas s
    JOIN sys.tables  t ON t.schema_id = s.schema_id AND t.name = 'SalesHeader'
    WHERE s.name NOT IN ('dbo', 'guest', 'INFORMATION_SCHEMA', 'sys')
    ORDER BY s.name
  `);
  return result.recordset.map(r => r.name);
}

async function run(query) {
  const pool = await db.getPool();
  await pool.request().query(query);
}

async function migrate(companyId) {
  const s = companyId.replace(/[^a-zA-Z0-9_]/g, '');
  console.log(`\nMigrating schema: [${s}]`);

  await db.connect();
  const pool = await db.getPool();

  // ── Schema (must run alone in its own batch) ──────────────────────────────
  const schemaExists = await pool.request().query(
    `SELECT 1 FROM sys.schemas WHERE name = '${s}'`
  );
  if (!schemaExists.recordset.length) {
    await pool.request().query(`CREATE SCHEMA [${s}]`);
    console.log(`  [${s}] schema created.`);
  } else {
    console.log(`  [${s}] schema already exists.`);
  }

  // ── [dbo].[Companies] ─────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='Companies' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[Companies] (
      [CompanyId]   NVARCHAR(60)  NOT NULL PRIMARY KEY,
      [CompanyName] NVARCHAR(200) NOT NULL,
      [IsActive]    BIT           NOT NULL DEFAULT 1,
      [CreatedAt]   DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]   DATETIME2     NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[Companies]') AND name='UpdatedAt')
      ALTER TABLE [dbo].[Companies] ADD [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  `);
  console.log('  [dbo].[Companies] OK');

  // ── [dbo].[Users] ─────────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='Users' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[Users] (
      [UserId]       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [Username]     NVARCHAR(100)    NOT NULL UNIQUE,
      [PasswordHash] NVARCHAR(200)    NOT NULL DEFAULT '',
      [DisplayName]  NVARCHAR(200)    NOT NULL,
      [Email]        NVARCHAR(200)    NULL,
      [Role]         NVARCHAR(20)     NOT NULL DEFAULT 'user',
      [AuthProvider] NVARCHAR(20)     NOT NULL DEFAULT 'local',
      [IsActive]     BIT              NOT NULL DEFAULT 1,
      [CreatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('  [dbo].[Users] OK');

  // Upgrade guards — safe to run on existing tables
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[Users]') AND name='Email')
      ALTER TABLE [dbo].[Users] ADD [Email] NVARCHAR(200) NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[Users]') AND name='AuthProvider')
      ALTER TABLE [dbo].[Users] ADD [AuthProvider] NVARCHAR(20) NOT NULL DEFAULT 'local'
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[Users]') AND name='UpdatedAt')
      ALTER TABLE [dbo].[Users] ADD [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[Users]') AND name='ReceiveScheduledReports')
      ALTER TABLE [dbo].[Users] ADD [ReceiveScheduledReports] BIT NOT NULL DEFAULT 0
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[Users]') AND name='ShopCode')
      ALTER TABLE [dbo].[Users] ADD [ShopCode] NVARCHAR(50) NULL
  `);

  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='ReportSchedules' AND schema_id=SCHEMA_ID('dbo'))
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
  `);
  for (const [col, def] of [
    ['LookbackDays', 'INT NOT NULL DEFAULT 7'],
    ['IntervalHours', 'INT NULL'],
    ['RecipientUserIdsJson', 'NVARCHAR(MAX) NULL'],
    ['FiltersJson', 'NVARCHAR(MAX) NULL'],
    ['LastRunAt', 'DATETIME2 NULL'],
    ['NextRunAt', 'DATETIME2 NULL'],
    ['LastStatus', 'NVARCHAR(20) NULL'],
    ['LastError', 'NVARCHAR(MAX) NULL'],
    ['CreatedBy', 'NVARCHAR(100) NULL'],
    ['CreatedAt', 'DATETIME2 NOT NULL DEFAULT GETUTCDATE()'],
    ['UpdatedAt', 'DATETIME2 NOT NULL DEFAULT GETUTCDATE()'],
  ]) {
    await run(`
      IF NOT EXISTS (SELECT * FROM sys.columns
                     WHERE object_id=OBJECT_ID('[dbo].[ReportSchedules]') AND name='${col}')
        ALTER TABLE [dbo].[ReportSchedules] ADD [${col}] ${def}
    `);
  }
  console.log('  [dbo].[ReportSchedules] OK');

  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='AppSettings' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[AppSettings] (
      [SettingKey] NVARCHAR(100) NOT NULL PRIMARY KEY,
      [SettingValue] NVARCHAR(MAX) NULL,
      [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('  [dbo].[AppSettings] OK');

  // ── [dbo].[GlAccountMapper] ───────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='GlAccountMapper' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[GlAccountMapper] (
      [MapId]       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [CompanyId]   NVARCHAR(10)     NOT NULL DEFAULT 'ALL',
      [AccountFrom] NVARCHAR(20)     NOT NULL,
      [AccountTo]   NVARCHAR(20)     NOT NULL,
      [Section]     NVARCHAR(50)     NOT NULL,
      [LineLabel]   NVARCHAR(200)    NOT NULL,
      [SortOrder]   INT              NOT NULL DEFAULT 0,
      [CreatedAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('  [dbo].[GlAccountMapper] OK');

  // ── [dbo].[MgmtTemplate] ─────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='MgmtTemplate' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[MgmtTemplate] (
      [TemplateId]   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [TemplateName] NVARCHAR(200)    NOT NULL,
      [Description]  NVARCHAR(500)    NULL,
      [SortOrder]    INT              NOT NULL DEFAULT 0,
      [CreatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('  [dbo].[MgmtTemplate] OK');

  // ── [dbo].[MgmtLine] ─────────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='MgmtLine' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[MgmtLine] (
      [LineId]       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [TemplateId]   UNIQUEIDENTIFIER NOT NULL,
      [LineCode]     NVARCHAR(50)     NOT NULL,
      [LineLabel]    NVARCHAR(200)    NOT NULL,
      [LineType]     NVARCHAR(20)     NOT NULL DEFAULT 'data',
      [SubtotalOf]   NVARCHAR(500)    NULL,
      [IndentLevel]  INT              NOT NULL DEFAULT 0,
      [IsBold]       BIT              NOT NULL DEFAULT 0,
      [IsNegated]    BIT              NOT NULL DEFAULT 0,
      [SortOrder]    INT              NOT NULL DEFAULT 0,
      [CreatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('  [dbo].[MgmtLine] OK');

  // ── [dbo].[MgmtFormula] ──────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='MgmtFormula' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[MgmtFormula] (
      [FormulaId]   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [LineId]      UNIQUEIDENTIFIER NOT NULL,
      [CompanyId]     NVARCHAR(10)     NOT NULL DEFAULT 'ALL',
      [AccountFrom]   NVARCHAR(20)     NOT NULL DEFAULT '',
      [AccountTo]     NVARCHAR(20)     NOT NULL DEFAULT '',
      [Operation]     NVARCHAR(10)     NOT NULL DEFAULT 'ADD',
      [SelectionMode] NVARCHAR(20)     NOT NULL DEFAULT 'range',
      [AccountList]   NVARCHAR(MAX)    NULL,
      [SortOrder]     INT              NOT NULL DEFAULT 0,
      [CreatedAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('  [dbo].[MgmtFormula] OK');

  // ── [dbo].[MgmtMeasure] ──────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='MgmtMeasure' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[MgmtMeasure] (
      [MeasureId]      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [TemplateId]     UNIQUEIDENTIFIER NOT NULL,
      [MeasureCode]    NVARCHAR(50)     NOT NULL,
      [MeasureLabel]   NVARCHAR(100)    NOT NULL,
      [DateMode]       NVARCHAR(20)     NOT NULL DEFAULT 'MTD',
      [CustomDateFrom] DATE             NULL,
      [CustomDateTo]   DATE             NULL,
      [SortOrder]      INT              NOT NULL DEFAULT 0,
      [CreatedAt]      DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]      DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('  [dbo].[MgmtMeasure] OK');

  // Upgrade guards for MgmtFormula — add SelectionMode and AccountList if missing
  for (const [col, def] of [
    ['SelectionMode', "NVARCHAR(20) NOT NULL DEFAULT 'range'"],
    ['AccountList',   'NVARCHAR(MAX) NULL'],
  ]) {
    await run(`
      IF NOT EXISTS (SELECT * FROM sys.columns
                     WHERE object_id=OBJECT_ID('[dbo].[MgmtFormula]') AND name='${col}')
        ALTER TABLE [dbo].[MgmtFormula] ADD [${col}] ${def}
    `);
  }

  // Upgrade guards for MgmtLine — add Formula text and EnabledMeasures
  for (const [col, def] of [
    ['Formula',         'NVARCHAR(MAX) NULL'],
    ['EnabledMeasures', 'NVARCHAR(1000) NULL'],
  ]) {
    await run(`
      IF NOT EXISTS (SELECT * FROM sys.columns
                     WHERE object_id=OBJECT_ID('[dbo].[MgmtLine]') AND name='${col}')
        ALTER TABLE [dbo].[MgmtLine] ADD [${col}] ${def}
    `);
  }

  // Upgrade guard for MgmtMeasure — add SqlQuery
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[MgmtMeasure]') AND name='SqlQuery')
      ALTER TABLE [dbo].[MgmtMeasure] ADD [SqlQuery] NVARCHAR(MAX) NULL
  `);

  // ── [dbo].[PosVatRate] ───────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosVatRate' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosVatRate] (
      [VatRateId]    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [PostingGroup] NVARCHAR(50)     NOT NULL UNIQUE,
      [RatePercent]  DECIMAL(8,4)     NOT NULL DEFAULT 0,
      [TaxType]      NVARCHAR(10)     NULL,
      [IsActive]     BIT              NOT NULL DEFAULT 1,
      [CreatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  // Seed common defaults if table is empty
  await run(`
    IF NOT EXISTS (SELECT 1 FROM [dbo].[PosVatRate])
    INSERT INTO [dbo].[PosVatRate]([PostingGroup],[RatePercent],[TaxType])
    VALUES ('VAT16', 16, 'B'),
           ('VAT0',   0, 'A'),
           ('EXEMPT', 0, 'E')
  `);
  console.log('  [dbo].[PosVatRate] OK');

  // ── [dbo].[PosShop] ──────────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosShop' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosShop] (
      [ShopId]          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [Code]            NVARCHAR(50)     NOT NULL UNIQUE,
      [Name]            NVARCHAR(200)    NOT NULL,
      [LocationCode]    NVARCHAR(20)     NULL,
      [SalespersonCode] NVARCHAR(20)     NULL,
      [IsActive]        BIT              NOT NULL DEFAULT 1,
      [SortOrder]       INT              NOT NULL DEFAULT 0,
      [CreatedAt]       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosShop]') AND name='SalespersonCode')
      ALTER TABLE [dbo].[PosShop] ADD [SalespersonCode] NVARCHAR(20) NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosShop]') AND name='WalkInCustomerNo')
      ALTER TABLE [dbo].[PosShop] ADD [WalkInCustomerNo] NVARCHAR(20) NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosShop]') AND name='CustomerPriceGroup')
      ALTER TABLE [dbo].[PosShop] ADD [CustomerPriceGroup] NVARCHAR(50) NULL
  `);
  // Salesperson ext fields (BC Salesperson_Purchaser) carried onto the terminal
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosShop]') AND name='CurrentRoute')
      ALTER TABLE [dbo].[PosShop] ADD [CurrentRoute] NVARCHAR(200) NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosShop]') AND name='TptLocationCode')
      ALTER TABLE [dbo].[PosShop] ADD [TptLocationCode] NVARCHAR(200) NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosShop]') AND name='VatBusPostingGroup')
      ALTER TABLE [dbo].[PosShop] ADD [VatBusPostingGroup] NVARCHAR(50) NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosShop]') AND name='Email')
      ALTER TABLE [dbo].[PosShop] ADD [Email] NVARCHAR(200) NULL
  `);
  console.log('  [dbo].[PosShop] OK');

  // ── [dbo].[PosContact] ────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosContact' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosContact] (
      [ContactId]       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [BcContactNo]     NVARCHAR(20)     NOT NULL UNIQUE,
      [Name]            NVARCHAR(200)    NOT NULL,
      [MobileNo]        NVARCHAR(30)     NULL,
      [Email]           NVARCHAR(200)    NULL,
      [KraPin]          NVARCHAR(30)     NULL,
      [SalespersonCode] NVARCHAR(20)     NULL,
      [ShopCode]        NVARCHAR(50)     NULL,
      [IsActive]        BIT              NOT NULL DEFAULT 1,
      [CreatedAt]       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]       DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosContact]') AND name='KraPin')
      ALTER TABLE [dbo].[PosContact] ADD [KraPin] NVARCHAR(30) NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosContact]') AND name='IsWalkIn')
      ALTER TABLE [dbo].[PosContact] ADD [IsWalkIn] BIT NOT NULL DEFAULT 0
  `);
  for (const [col, def] of [
    ['RouteCode',       'NVARCHAR(20)  NULL'],
    ['CustomerType',    'NVARCHAR(20)  NULL'],
    ['CompanyName',     'NVARCHAR(200) NULL'],
    ['ParentContactNo', 'NVARCHAR(20)  NULL'],
    ['IsLocalOnly',     'BIT NOT NULL DEFAULT 0'],
  ]) {
    await run(`
      IF NOT EXISTS (SELECT * FROM sys.columns
                     WHERE object_id=OBJECT_ID('[dbo].[PosContact]') AND name='${col}')
        ALTER TABLE [dbo].[PosContact] ADD [${col}] ${def}
    `);
  }
  console.log('  [dbo].[PosContact] OK');

  // ── [dbo].[PosCategory] ──────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosCategory' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosCategory] (
      [CategoryId] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [Code]       NVARCHAR(50)     NOT NULL UNIQUE,
      [Name]       NVARCHAR(200)    NOT NULL,
      [SortOrder]  INT              NOT NULL DEFAULT 0,
      [IsActive]   BIT              NOT NULL DEFAULT 1,
      [CreatedAt]  DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]  DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('  [dbo].[PosCategory] OK');

  // ── [dbo].[PosItem] ───────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosItem' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosItem] (
      [ItemId]       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [ItemNo]       NVARCHAR(30)     NOT NULL UNIQUE,
      [Description]  NVARCHAR(200)    NOT NULL,
      [CategoryCode] NVARCHAR(50)     NULL,
      [UnitPrice]    DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [Barcode]      NVARCHAR(100)    NULL,
      [ImageUrl]     NVARCHAR(500)    NULL,
      [IsActive]     BIT              NOT NULL DEFAULT 1,
      [SortOrder]    INT              NOT NULL DEFAULT 0,
      [CreatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  for (const [col, def] of [
    ['EtimsItemCode',      'NVARCHAR(50)  NULL'],
    ['EtimsItemClassCode', 'NVARCHAR(50)  NULL'],
    ['TaxType',            'NVARCHAR(10)  NULL'],
    ['UnitOfMeasure',      'NVARCHAR(20)  NULL'],
    ['VatPostingGroup',    'NVARCHAR(50)  NULL'],
    ['PriceIncludesVat',   'BIT NOT NULL DEFAULT 0'],
    ['VatPercent',         'DECIMAL(8,4)  NOT NULL DEFAULT 0'],
    // eTIMS / BC sync companions (written by the "Sync from BC" MERGE in PosModel)
    ['ProductionCategory', 'NVARCHAR(50)  NULL'],
    ['PackagingUnit',      'NVARCHAR(20)  NULL'],
    ['QuantityUnit',       'NVARCHAR(20)  NULL'],
    ['IsByproduct',        'BIT NOT NULL DEFAULT 0'],
    ['SourceCompany',      'NVARCHAR(20)  NULL'],
  ]) {
    await run(`
      IF NOT EXISTS (SELECT * FROM sys.columns
                     WHERE object_id=OBJECT_ID('[dbo].[PosItem]') AND name='${col}')
        ALTER TABLE [dbo].[PosItem] ADD [${col}] ${def}
    `);
  }
  console.log('  [dbo].[PosItem] OK');

  // ── [dbo].[PosPaymentType] ────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosPaymentType' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosPaymentType] (
      [TypeId]       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [Code]         NVARCHAR(50)     NOT NULL,
      [ShopCode]     NVARCHAR(50)     NULL,
      [Name]         NVARCHAR(200)    NOT NULL,
      [PaymentClass] NVARCHAR(20)     NOT NULL DEFAULT 'Cash',
      [IsActive]     BIT              NOT NULL DEFAULT 1,
      [SortOrder]    INT              NOT NULL DEFAULT 0,
      [CreatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [UQ_PosPaymentType_Code_Shop] UNIQUE ([Code], [ShopCode])
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosPaymentType]') AND name='ShopCode')
      ALTER TABLE [dbo].[PosPaymentType] ADD [ShopCode] NVARCHAR(50) NULL
  `);
  for (const [col, def] of [
    ['ApiEndpoint',     'NVARCHAR(250) NULL'],
    ['UseApiEndpoint',  'BIT NOT NULL DEFAULT 0'],
    ['BalanceAcctType', 'NVARCHAR(20)  NULL'],
    ['BalanceAcctNo',   'NVARCHAR(20)  NULL'],
    ['BcSourceNo',      'NVARCHAR(20)  NULL'],
    ['Description',     'NVARCHAR(500) NULL'],
  ]) {
    await run(`
      IF NOT EXISTS (SELECT * FROM sys.columns
                     WHERE object_id=OBJECT_ID('[dbo].[PosPaymentType]') AND name='${col}')
        ALTER TABLE [dbo].[PosPaymentType] ADD [${col}] ${def}
    `);
  }
  console.log('  [dbo].[PosPaymentType] OK');

  // ── [dbo].[PosOrder] ─────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosOrder' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosOrder] (
      [OrderId]       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [OrderNo]       NVARCHAR(30)     NOT NULL UNIQUE,
      [ShopCode]      NVARCHAR(50)     NULL,
      [CashierUserId] NVARCHAR(100)    NOT NULL,
      [CashierName]   NVARCHAR(200)    NOT NULL,
      [Status]        NVARCHAR(20)     NOT NULL DEFAULT 'open',
      [TotalAmount]   DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [Notes]         NVARCHAR(500)    NULL,
      [CreatedAt]     DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]     DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosOrder]') AND name='ShopCode')
      ALTER TABLE [dbo].[PosOrder] ADD [ShopCode] NVARCHAR(50) NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosOrder]') AND name='ContactNo')
      ALTER TABLE [dbo].[PosOrder] ADD [ContactNo] NVARCHAR(20) NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosOrder]') AND name='ContactName')
      ALTER TABLE [dbo].[PosOrder] ADD [ContactName] NVARCHAR(200) NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosOrder]') AND name='ContactPhone')
      ALTER TABLE [dbo].[PosOrder] ADD [ContactPhone] NVARCHAR(30) NULL
  `);
  for (const [col, def] of [
    ['EtimsNo',            'NVARCHAR(50)   NULL'],
    ['EtimsInvoiceNo',     'NVARCHAR(50)   NULL'],
    ['CuSerialNo',         'NVARCHAR(50)   NULL'],
    ['QrUrl',              'NVARCHAR(500)  NULL'],
    ['SignedAt',           'NVARCHAR(100)  NULL'],
    ['PrintedAt',          'DATETIME2      NULL'],
    ['PdfFileName',        'NVARCHAR(255)  NULL'],
    ['ConfirmationPrintedAt', 'DATETIME2   NULL'],
    ['StkPushReference',   'NVARCHAR(100)  NULL'],
    ['StkPushSentAt',      'DATETIME2      NULL'],
    ['StkPushStatus',      'NVARCHAR(20)   NULL'],
  ]) {
    await run(`
      IF NOT EXISTS (SELECT * FROM sys.columns
                     WHERE object_id=OBJECT_ID('[dbo].[PosOrder]') AND name='${col}')
        ALTER TABLE [dbo].[PosOrder] ADD [${col}] ${def}
    `);
  }
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosOrder]') AND name='ContactPin')
      ALTER TABLE [dbo].[PosOrder] ADD [ContactPin] NVARCHAR(30) NULL
  `);
  console.log('  [dbo].[PosOrder] OK');

  // ── [dbo].[PosOrderLine] ─────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosOrderLine' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosOrderLine] (
      [LineId]      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [OrderId]     UNIQUEIDENTIFIER NOT NULL,
      [ItemNo]      NVARCHAR(30)     NOT NULL,
      [Description] NVARCHAR(200)    NOT NULL,
      [Quantity]    DECIMAL(18,4)    NOT NULL DEFAULT 1,
      [UnitPrice]   DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [LineAmount]  DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [SortOrder]   INT              NOT NULL DEFAULT 0,
      [CreatedAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [FK_PosOrderLine_Order]
        FOREIGN KEY ([OrderId]) REFERENCES [dbo].[PosOrder]([OrderId]) ON DELETE CASCADE
    )
  `);
  console.log('  [dbo].[PosOrderLine] OK');

  // ── [dbo].[PosPayment] ───────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosPayment' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosPayment] (
      [PaymentId]       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [OrderId]         UNIQUEIDENTIFIER NOT NULL,
      [PaymentTypeCode] NVARCHAR(50)     NOT NULL,
      [PaymentTypeName] NVARCHAR(200)    NOT NULL,
      [Amount]          DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [MobileNo]        NVARCHAR(30)     NULL,
      [Reference]       NVARCHAR(100)    NULL,
      [Status]          NVARCHAR(20)     NOT NULL DEFAULT 'pending',
      [CreatedAt]       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [FK_PosPayment_Order]
        FOREIGN KEY ([OrderId]) REFERENCES [dbo].[PosOrder]([OrderId]) ON DELETE CASCADE
    )
  `);
  console.log('  [dbo].[PosPayment] OK');

  // ── [dbo].[PosSpecialPrice] (date-bound offers — overrides PosItem.UnitPrice) ──
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosSpecialPrice' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosSpecialPrice] (
      [SpecialPriceId] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [ItemNo]         NVARCHAR(30)     NOT NULL,
      [ShopCode]       NVARCHAR(50)     NULL,    -- NULL = all shops
      [UnitPrice]      DECIMAL(18,4)    NOT NULL,
      [StartingDate]   DATE             NOT NULL,
      [EndingDate]     DATE             NULL,    -- NULL = open-ended
      [Description]    NVARCHAR(200)    NULL,
      [IsActive]       BIT              NOT NULL DEFAULT 1,
      [CreatedAt]      DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]      DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  // Source tag: 'MANUAL' (admin/CSV offers) vs 'BC' (synced from BC Sales Price).
  // Lets the shop-price sync prune only its own rows without touching manual offers.
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosSpecialPrice]') AND name='Source')
      ALTER TABLE [dbo].[PosSpecialPrice] ADD [Source] NVARCHAR(20) NOT NULL DEFAULT 'MANUAL'
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.indexes
                   WHERE name='IX_PosSpecialPrice_Item_Shop'
                     AND object_id=OBJECT_ID('[dbo].[PosSpecialPrice]'))
    CREATE INDEX [IX_PosSpecialPrice_Item_Shop]
      ON [dbo].[PosSpecialPrice]([ItemNo],[ShopCode],[IsActive])
  `);
  console.log('  [dbo].[PosSpecialPrice] OK');

  // ── [dbo].[PosMpesaApplication] (M-Pesa confirmation-code → invoice ledger) ──
  // One row per (M-Pesa code applied to an order). A single code can be applied
  // to several invoices (partial utilization); available balance for a code =
  // MpesaAmount − SUM(AppliedAmount). Powers the checkout match table + reports.
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosMpesaApplication' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosMpesaApplication] (
      [ApplicationId] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [MpesaCode]     NVARCHAR(40)     NOT NULL,
      [MpesaAmount]   DECIMAL(18,2)    NOT NULL DEFAULT 0,
      [AppliedAmount] DECIMAL(18,2)    NOT NULL DEFAULT 0,
      [Phone]         NVARCHAR(30)     NULL,
      [PayerName]     NVARCHAR(200)    NULL,
      [TransTime]     DATETIME2        NULL,
      [OrderId]       UNIQUEIDENTIFIER NULL,
      [OrderNo]       NVARCHAR(40)     NULL,
      [InvoiceNo]     NVARCHAR(60)     NULL,
      [ShopCode]      NVARCHAR(50)     NULL,
      [CreatedBy]     NVARCHAR(200)    NULL,
      [CreatedAt]     DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_PosMpesaApplication_Code'
                     AND object_id=OBJECT_ID('[dbo].[PosMpesaApplication]'))
    CREATE INDEX [IX_PosMpesaApplication_Code] ON [dbo].[PosMpesaApplication]([MpesaCode])
  `);
  console.log('  [dbo].[PosMpesaApplication] OK');

  // ── [dbo].[PosFavourite] (per-user favourite items) ─────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosFavourite' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosFavourite] (
      [FavouriteId] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [UserId]      UNIQUEIDENTIFIER NOT NULL,
      [ItemNo]      NVARCHAR(30)     NOT NULL,
      [SortOrder]   INT              NOT NULL DEFAULT 0,
      [CreatedAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [UQ_PosFavourite_User_Item] UNIQUE ([UserId],[ItemNo])
    )
  `);
  console.log('  [dbo].[PosFavourite] OK');

  // ── [dbo].[PosStockWatermark] (per-terminal BC item-ledger baseline) ─────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosStockWatermark' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosStockWatermark] (
      [ShopCode]      NVARCHAR(50)  NOT NULL PRIMARY KEY,
      [LocationCode]  NVARCHAR(20)  NULL,
      [SourceCompany] NVARCHAR(20)  NULL,
      [LastEntryNo]   INT           NOT NULL DEFAULT 0,
      [ResetAt]       DATETIME2     NULL,
      [ResetBy]       NVARCHAR(100) NULL,
      [LastLoadAt]    DATETIME2     NULL,
      [UpdatedAt]     DATETIME2     NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('  [dbo].[PosStockWatermark] OK');

  // ── [dbo].[PosTillSession] + balances + transactions ─────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosTillSession' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosTillSession] (
      [SessionId]      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [SessionNo]      NVARCHAR(30)     NOT NULL UNIQUE,
      [ShopCode]       NVARCHAR(50)     NOT NULL,
      [CashierUserId]  NVARCHAR(100)    NOT NULL,
      [CashierName]    NVARCHAR(200)    NOT NULL,
      [Status]         NVARCHAR(20)     NOT NULL DEFAULT 'open',
      [OpenedAt]       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [ClosedAt]       DATETIME2        NULL,
      [Notes]          NVARCHAR(500)    NULL,
      [CreatedAt]      DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]      DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosTillBalance' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosTillBalance] (
      [BalanceId]        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [SessionId]        UNIQUEIDENTIFIER NOT NULL,
      [PaymentTypeCode]  NVARCHAR(50)     NOT NULL,
      [PaymentTypeName]  NVARCHAR(200)    NOT NULL,
      [OpeningAmount]    DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [DeclaredClosing]  DECIMAL(18,4)    NULL,
      [CreatedAt]        DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]        DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [FK_PosTillBalance_Session] FOREIGN KEY ([SessionId])
        REFERENCES [dbo].[PosTillSession]([SessionId]) ON DELETE CASCADE,
      CONSTRAINT [UQ_PosTillBalance_SessionType] UNIQUE ([SessionId],[PaymentTypeCode])
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosTillTransaction' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosTillTransaction] (
      [TransactionId]   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [SessionId]       UNIQUEIDENTIFIER NOT NULL,
      [PaymentTypeCode] NVARCHAR(50)     NOT NULL,
      [TransactionType] NVARCHAR(30)     NOT NULL,  -- cash-in, cash-out, drop, payout, expense
      [Amount]          DECIMAL(18,4)    NOT NULL,  -- signed: +in / -out
      [Reference]       NVARCHAR(100)    NULL,
      [Notes]           NVARCHAR(500)    NULL,
      [CreatedBy]       NVARCHAR(100)    NULL,
      [CreatedAt]       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [FK_PosTillTx_Session] FOREIGN KEY ([SessionId])
        REFERENCES [dbo].[PosTillSession]([SessionId]) ON DELETE CASCADE
    )
  `);
  console.log('  [dbo].[PosTillSession] + balances + tx OK');

  // ── [dbo].[PosStockMovement] (ledger — every quantity change in/out) ──────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosStockMovement' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosStockMovement] (
      [MovementId]    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [ShopCode]      NVARCHAR(50)     NOT NULL,
      [ItemNo]        NVARCHAR(30)     NOT NULL,
      [Description]   NVARCHAR(200)    NULL,
      [MovementType]  NVARCHAR(30)     NOT NULL,
      [Quantity]      DECIMAL(18,4)    NOT NULL,
      [UnitPrice]     DECIMAL(18,4)    NULL,
      [ReferenceType] NVARCHAR(30)     NULL,
      [ReferenceId]   UNIQUEIDENTIFIER NULL,
      [ReferenceNo]   NVARCHAR(30)     NULL,
      [MovementDate]  DATE             NOT NULL,
      [Notes]         NVARCHAR(500)    NULL,
      [CreatedBy]     NVARCHAR(100)    NULL,
      [CreatedAt]     DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.indexes
                   WHERE name='IX_PosStockMovement_Shop_Item_Date'
                     AND object_id=OBJECT_ID('[dbo].[PosStockMovement]'))
    CREATE INDEX [IX_PosStockMovement_Shop_Item_Date]
      ON [dbo].[PosStockMovement] ([ShopCode],[ItemNo],[MovementDate])
  `);
  console.log('  [dbo].[PosStockMovement] OK');

  // ── [dbo].[PosStockRequest] + lines ─────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosStockRequest' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosStockRequest] (
      [RequestId]     UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [RequestNo]     NVARCHAR(30)     NOT NULL UNIQUE,
      [ShopCode]      NVARCHAR(50)     NOT NULL,
      [RequestedBy]   NVARCHAR(100)    NOT NULL,
      [RequestedName] NVARCHAR(200)    NOT NULL,
      [Status]        NVARCHAR(20)     NOT NULL DEFAULT 'open',
      [Notes]         NVARCHAR(500)    NULL,
      [SubmittedAt]   DATETIME2        NULL,
      [ApprovedBy]    NVARCHAR(100)    NULL,
      [ApprovedAt]    DATETIME2        NULL,
      [CompletedAt]   DATETIME2        NULL,
      [CreatedAt]     DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]     DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosStockRequestLine' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosStockRequestLine] (
      [LineId]            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [RequestId]         UNIQUEIDENTIFIER NOT NULL,
      [ItemNo]            NVARCHAR(30)     NOT NULL,
      [Description]       NVARCHAR(200)    NOT NULL,
      [QuantityRequested] DECIMAL(18,4)    NOT NULL,
      [QuantityReceived]  DECIMAL(18,4)    NULL,
      [UnitOfMeasure]     NVARCHAR(20)     NULL,
      [SortOrder]         INT              NOT NULL DEFAULT 0,
      [CreatedAt]         DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]         DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [FK_PosStockRequestLine_Hdr] FOREIGN KEY ([RequestId])
        REFERENCES [dbo].[PosStockRequest]([RequestId]) ON DELETE CASCADE
    )
  `);
  console.log('  [dbo].[PosStockRequest] + lines OK');

  // ── [dbo].[PosStockTake] + lines ────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosStockTake' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosStockTake] (
      [StockTakeId] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [StockTakeNo] NVARCHAR(30)     NOT NULL UNIQUE,
      [ShopCode]    NVARCHAR(50)     NOT NULL,
      [DateFrom]    DATE             NOT NULL,
      [DateTo]      DATE             NOT NULL,
      [Status]      NVARCHAR(20)     NOT NULL DEFAULT 'open',
      [CountedBy]   NVARCHAR(100)    NULL,
      [CompletedAt] DATETIME2        NULL,
      [Notes]       NVARCHAR(500)    NULL,
      [CreatedAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosStockTakeLine' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosStockTakeLine] (
      [LineId]        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [StockTakeId]   UNIQUEIDENTIFIER NOT NULL,
      [ItemNo]        NVARCHAR(30)     NOT NULL,
      [Description]   NVARCHAR(200)    NOT NULL,
      [UnitOfMeasure] NVARCHAR(20)     NULL,
      [OpeningStock]  DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [IncreasesQty]  DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [DecreasesQty]  DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [ExpectedStock] DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [PhysicalStock] DECIMAL(18,4)    NULL,
      [Variance]      DECIMAL(18,4)    NULL,
      [Comments]      NVARCHAR(500)    NULL,
      [SortOrder]     INT              NOT NULL DEFAULT 0,
      [CreatedAt]     DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]     DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [FK_PosStockTakeLine_Hdr] FOREIGN KEY ([StockTakeId])
        REFERENCES [dbo].[PosStockTake]([StockTakeId]) ON DELETE CASCADE
    )
  `);
  console.log('  [dbo].[PosStockTake] + lines OK');

  // ── [dbo].[PosThirdParty] (master list of third-party recipients) ──────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosThirdParty' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosThirdParty] (
      [ThirdPartyId] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [Code]         NVARCHAR(50)     NOT NULL UNIQUE,
      [Name]         NVARCHAR(200)    NOT NULL,
      [ShopCode]     NVARCHAR(50)     NULL,
      [IsActive]     BIT              NOT NULL DEFAULT 1,
      [Notes]        NVARCHAR(500)    NULL,
      [CreatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('  [dbo].[PosThirdParty] OK');

  // ── [dbo].[PosThirdPartyTransfer] + lines ──────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosThirdPartyTransfer' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosThirdPartyTransfer] (
      [TransferId]   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [TransferNo]   NVARCHAR(30)     NOT NULL UNIQUE,
      [TransferDate] DATE             NOT NULL,
      [ThirdPartyId] UNIQUEIDENTIFIER NULL,
      [ThirdPartyName] NVARCHAR(200)  NULL,
      [DestinationShopCode] NVARCHAR(50) NULL,
      [Status]       NVARCHAR(20)     NOT NULL DEFAULT 'draft',
      [TotalCost]    DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [Notes]        NVARCHAR(500)    NULL,
      [CreatedBy]    NVARCHAR(100)    NULL,
      [CreatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [PostedAt]     DATETIME2        NULL,
      [UpdatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosThirdPartyTransferLine' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosThirdPartyTransferLine] (
      [LineId]        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [TransferId]    UNIQUEIDENTIFIER NOT NULL,
      [ItemNo]        NVARCHAR(30)     NOT NULL,
      [Description]   NVARCHAR(200)    NOT NULL,
      [Quantity]      DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [UnitOfMeasure] NVARCHAR(20)     NULL,
      [UnitCost]      DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [LineCost]      DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [SortOrder]     INT              NOT NULL DEFAULT 0,
      [CreatedAt]     DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [FK_PosThirdPartyTransferLine] FOREIGN KEY ([TransferId])
        REFERENCES [dbo].[PosThirdPartyTransfer]([TransferId]) ON DELETE CASCADE
    )
  `);
  // Relax DestinationShopCode to NULL — destination is the third party (which may or may not be linked to a shop)
  await run(`
    IF EXISTS (
      SELECT 1 FROM sys.columns
      WHERE object_id = OBJECT_ID('[dbo].[PosThirdPartyTransfer]')
        AND name = 'DestinationShopCode' AND is_nullable = 0
    )
    ALTER TABLE [dbo].[PosThirdPartyTransfer] ALTER COLUMN [DestinationShopCode] NVARCHAR(50) NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[dbo].[PosThirdPartyTransfer]') AND name='OriginLabel')
      ALTER TABLE [dbo].[PosThirdPartyTransfer] ADD [OriginLabel] NVARCHAR(100) NOT NULL DEFAULT 'HQ dispatch'
  `);
  console.log('  [dbo].[PosThirdPartyTransfer] + lines OK');

  // ── [dbo].[PosPortioning] + lines ──────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosPortioning' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosPortioning] (
      [PortioningId]      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [PortioningNo]      NVARCHAR(30)     NOT NULL UNIQUE,
      [PortioningDate]    DATE             NOT NULL,
      [SourceTransferLineId] UNIQUEIDENTIFIER NULL,
      [SourceItemNo]      NVARCHAR(30)     NOT NULL,
      [SourceDescription] NVARCHAR(200)    NOT NULL,
      [SourceQuantity]    DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [SourceUom]         NVARCHAR(20)     NULL,
      [SourceUnitCost]    DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [SourceTotalCost]   DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [ShopCode]          NVARCHAR(50)     NOT NULL,
      [Status]            NVARCHAR(20)     NOT NULL DEFAULT 'draft',
      [Notes]             NVARCHAR(500)    NULL,
      [CreatedBy]         NVARCHAR(100)    NULL,
      [CreatedAt]         DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [PostedAt]          DATETIME2        NULL,
      [UpdatedAt]         DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosPortioningLine' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosPortioningLine] (
      [LineId]         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [PortioningId]   UNIQUEIDENTIFIER NOT NULL,
      [ItemNo]         NVARCHAR(30)     NOT NULL,
      [Description]    NVARCHAR(200)    NOT NULL,
      [Quantity]       DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [UnitOfMeasure]  NVARCHAR(20)     NULL,
      [AllocatedCost]  DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [SortOrder]      INT              NOT NULL DEFAULT 0,
      [CreatedAt]      DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [FK_PosPortioningLine] FOREIGN KEY ([PortioningId])
        REFERENCES [dbo].[PosPortioning]([PortioningId]) ON DELETE CASCADE
    )
  `);
  console.log('  [dbo].[PosPortioning] + lines OK');

  // ── [dbo].[PosManualSale] (manual sales registration outside POS terminal) ─
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosManualSale' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosManualSale] (
      [ManualSaleId]      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [ManualSaleNo]      NVARCHAR(30)     NOT NULL UNIQUE,
      [SaleDate]          DATE             NOT NULL,
      [ShopCode]          NVARCHAR(50)     NOT NULL,
      [ItemNo]            NVARCHAR(30)     NOT NULL,
      [Description]       NVARCHAR(200)    NOT NULL,
      [Quantity]          DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [UnitOfMeasure]     NVARCHAR(20)     NULL,
      [UnitPrice]         DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [TotalAmount]       DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [Notes]             NVARCHAR(500)    NULL,
      [CreatedBy]         NVARCHAR(100)    NULL,
      [CreatedAt]         DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('  [dbo].[PosManualSale] OK');

  // ── [dbo].[PosWriteOff] (waste, spoilage, damage) ──────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosWriteOff' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosWriteOff] (
      [WriteOffId]    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [WriteOffNo]    NVARCHAR(30)     NOT NULL UNIQUE,
      [WriteOffDate]  DATE             NOT NULL,
      [ShopCode]      NVARCHAR(50)     NOT NULL,
      [ItemNo]        NVARCHAR(30)     NOT NULL,
      [Description]   NVARCHAR(200)    NOT NULL,
      [Quantity]      DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [UnitOfMeasure] NVARCHAR(20)     NULL,
      [UnitCost]      DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [TotalCost]     DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [Reason]        NVARCHAR(50)     NULL,
      [Notes]         NVARCHAR(500)    NULL,
      [SourceTransferLineId] UNIQUEIDENTIFIER NULL,
      [SourcePortioningId]   UNIQUEIDENTIFIER NULL,
      [Status]        NVARCHAR(20)     NOT NULL DEFAULT 'posted',
      [CreatedBy]     NVARCHAR(100)    NULL,
      [CreatedAt]     DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('  [dbo].[PosWriteOff] OK');

  // ── [dbo].[CustPostingGroupMap] ─────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='CustPostingGroupMap' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[CustPostingGroupMap] (
      [MapId]            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [CompanyId]        NVARCHAR(10)     NOT NULL,
      [NativeGroupCode]  NVARCHAR(100)    NOT NULL,
      [DisplayGroupCode] NVARCHAR(100)    NOT NULL,
      [SortOrder]        INT              NOT NULL DEFAULT 0,
      [CreatedAt]        DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]        DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('  [dbo].[CustPostingGroupMap] OK');

  // ══ Dispatch / Pick-and-Pack module ([dbo], global like Pos*) ═══════════════
  // Fulfilment pipeline off a paid POS order:
  //   pending → confirmed (4 parts) → assigned → assembled → packed → loaded.

  // ── [dbo].[DispatchOrder] ───────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='DispatchOrder' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[DispatchOrder] (
      [DispatchOrderId]  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [DispatchNo]       NVARCHAR(30)     NOT NULL UNIQUE,
      [SourceType]       NVARCHAR(20)     NOT NULL DEFAULT 'pos',
      [SourceOrderId]    UNIQUEIDENTIFIER NULL,
      [Company]          NVARCHAR(10)     NULL,
      [OrderNo]          NVARCHAR(40)     NULL,
      [CustomerNo]       NVARCHAR(30)     NULL,
      [CustomerName]     NVARCHAR(200)    NULL,
      [ShopCode]         NVARCHAR(50)     NULL,
      [ShopName]         NVARCHAR(200)    NULL,
      [RouteCode]        NVARCHAR(40)     NULL,
      [SalespersonCode]  NVARCHAR(20)     NULL,
      [SalespersonName]  NVARCHAR(200)    NULL,
      [LpoNo]            NVARCHAR(50)     NULL,
      [ShipmentDate]     DATE             NULL,
      [Status]           NVARCHAR(20)     NOT NULL DEFAULT 'pending',
      [Confirmed]        BIT              NOT NULL DEFAULT 0,
      [Assembled]        BIT              NOT NULL DEFAULT 0,
      [Packed]           BIT              NOT NULL DEFAULT 0,
      [Loaded]           BIT              NOT NULL DEFAULT 0,
      [AssignedToUserId] NVARCHAR(100)    NULL,
      [AssignedToName]   NVARCHAR(200)    NULL,
      [AssignedAt]       DATETIME2        NULL,
      [TotalAmount]      DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [Notes]            NVARCHAR(500)    NULL,
      [CreatedAt]        DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]        DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id=OBJECT_ID('[dbo].[DispatchOrder]') AND name='Company')
      ALTER TABLE [dbo].[DispatchOrder] ADD [Company] NVARCHAR(10) NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id=OBJECT_ID('[dbo].[DispatchOrder]') AND name='LpoNo')
      ALTER TABLE [dbo].[DispatchOrder] ADD [LpoNo] NVARCHAR(50) NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='UX_DispatchOrder_Source' AND object_id=OBJECT_ID('[dbo].[DispatchOrder]'))
    CREATE UNIQUE INDEX [UX_DispatchOrder_Source] ON [dbo].[DispatchOrder]([SourceOrderId]) WHERE [SourceOrderId] IS NOT NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='UX_DispatchOrder_BC' AND object_id=OBJECT_ID('[dbo].[DispatchOrder]'))
    CREATE UNIQUE INDEX [UX_DispatchOrder_BC] ON [dbo].[DispatchOrder]([Company],[OrderNo]) WHERE [SourceType]='bc'
  `);
  console.log('  [dbo].[DispatchOrder] OK');

  // ── [dbo].[DispatchOrderLine] ───────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='DispatchOrderLine' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[DispatchOrderLine] (
      [LineId]          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [DispatchOrderId] UNIQUEIDENTIFIER NOT NULL,
      [ItemNo]          NVARCHAR(30)     NULL,
      [Barcode]         NVARCHAR(50)     NULL,
      [Description]     NVARCHAR(250)    NULL,
      [OrderQty]        DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [Uom]             NVARCHAR(20)     NULL,
      [IsWeighted]      BIT              NOT NULL DEFAULT 0,
      [Part]            CHAR(1)          NULL,
      [SortOrder]       INT              NOT NULL DEFAULT 0,
      [CreatedAt]       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [FK_DispatchOrderLine_Order] FOREIGN KEY ([DispatchOrderId])
        REFERENCES [dbo].[DispatchOrder]([DispatchOrderId]) ON DELETE CASCADE
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id=OBJECT_ID('[dbo].[DispatchOrderLine]') AND name='Part')
      ALTER TABLE [dbo].[DispatchOrderLine] ADD [Part] CHAR(1) NULL
  `);
  console.log('  [dbo].[DispatchOrderLine] OK');

  // ── [dbo].[DispatchOrderPart] (the 4 A/B/C/D checkpoints per order) ──────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='DispatchOrderPart' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[DispatchOrderPart] (
      [PartId]            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [DispatchOrderId]   UNIQUEIDENTIFIER NOT NULL,
      [Part]              CHAR(1)          NOT NULL,
      [Active]            BIT              NOT NULL DEFAULT 1,
      [Confirmed]         BIT              NOT NULL DEFAULT 0,
      [ConfirmedByUserId] NVARCHAR(100)    NULL,
      [ConfirmedByName]   NVARCHAR(200)    NULL,
      [ConfirmedAt]       DATETIME2        NULL,
      [Assembled]         BIT              NOT NULL DEFAULT 0,
      [AssembledByUserId] NVARCHAR(100)    NULL,
      [AssembledByName]   NVARCHAR(200)    NULL,
      [AssembledAt]       DATETIME2        NULL,
      [Packed]            BIT              NOT NULL DEFAULT 0,
      [PackedAt]          DATETIME2        NULL,
      [CreatedAt]         DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]         DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [FK_DispatchOrderPart_Order] FOREIGN KEY ([DispatchOrderId])
        REFERENCES [dbo].[DispatchOrder]([DispatchOrderId]) ON DELETE CASCADE,
      CONSTRAINT [UQ_DispatchOrderPart] UNIQUE ([DispatchOrderId],[Part])
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id=OBJECT_ID('[dbo].[DispatchOrderPart]') AND name='Active')
      ALTER TABLE [dbo].[DispatchOrderPart] ADD [Active] BIT NOT NULL DEFAULT 1
  `);
  console.log('  [dbo].[DispatchOrderPart] OK');

  // ── [dbo].[DispatchAssemblyLine] (assembled qty per order line) ──────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='DispatchAssemblyLine' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[DispatchAssemblyLine] (
      [AssemblyLineId]    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [DispatchOrderId]   UNIQUEIDENTIFIER NOT NULL,
      [LineId]            UNIQUEIDENTIFIER NOT NULL,
      [AssembledQty]      DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [AssembledWeight]   DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [ReturnReasonCode]  NVARCHAR(20)     NULL,
      [ReturnReasonName]  NVARCHAR(200)    NULL,
      [AssembledByUserId] NVARCHAR(100)    NULL,
      [AssembledByName]   NVARCHAR(200)    NULL,
      [AssembledAt]       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [FK_DispatchAssemblyLine_Order] FOREIGN KEY ([DispatchOrderId])
        REFERENCES [dbo].[DispatchOrder]([DispatchOrderId]) ON DELETE CASCADE,
      CONSTRAINT [UQ_DispatchAssemblyLine] UNIQUE ([LineId])
    )
  `);
  console.log('  [dbo].[DispatchAssemblyLine] OK');

  // ── [dbo].[DispatchVesselType] (carton / vessel size master) ────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='DispatchVesselType' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[DispatchVesselType] (
      [VesselTypeId] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [Code]         NVARCHAR(30)     NOT NULL UNIQUE,
      [Description]  NVARCHAR(200)    NULL,
      [TareWeight]   DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [Blocked]      BIT              NOT NULL DEFAULT 0,
      [CreatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('  [dbo].[DispatchVesselType] OK');

  // ── [dbo].[DispatchPackingSession] (one packer + one checker per session) ────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='DispatchPackingSession' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[DispatchPackingSession] (
      [SessionId]       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [SessionNo]       NVARCHAR(30)     NOT NULL UNIQUE,
      [DispatchOrderId] UNIQUEIDENTIFIER NOT NULL,
      [PackerUserId]    NVARCHAR(100)    NULL,
      [PackerName]      NVARCHAR(200)    NULL,
      [CheckerUserId]   NVARCHAR(100)    NULL,
      [CheckerName]     NVARCHAR(200)    NULL,
      [Status]          NVARCHAR(20)     NOT NULL DEFAULT 'open',
      [CreatedAt]       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [FK_DispatchPackingSession_Order] FOREIGN KEY ([DispatchOrderId])
        REFERENCES [dbo].[DispatchOrder]([DispatchOrderId]) ON DELETE CASCADE
    )
  `);
  console.log('  [dbo].[DispatchPackingSession] OK');

  // ── [dbo].[DispatchBox] (a physical closed carton; QrToken is the QR payload) ─
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='DispatchBox' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[DispatchBox] (
      [BoxId]            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [BoxNo]            NVARCHAR(40)     NOT NULL UNIQUE,
      [QrToken]          NVARCHAR(64)     NOT NULL UNIQUE,
      [SessionId]        UNIQUEIDENTIFIER NULL,
      [DispatchOrderId]  UNIQUEIDENTIFIER NOT NULL,
      [VesselTypeId]     UNIQUEIDENTIFIER NULL,
      [VesselCode]       NVARCHAR(30)     NULL,
      [GrossWeight]      DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [Status]           NVARCHAR(20)     NOT NULL DEFAULT 'open',
      [CheckedByUserId]  NVARCHAR(100)    NULL,
      [CheckedByName]    NVARCHAR(200)    NULL,
      [CheckedAt]        DATETIME2        NULL,
      [ClosedByUserId]   NVARCHAR(100)    NULL,
      [ClosedByName]     NVARCHAR(200)    NULL,
      [ClosedAt]         DATETIME2        NULL,
      [LoadingSessionId] UNIQUEIDENTIFIER NULL,
      [LoadedAt]         DATETIME2        NULL,
      [CreatedAt]        DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]        DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [FK_DispatchBox_Order] FOREIGN KEY ([DispatchOrderId])
        REFERENCES [dbo].[DispatchOrder]([DispatchOrderId]) ON DELETE CASCADE
    )
  `);
  console.log('  [dbo].[DispatchBox] OK');

  // ── [dbo].[DispatchBoxLine] (items in a box — what the QR resolves to) ───────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='DispatchBoxLine' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[DispatchBoxLine] (
      [BoxLineId]   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [BoxId]       UNIQUEIDENTIFIER NOT NULL,
      [ItemNo]      NVARCHAR(30)     NULL,
      [Description] NVARCHAR(250)    NULL,
      [Qty]         DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [Weight]      DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [CreatedAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [FK_DispatchBoxLine_Box] FOREIGN KEY ([BoxId])
        REFERENCES [dbo].[DispatchBox]([BoxId]) ON DELETE CASCADE
    )
  `);
  console.log('  [dbo].[DispatchBoxLine] OK');

  // ── [dbo].[DispatchVehicle] (vehicle master) ────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='DispatchVehicle' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[DispatchVehicle] (
      [VehicleId]    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [Plate]        NVARCHAR(30)     NOT NULL UNIQUE,
      [Make]         NVARCHAR(100)    NULL,
      [LoadCapacity] DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [TareWeight]   DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [Status]       NVARCHAR(20)     NOT NULL DEFAULT 'active',
      [CreatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id=OBJECT_ID('[dbo].[DispatchVehicle]') AND name='TareWeight')
      ALTER TABLE [dbo].[DispatchVehicle] ADD [TareWeight] DECIMAL(18,4) NOT NULL DEFAULT 0
  `);
  console.log('  [dbo].[DispatchVehicle] OK');

  // ── [dbo].[DispatchLoadingSession] (vehicle + driver + route + ship date) ────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='DispatchLoadingSession' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[DispatchLoadingSession] (
      [LoadingSessionId] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [SessionNo]        NVARCHAR(30)     NOT NULL UNIQUE,
      [RouteCode]        NVARCHAR(40)     NULL,
      [VehicleId]        UNIQUEIDENTIFIER NULL,
      [VehiclePlate]     NVARCHAR(30)     NULL,
      [DriverName]       NVARCHAR(200)    NULL,
      [ShipmentDate]     DATE             NULL,
      [Status]           NVARCHAR(20)     NOT NULL DEFAULT 'open',
      [CreatedByUserId]  NVARCHAR(100)    NULL,
      [CreatedByName]    NVARCHAR(200)    NULL,
      [ClosedAt]         DATETIME2        NULL,
      [CreatedAt]        DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]        DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  console.log('  [dbo].[DispatchLoadingSession] OK');

  // ── [dbo].[DispatchLoadingLine] (boxes scanned onto a loading session) ───────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='DispatchLoadingLine' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[DispatchLoadingLine] (
      [LoadingLineId]    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [LoadingSessionId] UNIQUEIDENTIFIER NOT NULL,
      [BoxId]            UNIQUEIDENTIFIER NOT NULL,
      [BoxNo]            NVARCHAR(40)     NULL,
      [ScannedByUserId]  NVARCHAR(100)    NULL,
      [ScannedByName]    NVARCHAR(200)    NULL,
      [ScannedAt]        DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [FK_DispatchLoadingLine_Session] FOREIGN KEY ([LoadingSessionId])
        REFERENCES [dbo].[DispatchLoadingSession]([LoadingSessionId]) ON DELETE CASCADE,
      CONSTRAINT [UQ_DispatchLoadingLine] UNIQUE ([LoadingSessionId],[BoxId])
    )
  `);
  console.log('  [dbo].[DispatchLoadingLine] OK');

  // ── [dbo].[DispatchUserCompany] (per-user registry company permissions) ─────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='DispatchUserCompany' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[DispatchUserCompany] (
      [Id]        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [UserId]    NVARCHAR(100)    NOT NULL,
      [Company]   NVARCHAR(10)     NOT NULL,
      [CreatedAt] DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [UQ_DispatchUserCompany] UNIQUE ([UserId],[Company])
    )
  `);
  console.log('  [dbo].[DispatchUserCompany] OK');

  // ── [s].[SalesHeader] ─────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='SalesHeader' AND schema_id=SCHEMA_ID('${s}'))
    CREATE TABLE [${s}].[SalesHeader] (
      [Id]              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [OrderNo]         NVARCHAR(30)     NOT NULL UNIQUE,
      [CustomerNo]      NVARCHAR(30)     NOT NULL,
      [CustomerName]    NVARCHAR(200)    NOT NULL,
      [SalespersonCode] NVARCHAR(20)     NULL,
      [RouteCode]       NVARCHAR(20)     NULL,
      [SectorCode]      NVARCHAR(20)     NULL,
      [ShipmentDate]    DATE             NULL,
      [ShipToCode]      NVARCHAR(20)     NULL,
      [ShipToName]      NVARCHAR(200)    NULL,
      [PaymentTerms]    NVARCHAR(30)     NULL,
      [ExternalDocNo]   NVARCHAR(50)     NULL,
      [QuoteNo]         NVARCHAR(30)     NULL,
      [OrderDate]        DATE             NOT NULL,
      [PostingDate]      DATE             NULL,
      [PrintingDatetime] DATETIME2        NULL,
      [BCUserId]         NVARCHAR(100)    NULL,
      [Status]           NVARCHAR(20)     NOT NULL DEFAULT 'Open',
      [ConfirmedAt]      DATETIME2        NULL,
      [ConfirmedBy]      NVARCHAR(100)    NULL,
      [CreatedAt]        DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]        DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  // Upgrade guards for existing SalesHeader tables
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[${s}].[SalesHeader]') AND name='PrintingDatetime')
      ALTER TABLE [${s}].[SalesHeader] ADD [PrintingDatetime] DATETIME2 NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[${s}].[SalesHeader]') AND name='BCUserId')
      ALTER TABLE [${s}].[SalesHeader] ADD [BCUserId] NVARCHAR(100) NULL
  `);
  for (const [col, def] of [
    ['ShipmentDate', 'DATE          NULL'],
    ['ShipToCode',   'NVARCHAR(20)  NULL'],
    ['ShipToName',   'NVARCHAR(200) NULL'],
    ['PaymentTerms', 'NVARCHAR(30)  NULL'],
    ['ExternalDocNo','NVARCHAR(50)  NULL'],
    ['QuoteNo',      'NVARCHAR(30)  NULL'],
  ]) {
    await run(`
      IF NOT EXISTS (SELECT * FROM sys.columns
                     WHERE object_id=OBJECT_ID('[${s}].[SalesHeader]') AND name='${col}')
        ALTER TABLE [${s}].[SalesHeader] ADD [${col}] ${def}
    `);
  }
  console.log(`  [${s}].[SalesHeader] OK`);

  // ── [s].[SalesLine] ───────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='SalesLine' AND schema_id=SCHEMA_ID('${s}'))
    CREATE TABLE [${s}].[SalesLine] (
      [Id]             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [OrderNo]        NVARCHAR(30)     NOT NULL,
      [LineNo]         INT              NOT NULL,
      [ItemNo]         NVARCHAR(30)     NOT NULL,
      [Description]    NVARCHAR(200)    NOT NULL,
      [Quantity]       DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [QuantityBase]   DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [UnitPrice]      DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [LineAmount]     DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [AmountInclVat]  DECIMAL(18,4)    NULL,
      [VatPct]         DECIMAL(18,4)    NULL,
      [QtyAssigned]    DECIMAL(18,4)    NULL,
      [QtyExecuted]    DECIMAL(18,4)    NULL,
      [CustomerSpec]   NVARCHAR(200)    NULL,
      [Barcode]        NVARCHAR(100)    NULL,
      [UnitOfMeasure]  NVARCHAR(20)     NULL,
      [PostingGroup]   NVARCHAR(50)     NULL,
      [CreatedAt]      DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]      DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name='FK_SalesLine_${s}')
      ALTER TABLE [${s}].[SalesLine]
        ADD CONSTRAINT [FK_SalesLine_${s}]
        FOREIGN KEY ([OrderNo]) REFERENCES [${s}].[SalesHeader]([OrderNo])
  `);
  for (const [col, def] of [
    ['PostingGroup',  'NVARCHAR(50)  NULL'],
    ['AmountInclVat', 'DECIMAL(18,4) NULL'],
    ['VatPct',        'DECIMAL(18,4) NULL'],
    ['QtyAssigned',   'DECIMAL(18,4) NULL'],
    ['QtyExecuted',   'DECIMAL(18,4) NULL'],
    ['CustomerSpec',  'NVARCHAR(200) NULL'],
    ['Barcode',       'NVARCHAR(100) NULL'],
    ['UpdatedAt',     'DATETIME2     NOT NULL DEFAULT GETUTCDATE()'],
    ['Part',          'NVARCHAR(50)  NULL'],
  ]) {
    await run(`
      IF NOT EXISTS (SELECT * FROM sys.columns
                     WHERE object_id=OBJECT_ID('[${s}].[SalesLine]') AND name='${col}')
        ALTER TABLE [${s}].[SalesLine] ADD [${col}] ${def}
    `);
  }
  await run(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SalesLine_OrderNo_Part'
                   AND object_id=OBJECT_ID('[${s}].[SalesLine]'))
      CREATE INDEX [IX_SalesLine_OrderNo_Part] ON [${s}].[SalesLine]([OrderNo],[Part])
  `);
  console.log(`  [${s}].[SalesLine] OK`);

  // ── [s].[OrderPartConfirmation] ───────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='OrderPartConfirmation' AND schema_id=SCHEMA_ID('${s}'))
    CREATE TABLE [${s}].[OrderPartConfirmation] (
      [OrderNo]         NVARCHAR(30) NOT NULL,
      [Part]            NVARCHAR(50) NOT NULL,
      [ConfirmedAt]     DATETIME2    NOT NULL DEFAULT GETUTCDATE(),
      [ConfirmedBy]     NVARCHAR(100) NOT NULL,
      [ConfirmedByName] NVARCHAR(200) NULL,
      [Notes]           NVARCHAR(500) NULL,
      CONSTRAINT [PK_OrderPartConfirmation_${s}] PRIMARY KEY ([OrderNo],[Part])
    )
  `);
  console.log(`  [${s}].[OrderPartConfirmation] OK`);

  // ── [s].[InvoiceHeader] ───────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='InvoiceHeader' AND schema_id=SCHEMA_ID('${s}'))
    CREATE TABLE [${s}].[InvoiceHeader] (
      [Id]              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [InvoiceNo]       NVARCHAR(30)     NOT NULL UNIQUE,
      [OriginalOrderNo] NVARCHAR(30)     NOT NULL,
      [CustomerNo]      NVARCHAR(30)     NOT NULL,
      [CustomerName]    NVARCHAR(200)    NOT NULL,
      [CustomerPin]     NVARCHAR(50)     NULL,
      [SalespersonCode] NVARCHAR(20)     NULL,
      [SalespersonName] NVARCHAR(200)    NULL,
      [RouteCode]       NVARCHAR(20)     NULL,
      [SectorCode]      NVARCHAR(20)     NULL,
      [ShipToName]      NVARCHAR(200)    NULL,
      [ShipmentMethod]  NVARCHAR(30)     NULL,
      [PaymentTerms]    NVARCHAR(30)     NULL,
      [ExternalDocNo]   NVARCHAR(50)     NULL,
      [CompanyName]     NVARCHAR(200)    NULL,
      [CompanyPin]      NVARCHAR(50)     NULL,
      [CompanyEmail]    NVARCHAR(200)    NULL,
      [CompanyVatReg]   NVARCHAR(50)     NULL,
      [OrderDate]       DATE             NOT NULL,
      [PostingDate]     DATE             NULL,
      [InvoicedAt]       DATETIME2        NOT NULL,
      [PrintingDatetime] DATETIME2        NULL,
      [BCUserId]         NVARCHAR(100)    NULL,
      [NoPrinted]        INT              NULL,
      [ETIMSInvoiceNo]   NVARCHAR(60)     NULL,
      [ETIMSData]        NVARCHAR(MAX)    NULL,
      [QRCodeUrl]        NVARCHAR(500)    NULL,
      [Status]           NVARCHAR(20)     NOT NULL DEFAULT 'Invoiced',
      [ConfirmedAt]      DATETIME2        NULL,
      [ConfirmedBy]      NVARCHAR(100)    NULL,
      [CreatedAt]        DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]        DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  // Upgrade guards for existing InvoiceHeader tables
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[${s}].[InvoiceHeader]') AND name='QRCodeUrl')
      ALTER TABLE [${s}].[InvoiceHeader] ADD [QRCodeUrl] NVARCHAR(500) NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[${s}].[InvoiceHeader]') AND name='PrintingDatetime')
      ALTER TABLE [${s}].[InvoiceHeader] ADD [PrintingDatetime] DATETIME2 NULL
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.columns
                   WHERE object_id=OBJECT_ID('[${s}].[InvoiceHeader]') AND name='BCUserId')
      ALTER TABLE [${s}].[InvoiceHeader] ADD [BCUserId] NVARCHAR(100) NULL
  `);
  for (const [col, def] of [
    ['CustomerPin',    'NVARCHAR(50)  NULL'],
    ['SalespersonName','NVARCHAR(200) NULL'],
    ['ShipToName',     'NVARCHAR(200) NULL'],
    ['ShipmentMethod', 'NVARCHAR(30)  NULL'],
    ['PaymentTerms',   'NVARCHAR(30)  NULL'],
    ['ExternalDocNo',  'NVARCHAR(50)  NULL'],
    ['CompanyName',    'NVARCHAR(200) NULL'],
    ['CompanyPin',     'NVARCHAR(50)  NULL'],
    ['CompanyEmail',   'NVARCHAR(200) NULL'],
    ['CompanyVatReg',  'NVARCHAR(50)  NULL'],
    ['NoPrinted',      'INT           NULL'],
    ['Barcode',        'NVARCHAR(60)  NULL'],
  ]) {
    await run(`
      IF NOT EXISTS (SELECT * FROM sys.columns
                     WHERE object_id=OBJECT_ID('[${s}].[InvoiceHeader]') AND name='${col}')
        ALTER TABLE [${s}].[InvoiceHeader] ADD [${col}] ${def}
    `);
  }
  console.log(`  [${s}].[InvoiceHeader] OK`);

  // ── [s].[InvoiceLine] ─────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='InvoiceLine' AND schema_id=SCHEMA_ID('${s}'))
    CREATE TABLE [${s}].[InvoiceLine] (
      [Id]                UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [InvoiceNo]         NVARCHAR(30)     NOT NULL,
      [LineNo]            INT              NOT NULL,
      [ItemNo]            NVARCHAR(30)     NOT NULL,
      [Description]       NVARCHAR(200)    NOT NULL,
      [Quantity]          DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [QuantityBase]      DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [UnitPrice]         DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [LineAmount]        DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [LineAmountInclVat] DECIMAL(18,4)    NULL,
      [VatPct]            DECIMAL(18,4)    NULL,
      [VatIdentifier]     NVARCHAR(50)     NULL,
      [UnitsPerParcel]    DECIMAL(18,4)    NULL,
      [UnitOfMeasure]     NVARCHAR(20)     NULL,
      [PostingGroup]      NVARCHAR(50)     NULL,
      [CreatedAt]         DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]         DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  for (const [col, def] of [
    ['PostingGroup',      'NVARCHAR(50)  NULL'],
    ['LineAmountInclVat', 'DECIMAL(18,4) NULL'],
    ['VatPct',            'DECIMAL(18,4) NULL'],
    ['VatIdentifier',     'NVARCHAR(50)  NULL'],
    ['UnitsPerParcel',    'DECIMAL(18,4) NULL'],
    ['CreatedAt',         'DATETIME2     NOT NULL DEFAULT GETUTCDATE()'],
    ['UpdatedAt',         'DATETIME2     NOT NULL DEFAULT GETUTCDATE()'],
  ]) {
    await run(`
      IF NOT EXISTS (SELECT * FROM sys.columns
                     WHERE object_id=OBJECT_ID('[${s}].[InvoiceLine]') AND name='${col}')
        ALTER TABLE [${s}].[InvoiceLine] ADD [${col}] ${def}
    `);
  }
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name='FK_InvoiceLine_${s}')
      ALTER TABLE [${s}].[InvoiceLine]
        ADD CONSTRAINT [FK_InvoiceLine_${s}]
        FOREIGN KEY ([InvoiceNo]) REFERENCES [${s}].[InvoiceHeader]([InvoiceNo])
  `);
  console.log(`  [${s}].[InvoiceLine] OK`);

  // ── [s].[AuditLog] ────────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='AuditLog' AND schema_id=SCHEMA_ID('${s}'))
    CREATE TABLE [${s}].[AuditLog] (
      [Id]           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [EventType]    NVARCHAR(30)     NOT NULL,
      [DocumentNo]   NVARCHAR(30)     NOT NULL,
      [DocumentType] NVARCHAR(20)     NOT NULL,
      [UserId]       NVARCHAR(100)    NULL,
      [UserName]     NVARCHAR(200)    NULL,
      [Metadata]     NVARCHAR(MAX)    NULL,
      [OccurredAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [CreatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  for (const col of ['CreatedAt', 'UpdatedAt']) {
    await run(`
      IF NOT EXISTS (SELECT * FROM sys.columns
                     WHERE object_id=OBJECT_ID('[${s}].[AuditLog]') AND name='${col}')
        ALTER TABLE [${s}].[AuditLog] ADD [${col}] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    `);
  }
  console.log(`  [${s}].[AuditLog] OK`);

  console.log(`\n  ✓ [${s}] migration complete.`);
}

async function down(companyId) {
  const s = companyId.replace(/[^a-zA-Z0-9_]/g, '');
  console.log(`\nDropping schema: [${s}]`);

  await db.connect();
  const pool = await db.getPool();

  const schemaExists = await pool.request().query(
    `SELECT 1 FROM sys.schemas WHERE name = '${s}'`
  );
  if (!schemaExists.recordset.length) {
    console.log(`  [${s}] schema does not exist — skipping.`);
    return;
  }

  // Drop FK constraints first, then tables in reverse dependency order
  await pool.request().query(`
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name='FK_InvoiceLine_${s}')
      ALTER TABLE [${s}].[InvoiceLine] DROP CONSTRAINT [FK_InvoiceLine_${s}]
  `);
  await pool.request().query(`
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name='FK_SalesLine_${s}')
      ALTER TABLE [${s}].[SalesLine] DROP CONSTRAINT [FK_SalesLine_${s}]
  `);

  const tables = ['AuditLog', 'InvoiceLine', 'InvoiceHeader', 'SalesLine', 'SalesHeader'];
  for (const t of tables) {
    await pool.request().query(`
      IF EXISTS (SELECT * FROM sys.tables WHERE name='${t}' AND schema_id=SCHEMA_ID('${s}'))
        DROP TABLE [${s}].[${t}]
    `);
    console.log(`  [${s}].[${t}] dropped`);
  }

  await pool.request().query(`DROP SCHEMA [${s}]`);
  console.log(`  [${s}] schema dropped`);

  // Remove from dbo.Companies if present
  await pool.request().query(
    `DELETE FROM [dbo].[Companies] WHERE CompanyId = '${s}'`
  );

  console.log(`\n  ✓ [${s}] teardown complete.`);
}

(async () => {
  try {
    if (isDown) {
      const targets = companies.length ? companies : await getMigratedSchemas();
      if (!targets.length) { console.log('No migrated schemas found.'); return; }
      for (const c of targets) await down(c);
      console.log('\nAll schemas dropped.');
    } else {
      for (const c of companies) await migrate(c);
      console.log('\nAll migrations complete.');
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await db.close();
    process.exit(0);
  }
})();
