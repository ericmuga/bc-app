/**
 * Linked customers: extra BC customer numbers a shop may bill instead of its own
 * shop customer (e.g. a distributor with its own price list). A linked customer
 * belongs to one company and is either global (every shop) or tied to one shop.
 * Additive and idempotent — safe on every start.
 */
export async function migrateLinkedCustomers(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosLinkedCustomer' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosLinkedCustomer] (
      [LinkedCustomerId]   UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
      [Company]            NVARCHAR(20)     NOT NULL,
      [CustomerNo]         NVARCHAR(20)     NOT NULL,
      [CustomerName]       NVARCHAR(200)    NOT NULL DEFAULT '',
      [PriceGroup]         NVARCHAR(40)     NULL,
      [KraPin]             NVARCHAR(30)     NULL,
      [IsGlobal]           BIT              NOT NULL DEFAULT 0,
      [ShopCode]           NVARCHAR(50)     NULL,
      [IsActive]           BIT              NOT NULL DEFAULT 1,
      [SortOrder]          INT              NOT NULL DEFAULT 0,
      [Notes]              NVARCHAR(500)    NULL,
      [PriceCount]         INT              NOT NULL DEFAULT 0,
      [LastPriceSyncAt]    DATETIME2        NULL,
      [LastPriceSyncError] NVARCHAR(500)    NULL,
      -- Reserved for pushing the shop↔customer link to BC later
      [BcSyncStatus]       NVARCHAR(20)     NOT NULL DEFAULT 'pending',
      [BcSyncedAt]         DATETIME2        NULL,
      [CreatedBy]          NVARCHAR(100)    NULL,
      [CreatedAt]          DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      [UpdatedAt]          DATETIME2        NOT NULL DEFAULT GETUTCDATE(),
      CONSTRAINT [CK_PosLinkedCustomer_Scope] CHECK (([IsGlobal]=1 AND [ShopCode] IS NULL) OR ([IsGlobal]=0 AND [ShopCode] IS NOT NULL))
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_PosLinkedCustomer_Shop')
      CREATE INDEX [IX_PosLinkedCustomer_Shop] ON [dbo].[PosLinkedCustomer]([ShopCode],[IsActive])
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='PosLinkedCustomerPrice' AND schema_id=SCHEMA_ID('dbo'))
    CREATE TABLE [dbo].[PosLinkedCustomerPrice] (
      [PriceId]      BIGINT IDENTITY(1,1) PRIMARY KEY,
      [Company]      NVARCHAR(20)  NOT NULL,
      [CustomerNo]   NVARCHAR(20)  NOT NULL,
      [ItemNo]       NVARCHAR(30)  NOT NULL,
      [UnitPrice]    DECIMAL(18,4) NOT NULL,
      [StartingDate] DATE          NOT NULL,
      [EndingDate]   DATE          NULL,
      [SalesType]    TINYINT       NOT NULL,   -- 0 = customer price, 1 = customer price group
      [SalesCode]    NVARCHAR(40)  NOT NULL,
      [SyncedAt]     DATETIME2     NOT NULL DEFAULT GETUTCDATE()
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='IX_PosLinkedCustomerPrice_Cust_Item')
      CREATE INDEX [IX_PosLinkedCustomerPrice_Cust_Item]
        ON [dbo].[PosLinkedCustomerPrice]([Company],[CustomerNo],[ItemNo]) INCLUDE ([UnitPrice],[StartingDate],[EndingDate],[SalesType])
  `);
  for (const [col, def] of [
    ['LinkedCustomerId', 'UNIQUEIDENTIFIER NULL'],
    ['CustomerNo', 'NVARCHAR(20) NULL'],
    ['CustomerName', 'NVARCHAR(200) NULL'],
    ['CustomerCompany', 'NVARCHAR(20) NULL'],
    ['CustomerPin', 'NVARCHAR(30) NULL'],   // KRA PIN at time of sale → eTIMS buyer
  ]) {
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id=OBJECT_ID('dbo.PosOrder') AND name='${col}')
        ALTER TABLE [dbo].[PosOrder] ADD [${col}] ${def}
    `);
  }
}
