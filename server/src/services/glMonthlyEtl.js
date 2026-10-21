/**
 * services/glMonthlyEtl.js
 * Warehouse pre-aggregation for the Trial Balance and P&L.
 *
 * Problem: FCL [G_L Entry] holds ~111M rows and no index covers the TB's
 * Amount + Debit + Credit sums, so a live Trial Balance scans the whole table
 * and times out. Only ~300 posting accounts exist; pre-summing per account per
 * month (with global dimensions) collapses it to a tiny table.
 *
 * Builds, on FCLWHS (172.16.10.9):
 *   - dbo.FACT_GL_MONTHLY : one row per (Company, AccountNo, GlobalDim1Code,
 *                           GlobalDim2Code, MonthStart) with Debit/Credit/Net
 *                           sums + EntryCount, plus the account's name/type/
 *                           category/income-balance for reporting.
 *   - dbo.GLM_Watermark   : per-company LastEntryNo + RefreshedAt ("as of").
 *   - dbo.Refresh_FACT_GL_MONTHLY @Full : watermark-driven, month-chunked proc.
 *   - a SQL Agent job running the proc every 2 hours.
 *
 * Refresh is watermark-driven and only touches the months that actually changed
 * (normally just the current one — "amend the last month" — and it self-heals
 * backdated postings because those arrive with a new, higher Entry No_). Each
 * month is aggregated remotely via OPENQUERY (GROUP BY pushed to live BC, only a
 * few hundred rows cross the link) and written with a per-month DELETE+INSERT —
 * never a bulk scan or a long lock on the live table. Pass @Full=1 to rebuild
 * from history start (2025-01).
 *
 * Nothing here touches the live BC database except read-only OPENQUERY SELECTs.
 */

import { bcTable } from './bcTables.js';

const q   = (name) => '[' + String(name).replaceAll(']', ']]') + ']';
const lit = (value) => "N'" + String(value).replaceAll("'", "''") + "'";

export const GL_MONTHLY_JOB   = 'BC GL Monthly - FACT_GL_MONTHLY (2 hourly)';
export const GL_MONTHLY_PROC  = 'dbo.Refresh_FACT_GL_MONTHLY';
export const GL_MONTHLY_TABLE = 'dbo.FACT_GL_MONTHLY';
export const GL_WATERMARK_TABLE = 'dbo.GLM_Watermark';
export const GL_HISTORY_START = '2025-01-01';   // earliest posting date in the live data

// Companies to materialize. Start with FCL (the only one loaded today); the
// others are additive — add their app id here once their TB/P&L is needed.
export const GL_MONTHLY_COMPANIES = ['FCL'];

/** Remote (live BC) table reference for an OPENQUERY inner query: [FCL].[dbo].[{prefix}$Table$guid]. */
function remoteTable(company, table, database) {
  return `${q(database)}.${bcTable(company, table)}`;   // bcTable already yields [dbo].[...]
}

/**
 * The two DDL batches (table set + proc). Returned as an array so the installer
 * can run them as separate requests.
 */
