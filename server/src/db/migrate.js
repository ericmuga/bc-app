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
      [CreatedAt]   DATETIME2     NOT NULL DEFAULT GETUTCDATE()
    )
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
      [CreatedAt]    DATETIME2        NOT NULL DEFAULT GETUTCDATE()
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
  console.log(`  [${s}].[SalesHeader] OK`);

  // ── [s].[SalesLine] ───────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='SalesLine' AND schema_id=SCHEMA_ID('${s}'))
    CREATE TABLE [${s}].[SalesLine] (
      [Id]            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [OrderNo]       NVARCHAR(30)     NOT NULL,
      [LineNo]        INT              NOT NULL,
      [ItemNo]        NVARCHAR(30)     NOT NULL,
      [Description]   NVARCHAR(200)    NOT NULL,
      [Quantity]      DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [QuantityBase]  DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [UnitPrice]     DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [LineAmount]    DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [UnitOfMeasure] NVARCHAR(20)     NULL,
      [CreatedAt]     DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name='FK_SalesLine_${s}')
      ALTER TABLE [${s}].[SalesLine]
        ADD CONSTRAINT [FK_SalesLine_${s}]
        FOREIGN KEY ([OrderNo]) REFERENCES [${s}].[SalesHeader]([OrderNo])
  `);
  console.log(`  [${s}].[SalesLine] OK`);

  // ── [s].[InvoiceHeader] ───────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='InvoiceHeader' AND schema_id=SCHEMA_ID('${s}'))
    CREATE TABLE [${s}].[InvoiceHeader] (
      [Id]              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [InvoiceNo]       NVARCHAR(30)     NOT NULL UNIQUE,
      [OriginalOrderNo] NVARCHAR(30)     NOT NULL,
      [CustomerNo]      NVARCHAR(30)     NOT NULL,
      [CustomerName]    NVARCHAR(200)    NOT NULL,
      [SalespersonCode] NVARCHAR(20)     NULL,
      [RouteCode]       NVARCHAR(20)     NULL,
      [SectorCode]      NVARCHAR(20)     NULL,
      [OrderDate]       DATE             NOT NULL,
      [PostingDate]     DATE             NULL,
      [InvoicedAt]       DATETIME2        NOT NULL,
      [PrintingDatetime] DATETIME2        NULL,
      [BCUserId]         NVARCHAR(100)    NULL,
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
  console.log(`  [${s}].[InvoiceHeader] OK`);

  // ── [s].[InvoiceLine] ─────────────────────────────────────────────────────
  await run(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='InvoiceLine' AND schema_id=SCHEMA_ID('${s}'))
    CREATE TABLE [${s}].[InvoiceLine] (
      [Id]            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [InvoiceNo]     NVARCHAR(30)     NOT NULL,
      [LineNo]        INT              NOT NULL,
      [ItemNo]        NVARCHAR(30)     NOT NULL,
      [Description]   NVARCHAR(200)    NOT NULL,
      [Quantity]      DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [QuantityBase]  DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [UnitPrice]     DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [LineAmount]    DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [UnitOfMeasure] NVARCHAR(20)     NULL
    )
  `);
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
      [OccurredAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
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