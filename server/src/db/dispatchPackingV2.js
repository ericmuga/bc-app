export async function migrateDispatchPackingV2(pool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.DispatchSyncSchedule') IS NULL
      CREATE TABLE dbo.DispatchSyncSchedule(Company nvarchar(10) NOT NULL,Kind varchar(10) NOT NULL,
        Enabled bit NOT NULL,IntervalMinutes int NOT NULL CHECK(IntervalMinutes BETWEEN 1 AND 1440),
        NextRunAt datetime2 NULL,LastStartedAt datetime2 NULL,UpdatedAt datetime2 NOT NULL DEFAULT GETUTCDATE(),UpdatedBy nvarchar(100) NULL,
        PRIMARY KEY(Company,Kind),CHECK(Kind IN ('pull','push')));
    INSERT dbo.DispatchSyncSchedule(Company,Kind,Enabled,IntervalMinutes,NextRunAt)
      SELECT c.Company,k.Kind,CASE WHEN k.Kind='pull' THEN 1 ELSE 0 END,2,
        CASE WHEN k.Kind='pull' THEN DATEADD(MINUTE,2,GETUTCDATE()) END
      FROM (VALUES('FCL'),('CM'),('FLM'),('RMK')) c(Company) CROSS JOIN (VALUES('pull'),('push')) k(Kind)
      WHERE NOT EXISTS(SELECT 1 FROM dbo.DispatchSyncSchedule s WHERE s.Company=c.Company AND s.Kind=k.Kind);

    IF OBJECT_ID('dbo.DispatchPackedExportIntent') IS NULL
      CREATE TABLE dbo.DispatchPackedExportIntent(DispatchOrderId uniqueidentifier NOT NULL PRIMARY KEY,StartedAt datetime2 NOT NULL DEFAULT GETUTCDATE());
    IF OBJECT_ID('dbo.DispatchPackedExport') IS NULL
      CREATE TABLE dbo.DispatchPackedExport(LineId uniqueidentifier NOT NULL PRIMARY KEY,Company nvarchar(10) NOT NULL,
        PayloadHash varchar(64) NOT NULL,Payload nvarchar(max) NOT NULL,SyncedAt datetime2 NOT NULL DEFAULT GETUTCDATE(),SyncedBy nvarchar(100) NOT NULL);

    IF OBJECT_ID('dbo.DispatchPackingRun') IS NULL BEGIN
      CREATE TABLE dbo.DispatchPackingRun(RunId uniqueidentifier NOT NULL DEFAULT NEWID() PRIMARY KEY,
        UserId nvarchar(100) NOT NULL,UserName nvarchar(200) NOT NULL,CheckerUserId nvarchar(100) NOT NULL,
        CheckerName nvarchar(200) NOT NULL,StartedAt datetime2 NOT NULL DEFAULT GETUTCDATE(),EndedAt datetime2 NULL);
      CREATE UNIQUE INDEX UX_DispatchPackingRun_Open ON dbo.DispatchPackingRun(UserId) WHERE EndedAt IS NULL;
    END;
    IF OBJECT_ID('dbo.DispatchOrderClaim') IS NULL
      CREATE TABLE dbo.DispatchOrderClaim(DispatchOrderId uniqueidentifier NOT NULL,Stage nvarchar(10) NOT NULL,
        UserId nvarchar(100) NOT NULL,UserName nvarchar(200) NOT NULL,SessionId uniqueidentifier NOT NULL,
        ClaimedAt datetime2 NOT NULL DEFAULT GETUTCDATE(),PRIMARY KEY(DispatchOrderId),CHECK(Stage IN ('assembly','packing')));
    IF OBJECT_ID('dbo.DispatchItemUom') IS NULL
      CREATE TABLE dbo.DispatchItemUom(Company nvarchar(10) NOT NULL,ItemNo nvarchar(30) NOT NULL,Uom nvarchar(20) NOT NULL,
        BaseUom nvarchar(20) NOT NULL,QtyPerUom decimal(18,6) NOT NULL,KgPerUom decimal(18,8) NULL,
        RefreshedAt datetime2 NOT NULL DEFAULT GETUTCDATE(),PRIMARY KEY(Company,ItemNo,Uom));
    IF OBJECT_ID('dbo.DispatchActionAudit') IS NULL
      CREATE TABLE dbo.DispatchActionAudit(AuditId bigint IDENTITY PRIMARY KEY,Action nvarchar(40) NOT NULL,
        EntityId nvarchar(100) NOT NULL,UserId nvarchar(100) NOT NULL,UserName nvarchar(200) NULL,
        ApprovedBy nvarchar(100) NULL,Details nvarchar(max) NULL,CreatedAt datetime2 NOT NULL DEFAULT GETUTCDATE());
    IF COL_LENGTH('dbo.DispatchAssemblyEvent','WeightKg') IS NULL ALTER TABLE dbo.DispatchAssemblyEvent ADD WeightKg decimal(18,4) NULL;
    IF COL_LENGTH('dbo.DispatchPackingSession','RunId') IS NULL ALTER TABLE dbo.DispatchPackingSession ADD RunId uniqueidentifier NULL,EndedAt datetime2 NULL;
    IF COL_LENGTH('dbo.DispatchBoxLine','LineId') IS NULL ALTER TABLE dbo.DispatchBoxLine ADD LineId uniqueidentifier NULL,
      Pieces int NULL,BatchNo nvarchar(5) NULL,VoidedAt datetime2 NULL,PackedByUserId nvarchar(100) NULL,
      PackedByName nvarchar(200) NULL,RequestId uniqueidentifier NULL;
  `);
  await pool.request().query(`IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.DispatchBoxLine') AND name='UX_DispatchBoxLine_Request')
      CREATE UNIQUE INDEX UX_DispatchBoxLine_Request ON dbo.DispatchBoxLine(RequestId) WHERE RequestId IS NOT NULL;
    -- Link historical box entries only when the item resolves to exactly one order line.
    UPDATE bl SET LineId=x.LineId FROM dbo.DispatchBoxLine bl JOIN dbo.DispatchBox b ON b.BoxId=bl.BoxId
      CROSS APPLY(SELECT MIN(CONVERT(char(36),l.LineId)) LineId,COUNT(*) N FROM dbo.DispatchOrderLine l WHERE l.DispatchOrderId=b.DispatchOrderId AND l.ItemNo=bl.ItemNo) x
      WHERE bl.LineId IS NULL AND x.N=1;`);
}