export function glMonthlyProcSql({ linkedServer = 'FC-BC-DEV-DB01', database = 'FCL', companies = GL_MONTHLY_COMPANIES } = {}) {
  // Per-company refresh block: probe for new entries since the watermark, then
  // re-aggregate each affected month. Table names are baked here; watermark and
  // month bounds are concatenated as literals at run time (OPENQUERY strings
  // cannot be parameterized).
  const companyBlocks = companies.map((co) => {
    const entry = remoteTable(co, 'G_L Entry', database);
    const acct  = remoteTable(co, 'G_L Account', database);
    return `
      ------------------------------------------------------------------ ${co}
      BEGIN TRY
        SET @minD=NULL; SET @maxD=NULL; SET @mx=NULL;
        SELECT @wm = LastEntryNo FROM ${GL_WATERMARK_TABLE} WHERE Company=${lit(co)};
        IF @wm IS NULL BEGIN INSERT ${GL_WATERMARK_TABLE}(Company,LastEntryNo) VALUES(${lit(co)},0); SET @wm=0; END;
        IF @Full=1 BEGIN DELETE FROM ${GL_MONTHLY_TABLE} WHERE Company=${lit(co)}; SET @wm=0; END;

        -- What changed since last run? (pushed to live BC; returns one row)
        SET @Probe = N'SELECT @minD=minD,@maxD=maxD,@mx=mx FROM OPENQUERY(${q(linkedServer)}, ''SELECT MIN([Posting Date]) AS minD, MAX([Posting Date]) AS maxD, MAX([Entry No_]) AS mx FROM ${entry} WHERE [Entry No_] > ' + CONVERT(varchar(20),@wm) + N' '')';
        EXEC sys.sp_executesql @Probe, N'@minD date OUTPUT,@maxD date OUTPUT,@mx bigint OUTPUT', @minD=@minD OUTPUT,@maxD=@maxD OUTPUT,@mx=@mx OUTPUT;

        IF @mx IS NOT NULL
        BEGIN
          SET @M    = DATEFROMPARTS(YEAR(@minD),MONTH(@minD),1);
          SET @Stop = DATEFROMPARTS(YEAR(@maxD),MONTH(@maxD),1);
          WHILE @M <= @Stop
          BEGIN
            SET @MEnd=DATEADD(month,1,@M); SET @Ms=CONVERT(varchar(10),@M,23); SET @MEnds=CONVERT(varchar(10),@MEnd,23);
            SET @Remote = N'SELECT a.[No_] AS AccountNo, RTRIM(a.[Name]) AS AccountName, a.[Account Type] AS AccountType, a.[Account Category] AS AccountCategory, a.[Income_Balance] AS IncomeBalance, e.[Global Dimension 1 Code] AS GlobalDim1Code, e.[Global Dimension 2 Code] AS GlobalDim2Code, SUM(e.[Debit Amount]) AS PeriodDebit, SUM(e.[Credit Amount]) AS PeriodCredit, SUM(e.[Amount]) AS NetAmount, COUNT_BIG(*) AS EntryCount FROM ${entry} e JOIN ${acct} a ON a.[No_]=e.[G_L Account No_] WHERE a.[Account Type]=0 AND e.[Posting Date] >= ''' + @Ms + N''' AND e.[Posting Date] < ''' + @MEnds + N''' GROUP BY a.[No_],a.[Name],a.[Account Type],a.[Account Category],a.[Income_Balance],e.[Global Dimension 1 Code],e.[Global Dimension 2 Code]';
            SET @Sql = N'DELETE FROM ${GL_MONTHLY_TABLE} WHERE Company=@co AND MonthStart=@M;
              INSERT ${GL_MONTHLY_TABLE}(Company,AccountNo,AccountName,AccountType,AccountCategory,IncomeBalance,GlobalDim1Code,GlobalDim2Code,MonthStart,PeriodDebit,PeriodCredit,NetAmount,EntryCount,RefreshedAt)
              SELECT @co,AccountNo,AccountName,AccountType,AccountCategory,IncomeBalance,GlobalDim1Code,GlobalDim2Code,@M,PeriodDebit,PeriodCredit,NetAmount,EntryCount,SYSUTCDATETIME()
              FROM OPENQUERY(${q(linkedServer)}, ''' + REPLACE(@Remote,'''','''''') + ''');';
            EXEC sys.sp_executesql @Sql, N'@co nvarchar(10),@M date', @co=${lit(co)}, @M=@M;
            WAITFOR DELAY '00:00:00.100';   -- share the box between month chunks
            SET @M=DATEADD(month,1,@M);
          END;
          UPDATE ${GL_WATERMARK_TABLE} SET LastEntryNo=@mx, RefreshedAt=SYSUTCDATETIME(), LastError=NULL WHERE Company=${lit(co)};
        END;
      END TRY BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        SET @Errors = CONCAT(@Errors, ${lit(co + ': ')}, ERROR_MESSAGE(), N'; ');
        UPDATE ${GL_WATERMARK_TABLE} SET LastError=ERROR_MESSAGE() WHERE Company=${lit(co)};
      END CATCH;`;
  }).join('\n');

  const createTables = `
    IF OBJECT_ID('${GL_MONTHLY_TABLE}') IS NULL
    BEGIN
      CREATE TABLE ${GL_MONTHLY_TABLE} (
        Company         nvarchar(10)  NOT NULL,
        AccountNo       nvarchar(20)  NOT NULL,
        GlobalDim1Code  nvarchar(20)  NOT NULL CONSTRAINT DF_GLM_D1 DEFAULT N'',
        GlobalDim2Code  nvarchar(20)  NOT NULL CONSTRAINT DF_GLM_D2 DEFAULT N'',
        MonthStart      date          NOT NULL,
        AccountName     nvarchar(100) NULL,
        AccountType     int           NULL,
        AccountCategory int           NULL,
        IncomeBalance   int           NULL,
        PeriodDebit     decimal(38,2) NOT NULL CONSTRAINT DF_GLM_Debit  DEFAULT 0,
        PeriodCredit    decimal(38,2) NOT NULL CONSTRAINT DF_GLM_Credit DEFAULT 0,
        NetAmount       decimal(38,2) NOT NULL CONSTRAINT DF_GLM_Net    DEFAULT 0,
        EntryCount      bigint        NOT NULL CONSTRAINT DF_GLM_Count  DEFAULT 0,
        RefreshedAt     datetime2     NOT NULL CONSTRAINT DF_GLM_Refreshed DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_FACT_GL_MONTHLY PRIMARY KEY (Company, AccountNo, GlobalDim1Code, GlobalDim2Code, MonthStart)
      );
      -- Read path: TB/P&L scan by (Company, MonthStart) and sum over dims/accounts.
      CREATE INDEX IX_GLM_Company_Month ON ${GL_MONTHLY_TABLE}(Company, MonthStart)
        INCLUDE (AccountNo, AccountType, AccountCategory, IncomeBalance, NetAmount, PeriodDebit, PeriodCredit);
    END;

    IF OBJECT_ID('${GL_WATERMARK_TABLE}') IS NULL
      CREATE TABLE ${GL_WATERMARK_TABLE} (
        Company     nvarchar(10) NOT NULL PRIMARY KEY,
        LastEntryNo bigint       NOT NULL CONSTRAINT DF_GLMW_Entry DEFAULT 0,
        RefreshedAt datetime2    NULL,
        LastError   nvarchar(2048) NULL
      );`;

  const createProc = `
    CREATE OR ALTER PROCEDURE ${GL_MONTHLY_PROC} @Full bit = 0 AS
    BEGIN
      SET NOCOUNT ON; SET XACT_ABORT ON;
      DECLARE @Lock int, @Errors nvarchar(max)=N'',
              @wm bigint, @minD date, @maxD date, @mx bigint,
              @M date, @MEnd date, @Stop date, @Ms varchar(10), @MEnds varchar(10),
              @Remote nvarchar(max), @Sql nvarchar(max), @Probe nvarchar(max);

      EXEC @Lock = sys.sp_getapplock @Resource='FACT_GL_MONTHLY_ETL', @LockMode='Exclusive', @LockOwner='Session', @LockTimeout=0;
      IF @Lock < 0 THROW 51000, 'FACT_GL_MONTHLY refresh is already running', 1;

      BEGIN TRY
        ${companyBlocks}
        EXEC sys.sp_releaseapplock @Resource='FACT_GL_MONTHLY_ETL', @LockOwner='Session';
        IF @Errors <> N'' THROW 51000, @Errors, 1;
      END TRY BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        EXEC sys.sp_releaseapplock @Resource='FACT_GL_MONTHLY_ETL', @LockOwner='Session';
        THROW;
      END CATCH;
    END;`;

  return [createTables, createProc];
}

