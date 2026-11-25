/**
 * Portioning stock sheet (replaces the separate Manual Sales / Write-offs
 * screens): one sheet per shop + "as at" date, one line per item with sales,
 * write-off and the final physical count; the unaccounted quantity is the
 * variance. Also links a portioning to the stock-request line it was cut from.
 * Additive and idempotent — safe on every start.
 */
export async function migratePortionStockSheet(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosPortionSheet' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosPortionSheet] (
      [SheetId]     UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [SheetNo]     NVARCHAR(30)     NOT NULL UNIQUE,
      [ShopCode]    NVARCHAR(50)     NOT NULL,
      [PeriodFrom]  DATE             NOT NULL,
      [AsAtDate]    DATE             NOT NULL,
      [Status]      NVARCHAR(20)     NOT NULL DEFAULT 'draft',
      [Source]      NVARCHAR(20)     NOT NULL DEFAULT 'manual',
      [Notes]       NVARCHAR(500)    NULL,
      [CreatedBy]   NVARCHAR(100)    NULL,
      [PostedBy]    NVARCHAR(100)    NULL,
      [CreatedAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [PostedAt]    DATETIME2        NULL,
      [UpdatedAt]   DATETIME2        NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosPortionSheetLine' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosPortionSheetLine] (
      [LineId]              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [SheetId]             UNIQUEIDENTIFIER NOT NULL,
      [ItemNo]              NVARCHAR(30)     NOT NULL,
      [Description]         NVARCHAR(200)    NOT NULL DEFAULT '',
      [UnitOfMeasure]       NVARCHAR(20)     NULL,
      [OpeningQty]          DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [InQty]               DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [RecordedSalesQty]    DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [RecordedWriteOffQty] DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [SalesQty]            DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [WriteOffQty]         DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [CountQty]            DECIMAL(18,4)    NULL,
      [ExpectedQty]         DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [VarianceQty]         DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [UnitPrice]           DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [VarianceValue]       DECIMAL(18,4)    NOT NULL DEFAULT 0,
      [Comment]             NVARCHAR(500)    NULL,
      [SortOrder]           INT              NOT NULL DEFAULT 0,
      CONSTRAINT [FK_PosPortionSheetLine] FOREIGN KEY ([SheetId])
        REFERENCES [dbo].[PosPortionSheet]([SheetId]) ON DELETE CASCADE
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_PosPortionSheet_Shop_AsAt')
      CREATE INDEX [IX_PosPortionSheet_Shop_AsAt] ON [dbo].[PosPortionSheet]([ShopCode],[AsAtDate])
  `);
  await pool.request().query(`
    IF OBJECT_ID('dbo.PosPortioning') IS NOT NULL AND NOT EXISTS (SELECT * FROM sys.columns
      WHERE object_id=OBJECT_ID('dbo.PosPortioning') AND name='SourceRequestLineId')
      ALTER TABLE [dbo].[PosPortioning] ADD [SourceRequestLineId] UNIQUEIDENTIFIER NULL
  `);
}
