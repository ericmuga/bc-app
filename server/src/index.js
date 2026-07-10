/**
 * server/src/index.js
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { db } from './db/pool.js';
import routes from './routes/index.js';
import logger from './services/logger.js';
import swaggerSpec from './docs/swagger.js';
import { startReportScheduler } from './services/reportScheduler.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security & parsing ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '5mb' }));

// Static uploads (item photos, etc.) — mounted under /api so it rides the dev
// proxy + same prod origin, and BEFORE the rate limiter so image-heavy pages
// aren't throttled.
const uploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads');
app.use('/api/uploads', express.static(uploadsDir));

// Rate limit public-facing routes
app.use('/api', rateLimit({ windowMs: 60_000, max: 200 }));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Swagger UI ───────────────────────────────────────────────────────────────
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'BC Sales Console API',
}));

// Webhook-secret length probe — non-revealing, lets BC ops confirm both sides match.
// Returns {configured, length, sample} where `sample` is just the first 2 chars.
app.get('/health/webhook-secret', (_req, res) => {
  const s = String(process.env.BC_WEBHOOK_SECRET || '').trim();
  res.json({
    configured: !!s,
    length:     s.length,
    sample:     s ? s.slice(0, 2) + '…' : null,
  });
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    const pool = await db.getPool();
    await pool.request().query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ── Error handler ────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────────────────────
async function ensurePosItemColumns() {
  // Idempotent guard so we don't crash on deployments that haven't run migrate.js yet
  // for newly-added columns or the AuditLog table.
  try {
    const pool = await db.getPool();

    // PosTarget — daily per-shop per-item sales targets
    {
      const { ensureTargetTable } = await import('./models/PosTargetModel.js');
      await ensureTargetTable(pool);
    }
    // PosCoupon + ledger
    {
      const { ensureCouponTables } = await import('./models/PosCouponModel.js');
      await ensureCouponTables(pool);
    }
    // PosUserShop — many-to-many user ↔ shop assignment (one cashier can serve
    // multiple shops, especially when those shops span BC companies).
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosUserShop' AND schema_id=SCHEMA_ID('dbo'))
      CREATE TABLE [dbo].[PosUserShop] (
        [UserId]    UNIQUEIDENTIFIER NOT NULL,
        [ShopCode]  NVARCHAR(50)     NOT NULL,
        [IsPrimary] BIT              NOT NULL DEFAULT 0,
        [CreatedAt] DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT [PK_PosUserShop] PRIMARY KEY ([UserId],[ShopCode])
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes
                     WHERE name='IX_PosUserShop_Shop'
                       AND object_id=OBJECT_ID('[dbo].[PosUserShop]'))
        CREATE INDEX [IX_PosUserShop_Shop] ON [dbo].[PosUserShop]([ShopCode])
    `);

    // 1. AuditLog table (centralised audit trail for every POS mutation)
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='AuditLog' AND schema_id=SCHEMA_ID('dbo'))
      CREATE TABLE [dbo].[AuditLog] (
        [AuditId]    BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [UserId]     UNIQUEIDENTIFIER NULL,
        [UserName]   NVARCHAR(200)    NULL,
        [Role]       NVARCHAR(50)     NULL,
        [Action]     NVARCHAR(50)     NULL,
        [Method]     NVARCHAR(10)     NULL,
        [Path]       NVARCHAR(500)    NULL,
        [EntityType] NVARCHAR(80)     NULL,
        [EntityId]   NVARCHAR(80)     NULL,
        [Status]     INT              NULL,
        [Ip]         NVARCHAR(60)     NULL,
        [Payload]    NVARCHAR(MAX)    NULL,
        [OccurredAt] DATETIME2        NOT NULL DEFAULT GETUTCDATE()
      )
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_AuditLog_OccurredAt'
                     AND object_id=OBJECT_ID('[dbo].[AuditLog]'))
        CREATE INDEX [IX_AuditLog_OccurredAt] ON [dbo].[AuditLog]([OccurredAt] DESC)
    `);
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_AuditLog_UserId_OccurredAt'
                     AND object_id=OBJECT_ID('[dbo].[AuditLog]'))
        CREATE INDEX [IX_AuditLog_UserId_OccurredAt] ON [dbo].[AuditLog]([UserId],[OccurredAt] DESC)
    `);

    // 2. Single-column adds (idempotent)
    const adds = [
      // PosItem
      ['PosItem', 'VatPercent',         'DECIMAL(8,4) NOT NULL DEFAULT 0'],
      ['PosItem', 'ProductionCategory', 'NVARCHAR(50)  NULL'],
      ['PosItem', 'PackagingUnit',      'NVARCHAR(20)  NULL'],
      ['PosItem', 'QuantityUnit',       'NVARCHAR(20)  NULL'],
      ['PosItem', 'IsByproduct',        'BIT NOT NULL DEFAULT 0'],
      // PosPaymentType — STK / payment integration fields
      ['PosPaymentType', 'ConsumerKey',      'NVARCHAR(200) NULL'],
      ['PosPaymentType', 'ConsumerSecret',   'NVARCHAR(500) NULL'],
      ['PosPaymentType', 'ShortCode',        'NVARCHAR(20)  NULL'],
      ['PosPaymentType', 'Passkey',          'NVARCHAR(500) NULL'],
      ['PosPaymentType', 'TransactionType',  'NVARCHAR(50)  NULL'],
      ['PosPaymentType', 'CallbackUrl',      'NVARCHAR(500) NULL'],
      ['PosPaymentType', 'AccountReference', 'NVARCHAR(50)  NULL'],
      ['PosPaymentType', 'PaymentFetchUrl',  'NVARCHAR(500) NULL'],
      ['PosPaymentType', 'ApiKey',           'NVARCHAR(500) NULL'],
      // Users — POS shop assignment
      ['Users', 'ShopCode', 'NVARCHAR(50) NULL'],
      // PosShop — additional fields imported from BC Customer table
      ['PosShop', 'VatBusPostingGroup', 'NVARCHAR(50)  NULL'],
      ['PosShop', 'Email',              'NVARCHAR(200) NULL'],
      // Per-company customer numbers (one outlet may exist in multiple BC companies)
      ['PosShop', 'FclCustomerNo',      'NVARCHAR(20)  NULL'],
      ['PosShop', 'CmCustomerNo',       'NVARCHAR(20)  NULL'],
      ['PosShop', 'RmkCustomerNo',      'NVARCHAR(20)  NULL'],
      ['PosShop', 'FlmCustomerNo',      'NVARCHAR(20)  NULL'],
      ['PosShop', 'TillNo',             'NVARCHAR(30)  NULL'],
      // PosItem — track the BC company an item was synced from
      ['PosItem', 'SourceCompany',      'NVARCHAR(20)  NULL'],
      // Denormalized document numbers on line tables — header and lines share the same DocNo
      ['PosStockRequestLine',       'RequestNo',     'NVARCHAR(30) NULL'],
      ['PosThirdPartyTransferLine', 'TransferNo',    'NVARCHAR(30) NULL'],
      ['PosPortioningLine',         'PortioningNo',  'NVARCHAR(30) NULL'],
      ['PosOrderLine',              'OrderNo',       'NVARCHAR(30) NULL'],
      // Abandoned-cart "park" label on POS orders
      ['PosOrder', 'Label', 'NVARCHAR(80) NULL'],
      // Stock take approval workflow
      ['PosStockTake', 'ApprovedAt',  'DATETIME2     NULL'],
      ['PosStockTake', 'ApprovedBy',  'NVARCHAR(200) NULL'],
      ['PosStockTake', 'SubmittedAt', 'DATETIME2     NULL'],
      ['PosStockTake', 'SubmittedBy', 'NVARCHAR(200) NULL'],
      // Stock request receive-time per-line comments (mismatches)
      ['PosStockRequestLine', 'Comments', 'NVARCHAR(500) NULL'],
      // Stock request receive-time Return Form (RF) number for returned items
      ['PosStockRequestLine', 'RfNo', 'NVARCHAR(40) NULL'],
    ];
    for (const [tbl, col, def] of adds) {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.columns
                       WHERE object_id=OBJECT_ID('[dbo].[${tbl}]') AND name='${col}')
          ALTER TABLE [dbo].[${tbl}] ADD [${col}] ${def}
      `);
    }

    // 2a. Per-company InvoiceHeader: add Barcode column to every company schema (idempotent)
    try {
      const schemas = await pool.request().query(`
        SELECT s.name FROM sys.schemas s
        JOIN sys.tables t ON t.schema_id = s.schema_id AND t.name = 'InvoiceHeader'
        WHERE s.name NOT IN ('dbo','guest','INFORMATION_SCHEMA','sys')
      `);
      for (const { name: s } of schemas.recordset) {
        const safe = s.replace(/[^a-zA-Z0-9_]/g, '');
        await pool.request().query(`
          IF NOT EXISTS (SELECT * FROM sys.columns
                         WHERE object_id=OBJECT_ID('[${safe}].[InvoiceHeader]') AND name='Barcode')
            ALTER TABLE [${safe}].[InvoiceHeader] ADD [Barcode] NVARCHAR(60) NULL
        `);
      }
    } catch (e) {
      logger.warn('InvoiceHeader.Barcode add failed', { error: e.message });
    }

    // 2.5. Drop the legacy single-column UNIQUE on PosPaymentType.Code so the
    //      composite (Code, ShopCode) key (added later) actually takes effect.
    //      Each shop can now have its own CASH/MPESA/etc.
    try {
      await pool.request().query(`
        DECLARE @cn sysname;
        SELECT TOP 1 @cn = kc.name
        FROM   sys.key_constraints kc
        JOIN   sys.tables t ON t.object_id = kc.parent_object_id
        WHERE  t.name = 'PosPaymentType' AND kc.[type] = 'UQ'
          AND  EXISTS (
                 SELECT 1 FROM sys.index_columns ic
                 JOIN   sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
                 WHERE  ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
                   AND  c.name = 'Code'
               )
          AND  (SELECT COUNT(*) FROM sys.index_columns ic
                WHERE ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id) = 1;
        IF @cn IS NOT NULL
          EXEC ('ALTER TABLE [dbo].[PosPaymentType] DROP CONSTRAINT [' + @cn + ']');
      `);
      // Make sure the composite UNIQUE exists. SQL Server treats two NULLs as equal
      // in a unique index, so use a filtered index for the global (NULL ShopCode) rows.
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.key_constraints
                       WHERE name='UQ_PosPaymentType_Code_Shop'
                         AND parent_object_id = OBJECT_ID('[dbo].[PosPaymentType]'))
        BEGIN
          IF NOT EXISTS (SELECT * FROM sys.indexes
                         WHERE name='UX_PosPaymentType_Code_Shop'
                           AND object_id = OBJECT_ID('[dbo].[PosPaymentType]'))
            CREATE UNIQUE INDEX [UX_PosPaymentType_Code_Shop]
              ON [dbo].[PosPaymentType]([Code], [ShopCode])
              WHERE [ShopCode] IS NOT NULL;
        END;
        IF NOT EXISTS (SELECT * FROM sys.indexes
                       WHERE name='UX_PosPaymentType_Code_Global'
                         AND object_id = OBJECT_ID('[dbo].[PosPaymentType]'))
          CREATE UNIQUE INDEX [UX_PosPaymentType_Code_Global]
            ON [dbo].[PosPaymentType]([Code])
            WHERE [ShopCode] IS NULL;
      `);
    } catch (e) {
      logger.warn('PosPaymentType unique-key fix failed', { error: e.message });
    }

    // 2b. Per-company SalesLine.Part + OrderPartConfirmation table (idempotent)
    try {
      const schemas = await pool.request().query(`
        SELECT s.name FROM sys.schemas s
        JOIN sys.tables t ON t.schema_id = s.schema_id AND t.name = 'SalesLine'
        WHERE s.name NOT IN ('dbo','guest','INFORMATION_SCHEMA','sys')
      `);
      for (const { name: s } of schemas.recordset) {
        const safe = s.replace(/[^a-zA-Z0-9_]/g, '');
        await pool.request().query(`
          IF NOT EXISTS (SELECT * FROM sys.columns
                         WHERE object_id=OBJECT_ID('[${safe}].[SalesLine]') AND name='Part')
            ALTER TABLE [${safe}].[SalesLine] ADD [Part] NVARCHAR(50) NULL
        `);
        await pool.request().query(`
          IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_SalesLine_OrderNo_Part'
                         AND object_id=OBJECT_ID('[${safe}].[SalesLine]'))
            CREATE INDEX [IX_SalesLine_OrderNo_Part] ON [${safe}].[SalesLine]([OrderNo],[Part])
        `);
        await pool.request().query(`
          IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='OrderPartConfirmation' AND schema_id=SCHEMA_ID('${safe}'))
          CREATE TABLE [${safe}].[OrderPartConfirmation] (
            [OrderNo]         NVARCHAR(30) NOT NULL,
            [Part]            NVARCHAR(50) NOT NULL,
            [ConfirmedAt]     DATETIME2    NOT NULL DEFAULT GETUTCDATE(),
            [ConfirmedBy]     NVARCHAR(100) NOT NULL,
            [ConfirmedByName] NVARCHAR(200) NULL,
            [Notes]           NVARCHAR(500) NULL,
            CONSTRAINT [PK_OrderPartConfirmation_${safe}] PRIMARY KEY ([OrderNo],[Part])
          )
        `);
      }
    } catch (e) {
      logger.warn('SalesLine.Part / OrderPartConfirmation add failed', { error: e.message });
    }

    // 3. Per-row audit columns: ensure CreatedAt / UpdatedAt / CreatedBy / ModifiedBy on every POS table
    const auditTables = [
      'PosOrder','PosOrderLine','PosPayment',
      'PosCategory','PosItem','PosShop','PosPaymentType','PosVatRate','PosSpecialPrice',
      'PosFavourite','PosThirdParty','PosContact',
      'PosThirdPartyTransfer','PosThirdPartyTransferLine',
      'PosPortioning','PosPortioningLine',
      'PosWriteOff','PosManualSale',
      'PosStockRequest','PosStockRequestLine',
      'PosStockTake','PosStockTakeLine',
      'PosStockMovement',
      'PosTillSession','PosTillTransaction',
    ];
    for (const tbl of auditTables) {
      // The IF NOT EXISTS guard skips tables that don't exist on this deployment.
      const exists = await pool.request().query(
        `SELECT OBJECT_ID('[dbo].[${tbl}]') AS Id`
      );
      if (!exists.recordset[0]?.Id) continue;
      const auditCols = [
        ['CreatedAt',  'DATETIME2 NOT NULL DEFAULT GETUTCDATE()'],
        ['UpdatedAt',  'DATETIME2 NOT NULL DEFAULT GETUTCDATE()'],
        ['CreatedBy',  'NVARCHAR(200) NULL'],
        ['ModifiedBy', 'NVARCHAR(200) NULL'],
      ];
      for (const [col, def] of auditCols) {
        await pool.request().query(`
          IF NOT EXISTS (SELECT * FROM sys.columns
                         WHERE object_id=OBJECT_ID('[dbo].[${tbl}]') AND name='${col}')
            ALTER TABLE [dbo].[${tbl}] ADD [${col}] ${def}
        `);
      }
    }
  } catch (e) {
    logger.warn('ensurePosItemColumns failed', { error: e.message });
  }
}

async function start() {
  await db.connect();
  await ensurePosItemColumns();
  startReportScheduler();
  app.listen(PORT, () => logger.info(`API listening on :${PORT}`));
}

start().catch((err) => {
  logger.error('Failed to start server', { error: err.message });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  await db.close();
  process.exit(0);
});
