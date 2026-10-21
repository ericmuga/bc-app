export async function migrateDispatchOffline(pool) {
  await pool.request().query(`IF OBJECT_ID('dbo.DispatchOrderClaim') IS NOT NULL AND COL_LENGTH('dbo.DispatchOrderClaim','Paused') IS NULL
    ALTER TABLE dbo.DispatchOrderClaim ADD Paused bit NOT NULL CONSTRAINT DF_DispatchOrderClaim_Paused DEFAULT 0;
    IF OBJECT_ID('dbo.DispatchAssemblyReceipt') IS NULL
    CREATE TABLE dbo.DispatchAssemblyReceipt(
      RequestId uniqueidentifier NOT NULL PRIMARY KEY,
      UserId nvarchar(100) NOT NULL, PayloadHash varchar(64) NOT NULL,
      Result nvarchar(1000) NOT NULL, CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME());`);
}
