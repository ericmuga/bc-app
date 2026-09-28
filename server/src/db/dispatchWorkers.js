export async function migrateDispatchWorkers(pool){
 await pool.request().query(`
 IF OBJECT_ID('dbo.DispatchWorker') IS NULL CREATE TABLE dbo.DispatchWorker(
 WorkerId uniqueidentifier PRIMARY KEY DEFAULT NEWID(),Code nvarchar(30) NOT NULL UNIQUE,Name nvarchar(150) NOT NULL,
 PasscodeHash nvarchar(100) NOT NULL,Assembly bit NOT NULL,Packing bit NOT NULL,Loading bit NOT NULL,
 Active bit NOT NULL DEFAULT 1,Version int NOT NULL DEFAULT 1,FailedAttempts int NOT NULL DEFAULT 0,LockedUntil datetime2 NULL,
 UpdatedBy nvarchar(100) NOT NULL,UpdatedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME());
 IF OBJECT_ID('dbo.DispatchDelegation') IS NULL CREATE TABLE dbo.DispatchDelegation(
 DelegationId uniqueidentifier PRIMARY KEY DEFAULT NEWID(),TokenHash varchar(64) NOT NULL UNIQUE,
 WorkerId uniqueidentifier NOT NULL REFERENCES dbo.DispatchWorker(WorkerId),WorkerCode nvarchar(30) NOT NULL,WorkerName nvarchar(150) NOT NULL,
 ParentUserId nvarchar(100) NOT NULL,ParentName nvarchar(200) NOT NULL,Stage varchar(10) NOT NULL,
 WorkerVersion int NOT NULL,StartedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),ExpiresAt datetime2 NOT NULL,EndedAt datetime2 NULL);
 `);
 for(const table of ['DispatchAssemblySession','DispatchPackingRun','DispatchLoadingSession']){
  await pool.request().query(`IF OBJECT_ID('dbo.${table}') IS NOT NULL AND COL_LENGTH('dbo.${table}','DelegationId') IS NULL
   ALTER TABLE dbo.${table} ADD DelegationId uniqueidentifier NULL,ParentUserId nvarchar(100) NULL,ParentName nvarchar(200) NULL;`);
 }
}