/** T-SQL that (idempotently) creates the 2-hourly SQL Agent job for the refresh. */
export function glMonthlyJobSql({ warehouseDatabase = 'FCLWHS' } = {}) {
  return `DECLARE @Job uniqueidentifier, @Schedule int;
    SELECT @Job = job_id FROM msdb.dbo.sysjobs WHERE name = ${lit(GL_MONTHLY_JOB)};
    IF @Job IS NULL
    BEGIN
      EXEC msdb.dbo.sp_add_job @job_name=${lit(GL_MONTHLY_JOB)}, @enabled=1,
        @description=N'Per-account/month GL pre-aggregation (with global dims) for Trial Balance and P&L; watermark-driven, amends changed months only.', @job_id=@Job OUTPUT;
      EXEC msdb.dbo.sp_add_jobstep @job_id=@Job, @step_name=N'Refresh FACT_GL_MONTHLY', @subsystem=N'TSQL',
        @database_name=${lit(warehouseDatabase)}, @command=N'EXEC ${GL_MONTHLY_PROC} @Full=0;',
        @retry_attempts=2, @retry_interval=10;
      EXEC msdb.dbo.sp_add_jobserver @job_id=@Job;
    END;
    SELECT @Schedule = schedule_id FROM msdb.dbo.sysschedules WHERE name = N'BC GL Monthly every 2 hours';
    IF @Schedule IS NULL
      EXEC msdb.dbo.sp_add_schedule @schedule_name=N'BC GL Monthly every 2 hours', @enabled=1,
        @freq_type=4, @freq_interval=1, @freq_subday_type=8, @freq_subday_interval=2, @active_start_time=1530, @schedule_id=@Schedule OUTPUT;
    IF NOT EXISTS (SELECT 1 FROM msdb.dbo.sysjobschedules WHERE job_id=@Job AND schedule_id=@Schedule)
      EXEC msdb.dbo.sp_attach_schedule @job_id=@Job, @schedule_id=@Schedule;`;
}
