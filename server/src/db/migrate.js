/**
 * db/migrate.js
 * Run once per company to create all required tables.
 * Usage: node src/db/migrate.js COMPANY_001
 *        node src/db/migrate.js COMPANY_001 COMPANY_002
 */
import { db, sql } from './pool.js';
import dotenv from 'dotenv';
dotenv.config();

const companies = process.argv.slice(2);
if (!companies.length) {
  console.error('Usage: node migrate.js COMPANY_001 [COMPANY_002 ...]');
  process.exit(1);
}

async function migrate(companyId) {
  const schema = companyId.replace(/[^a-zA-Z0-9_]/g, '');
  console.log(`\nMigrating schema: [${schema}]`);
  const pool = await db.connect();
  const req = pool.request();

  await req.query(`IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '${schema}')
    EXEC('CREATE SCHEMA [${schema}]')`);

  const tables = `
  -- Companies registry (lives in [dbo] – shared)
  IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='Companies' AND schema_id=SCHEMA_ID('dbo'))
  CREATE TABLE [dbo].[Companies] (
    CompanyId   NVARCHAR(60)  NOT NULL PRIMARY KEY,
    CompanyName NVARCHAR(200) NOT NULL,
    IsActive    BIT           NOT NULL DEFAULT 1,
    CreatedAt   DATETIME2     NOT NULL DEFAULT GETUTCDATE()
  );

  -- Users table (lives in [dbo] – shared across all companies)
  IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='Users' AND schema_id=SCHEMA_ID('dbo'))
  CREATE TABLE [dbo].[Users] (
    UserId       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    Username     NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(200) NOT NULL DEFAULT '',
    DisplayName  NVARCHAR(200) NOT NULL,
    Email        NVARCHAR(200) NULL,
    Role         NVARCHAR(20)  NOT NULL DEFAULT 'user',        -- user | admin
    AuthProvider NVARCHAR(20)  NOT NULL DEFAULT 'local',       -- local | AD
    IsActive     BIT           NOT NULL DEFAULT 1,
    CreatedAt    DATETIME2     NOT NULL DEFAULT GETUTCDATE()
  );

  -- Add columns to Users if upgrading from a previous version
  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id=OBJECT_ID('[dbo].[Users]') AND name='Email')
    ALTER TABLE [dbo].[Users] ADD Email NVARCHAR(200) NULL;
  IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id=OBJECT_ID('[dbo].[Users]') AND name='AuthProvider')
    ALTER TABLE [dbo].[Users] ADD AuthProvider NVARCHAR(20) NOT NULL DEFAULT 'local';

  -- Sales Header (orders received from BC)
  IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='SalesHeader' AND schema_id=SCHEMA_ID('${schema}'))
  CREATE TABLE [${schema}].[SalesHeader] (
    Id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    OrderNo       NVARCHAR(30)  NOT NULL UNIQUE,
    CustomerNo    NVARCHAR(30)  NOT NULL,
    CustomerName  NVARCHAR(200) NOT NULL,
    SalespersonCode NVARCHAR(20) NULL,
    RouteCode     NVARCHAR(20)  NULL,
    SectorCode    NVARCHAR(20)  NULL,
    OrderDate     DATE          NOT NULL,
    PostingDate   DATE          NULL,
    Status        NVARCHAR(20)  NOT NULL DEFAULT 'Open',  -- Open | Confirmed
    ConfirmedAt   DATETIME2     NULL,
    ConfirmedBy   NVARCHAR(100) NULL,
    CreatedAt     DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt     DATETIME2     NOT NULL DEFAULT GETUTCDATE()
  );

  -- Sales Lines
  IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='SalesLine' AND schema_id=SCHEMA_ID('${schema}'))
  CREATE TABLE [${schema}].[SalesLine] (
    Id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    OrderNo       NVARCHAR(30)  NOT NULL,
    LineNo        INT           NOT NULL,
    ItemNo        NVARCHAR(30)  NOT NULL,
    Description   NVARCHAR(200) NOT NULL,
    Quantity      DECIMAL(18,4) NOT NULL DEFAULT 0,
    QuantityBase  DECIMAL(18,4) NOT NULL DEFAULT 0,
    UnitPrice     DECIMAL(18,4) NOT NULL DEFAULT 0,
    LineAmount    DECIMAL(18,4) NOT NULL DEFAULT 0,
    UnitOfMeasure NVARCHAR(20)  NULL,
    CreatedAt     DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_SalesLine_Header FOREIGN KEY (OrderNo) REFERENCES [${schema}].[SalesHeader](OrderNo)
  );

  -- Invoice Header (moved from Orders when invoiced)
  IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='InvoiceHeader' AND schema_id=SCHEMA_ID('${schema}'))
  CREATE TABLE [${schema}].[InvoiceHeader] (
    Id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    InvoiceNo       NVARCHAR(30)  NOT NULL UNIQUE,
    OriginalOrderNo NVARCHAR(30)  NOT NULL,
    CustomerNo      NVARCHAR(30)  NOT NULL,
    CustomerName    NVARCHAR(200) NOT NULL,
    SalespersonCode NVARCHAR(20)  NULL,
    RouteCode       NVARCHAR(20)  NULL,
    SectorCode      NVARCHAR(20)  NULL,
    OrderDate       DATE          NOT NULL,
    PostingDate     DATE          NULL,
    InvoicedAt      DATETIME2     NOT NULL,
    ETIMSInvoiceNo  NVARCHAR(60)  NULL,
    ETIMSData       NVARCHAR(MAX) NULL,  -- JSON blob
    Status          NVARCHAR(20)  NOT NULL DEFAULT 'Invoiced', -- Invoiced | Confirmed
    ConfirmedAt     DATETIME2     NULL,
    ConfirmedBy     NVARCHAR(100) NULL,
    CreatedAt       DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt       DATETIME2     NOT NULL DEFAULT GETUTCDATE()
  );

  -- Invoice Lines
  IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='InvoiceLine' AND schema_id=SCHEMA_ID('${schema}'))
  CREATE TABLE [${schema}].[InvoiceLine] (
    Id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    InvoiceNo     NVARCHAR(30)  NOT NULL,
    LineNo        INT           NOT NULL,
    ItemNo        NVARCHAR(30)  NOT NULL,
    Description   NVARCHAR(200) NOT NULL,
    Quantity      DECIMAL(18,4) NOT NULL DEFAULT 0,
    QuantityBase  DECIMAL(18,4) NOT NULL DEFAULT 0,
    UnitPrice     DECIMAL(18,4) NOT NULL DEFAULT 0,
    LineAmount    DECIMAL(18,4) NOT NULL DEFAULT 0,
    UnitOfMeasure NVARCHAR(20)  NULL,
    CONSTRAINT FK_InvoiceLine_Header FOREIGN KEY (InvoiceNo) REFERENCES [${schema}].[InvoiceHeader](InvoiceNo)
  );

  -- Audit Log (confirmations + duplicate scan events)
  IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='AuditLog' AND schema_id=SCHEMA_ID('${schema}'))
  CREATE TABLE [${schema}].[AuditLog] (
    Id          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    EventType   NVARCHAR(30)  NOT NULL, -- OrderConfirmed | OrderCopy | InvoiceConfirmed | InvoiceCopy | InvoiceReceived | OrderReceived
    DocumentNo  NVARCHAR(30)  NOT NULL,
    DocumentType NVARCHAR(20) NOT NULL, -- Order | Invoice
    UserId      NVARCHAR(100) NULL,
    UserName    NVARCHAR(200) NULL,
    Metadata    NVARCHAR(MAX) NULL,  -- JSON
    OccurredAt  DATETIME2     NOT NULL DEFAULT GETUTCDATE()
  );
  `;

  await req.query(tables);
  console.log(`  [${schema}] tables ready.`);
}

(async () => {
  try {
    for (const c of companies) await migrate(c);
    console.log('\nMigration complete.');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await db.close();
    process.exit(0);
  }
})();
