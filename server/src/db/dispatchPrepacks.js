/**
 * db/dispatchPrepacks.js
 * Schema for pack sizes and numbered prepacks (idempotent; run lazily on first use).
 *
 *  - DispatchOrderLine gets the BC pack setup captured at import (MOQ table: main/mini pack
 *    size, allow loose pieces), so the breakdown matches what BC printed on the order.
 *  - DispatchPrepack: a pack of one item made up in advance by an assembler and given a
 *    number (and QR). During assembly the assembler scans prepacks onto an order line; their
 *    sizes fill the assembled pieces and each prepack records the order line it went to.
 */
import { db, sql } from './pool.js';

let ready = null;

export function ensurePrepackSchema() {
  if (!ready) ready = migrate().catch((e) => { ready = null; throw e; });
  return ready;
}

async function migrate() {
  const pool = await db.getPool();
  const run = (q) => pool.request().query(q);
  for (const [col, def] of [['MainPackSize', 'INT NULL'], ['MiniPackSize', 'INT NULL'], ['AllowLoose', 'BIT NULL']]) {
    await run(`IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id=OBJECT_ID('[dbo].[DispatchOrderLine]') AND name='${col}')
      ALTER TABLE [dbo].[DispatchOrderLine] ADD [${col}] ${def}`);
  }
  await run(`IF NOT EXISTS (SELECT * FROM sys.sequences WHERE name='DispatchPrepackSeq' AND schema_id=SCHEMA_ID('dbo'))
    CREATE SEQUENCE [dbo].[DispatchPrepackSeq] AS INT START WITH 1 INCREMENT BY 1`);
  await run(`IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='DispatchPrepack' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[DispatchPrepack] (
      [PrepackId]       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [PrepackNo]       NVARCHAR(30)     NOT NULL UNIQUE,
      [QrToken]         NVARCHAR(64)     NOT NULL UNIQUE,
      [Company]         NVARCHAR(10)     NOT NULL,
      [ItemNo]          NVARCHAR(30)     NOT NULL,
      [Description]     NVARCHAR(250)    NULL,
      [PackType]        NVARCHAR(10)     NOT NULL,
      [PackSize]        INT              NOT NULL,
      [BatchNo]         NVARCHAR(5)      NULL,
      [Chiller]         NVARCHAR(50)     NULL,
      [Status]          NVARCHAR(20)     NOT NULL DEFAULT 'available',
      [CreatedByUserId] NVARCHAR(100)    NULL,
      [CreatedByName]   NVARCHAR(200)    NULL,
      [CreatedAt]       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [DispatchOrderId] UNIQUEIDENTIFIER NULL,
      [LineId]          UNIQUEIDENTIFIER NULL,
      [OrderNo]         NVARCHAR(40)     NULL,
      [UsedByUserId]    NVARCHAR(100)    NULL,
      [UsedByName]      NVARCHAR(200)    NULL,
      [UsedAt]          DATETIME2        NULL,
      [VoidReason]      NVARCHAR(200)    NULL,
      [VoidedByName]    NVARCHAR(200)    NULL,
      [VoidedAt]        DATETIME2        NULL,
      [UpdatedAt]       DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [CK_DispatchPrepack_Status] CHECK ([Status] IN ('available','used','void')),
      CONSTRAINT [CK_DispatchPrepack_Type] CHECK ([PackType] IN ('main','mini'))
    )`);
  await run(`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_DispatchPrepack_Item' AND object_id=OBJECT_ID('[dbo].[DispatchPrepack]'))
    CREATE INDEX [IX_DispatchPrepack_Item] ON [dbo].[DispatchPrepack]([Company],[ItemNo],[Status])`);
  await run(`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_DispatchPrepack_Line' AND object_id=OBJECT_ID('[dbo].[DispatchPrepack]'))
    CREATE INDEX [IX_DispatchPrepack_Line] ON [dbo].[DispatchPrepack]([LineId]) WHERE [LineId] IS NOT NULL`);
}

export { sql };
