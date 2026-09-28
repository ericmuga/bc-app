export async function migrateDispatchStocktake(pool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.DispatchStocktake') IS NULL BEGIN
      CREATE TABLE dbo.DispatchStocktake (
        StocktakeId uniqueidentifier NOT NULL DEFAULT NEWID() PRIMARY KEY,
        Company nvarchar(10) NOT NULL, LocationCode nvarchar(20) NOT NULL, Chiller nvarchar(50) NOT NULL,
        UserId nvarchar(100) NOT NULL, UserName nvarchar(200) NOT NULL,
        StartedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), CompletedAt datetime2 NULL,
        ReconciliationStatus nvarchar(30) NOT NULL DEFAULT 'awaiting-intray');
      CREATE UNIQUE INDEX UX_DispatchStocktake_Open ON dbo.DispatchStocktake(Company,LocationCode,Chiller) WHERE CompletedAt IS NULL;
    END;
    IF OBJECT_ID('dbo.DispatchStocktakeLine') IS NULL
      CREATE TABLE dbo.DispatchStocktakeLine (
        LineId uniqueidentifier NOT NULL DEFAULT NEWID() PRIMARY KEY,
        StocktakeId uniqueidentifier NOT NULL REFERENCES dbo.DispatchStocktake(StocktakeId),
        ItemNo nvarchar(30) NOT NULL, Description nvarchar(250) NOT NULL,
        Uom nvarchar(20) NOT NULL, BatchNo nvarchar(5) NOT NULL DEFAULT '',
        Quantity decimal(18,4) NOT NULL CHECK(Quantity>=0), Pieces int NULL CHECK(Pieces>=0),
        KgPerUom decimal(18,8) NULL, WeightKg decimal(18,4) NULL,
        Revision int NOT NULL DEFAULT 1, CountedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CountedBy nvarchar(100) NOT NULL,
        UNIQUE(StocktakeId,ItemNo,Uom,BatchNo));
    IF OBJECT_ID('dbo.DispatchStocktakeEvent') IS NULL
      CREATE TABLE dbo.DispatchStocktakeEvent (
        EventId bigint IDENTITY PRIMARY KEY,
        StocktakeId uniqueidentifier NOT NULL REFERENCES dbo.DispatchStocktake(StocktakeId),
        UserId nvarchar(100) NOT NULL, Action nvarchar(20) NOT NULL,
        Details nvarchar(max) NOT NULL, CreatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME());
  `);
}
