export async function migrateDispatchSessions(pool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.DispatchAssemblySession') IS NULL BEGIN
      CREATE TABLE dbo.DispatchAssemblySession (
        SessionId uniqueidentifier NOT NULL DEFAULT NEWID() PRIMARY KEY,
        UserId nvarchar(100) NOT NULL, UserName nvarchar(200) NOT NULL,
        StartedAt datetime2 NOT NULL DEFAULT GETUTCDATE(), EndedAt datetime2 NULL);
      CREATE UNIQUE INDEX UX_DispatchAssemblySession_Open ON dbo.DispatchAssemblySession(UserId) WHERE EndedAt IS NULL;
    END;
    IF COL_LENGTH('dbo.DispatchAssemblyLine','SessionId') IS NULL
      ALTER TABLE dbo.DispatchAssemblyLine ADD SessionId uniqueidentifier NULL, Pieces int NULL,
        BatchNo nvarchar(5) NULL, Revision int NOT NULL DEFAULT 0, StockBaseQty decimal(18,4) NULL,
        StockCompany nvarchar(10) NULL, StockLocation nvarchar(20) NULL;
    IF COL_LENGTH('dbo.DispatchOrderLine','BaseUom') IS NULL
      ALTER TABLE dbo.DispatchOrderLine ADD BaseUom nvarchar(20) NULL, QtyPerUom decimal(18,6) NULL;
    IF COL_LENGTH('dbo.DispatchAssemblyLine','StockBaseUom') IS NULL
      ALTER TABLE dbo.DispatchAssemblyLine ADD StockBaseUom nvarchar(20) NULL;
    IF OBJECT_ID('dbo.DispatchAssemblyEvent') IS NULL BEGIN
      CREATE TABLE dbo.DispatchAssemblyEvent (
        EventId uniqueidentifier NOT NULL DEFAULT NEWID() PRIMARY KEY,
        SessionId uniqueidentifier NOT NULL REFERENCES dbo.DispatchAssemblySession(SessionId),
        DispatchOrderId uniqueidentifier NOT NULL, LineId uniqueidentifier NOT NULL,
        Company nvarchar(10) NULL, OrderNo nvarchar(40) NOT NULL, Part char(1) NULL,
        ItemNo nvarchar(30) NOT NULL, Chiller nvarchar(50) NOT NULL,
        Quantity decimal(18,4) NOT NULL, Weight decimal(18,4) NOT NULL, Pieces int NOT NULL,
        BatchNo nvarchar(5) NOT NULL, ReturnReasonCode nvarchar(20) NULL,
        CorrectionReason nvarchar(250) NULL, Revision int NOT NULL,
        CreatedAt datetime2 NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT UQ_DispatchAssemblyEvent_Revision UNIQUE(LineId,Revision));
      CREATE INDEX IX_DispatchAssemblyEvent_Session ON dbo.DispatchAssemblyEvent(SessionId,CreatedAt);
    END;
    IF OBJECT_ID('dbo.DispatchChillerMovement') IS NULL BEGIN
      CREATE TABLE dbo.DispatchChillerMovement (
        MovementId bigint IDENTITY PRIMARY KEY, EventId uniqueidentifier NULL REFERENCES dbo.DispatchAssemblyEvent(EventId),
        Company nvarchar(10) NOT NULL, LocationCode nvarchar(20) NOT NULL, Chiller nvarchar(50) NOT NULL,
        ItemNo nvarchar(30) NOT NULL, BaseUom nvarchar(20) NOT NULL,
        Quantity decimal(18,4) NOT NULL, Kind nvarchar(20) NOT NULL, BatchNo nvarchar(5) NULL,
        UserId nvarchar(100) NOT NULL, UserName nvarchar(200) NOT NULL, Reason nvarchar(250) NULL,
        SourceSystem nvarchar(50) NULL, SourceEntryId nvarchar(150) NULL,
        CreatedAt datetime2 NOT NULL DEFAULT GETUTCDATE());
      CREATE INDEX IX_DispatchChillerMovement_Item ON dbo.DispatchChillerMovement(Company,LocationCode,Chiller,ItemNo);
    END;
    IF COL_LENGTH('dbo.DispatchChillerMovement','SourceEntryId') IS NULL
      ALTER TABLE dbo.DispatchChillerMovement ADD SourceSystem nvarchar(50) NULL,SourceEntryId nvarchar(150) NULL;
    IF OBJECT_ID('dbo.DispatchChillerInboundSource') IS NULL
      CREATE TABLE dbo.DispatchChillerInboundSource (SourceSystem nvarchar(50) NOT NULL PRIMARY KEY,
        ServerName nvarchar(200) NULL,DatabaseName nvarchar(200) NULL,StartingPoint nvarchar(150) NULL,
        LastCursor nvarchar(150) NULL,Enabled bit NOT NULL DEFAULT 0);
    IF OBJECT_ID('dbo.DispatchItemRule') IS NULL
      CREATE TABLE dbo.DispatchItemRule (Company nvarchar(10) NOT NULL, ItemNo nvarchar(30) NOT NULL,
        PostingGroup nvarchar(30) NULL, Part char(1) NULL, Chiller nvarchar(50) NULL,
        Barcode nvarchar(50) NULL, BaseUom nvarchar(20) NULL, SalesUom nvarchar(20) NULL,
        QtyPerSalesUnit decimal(18,6) NULL, PRIMARY KEY(Company,ItemNo));
  `);
  await pool.request().query(`IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.DispatchChillerMovement') AND name='UX_DispatchChillerMovement_Source')
    CREATE UNIQUE INDEX UX_DispatchChillerMovement_Source ON dbo.DispatchChillerMovement(SourceSystem,SourceEntryId) WHERE SourceEntryId IS NOT NULL;`);
}
