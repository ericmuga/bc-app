import { getSource, getDataset, tableRef } from './legacyReports.js';
import { DOWNLOAD_TABLES, DOWNLOAD_COMPANIES, DOWNLOAD_CUTOFF, downloadTable } from './warehouseDownloadTables.js';

const q = name => '[' + name.replaceAll(']', ']]') + ']';
const lit = value => "N'" + String(value).replaceAll("'", "''") + "'";
export const DOWNLOAD_JOB = 'BC Downloads - ERP to FCLWHS (2 hourly)';

// Only columns used by download datasets/filters/masters plus source keys/dates
// are copied. This avoids copying hundreds of unused Item/Customer columns.
export function downloadColumns() {
  const result = new Map(DOWNLOAD_TABLES.map(t => [t.table, new Set([...t.keys, ...(t.date ? [t.date] : [])]) ]));
  const source = getSource('FCL-CUR');
  for (const d of source.datasets.filter(d => getDataset(source, d.key))) {
    const aliases = { h: d.header, ...(d.line ? { l: d.line } : {}) };
    const joins = [...(d.joins || []), ...(d.summary?.joins || []), ...Object.values(d.filters || {}).flatMap(f => f.join ? [f.join] : [])];
    for (const j of joins) aliases[j.alias] = j.table;
    const expressions = [...d.columns.map(c => c.col), d.dateColumn, d.order, d.lineJoin || '',
      ...Object.values(d.filters || {}).flatMap(f => [f.col, f.condition || '']), ...joins.map(j => j.on),
      ...(d.summary?.groupBy || []).map(c => c.col), ...(d.summary?.aggregates || []).map(c => c.expr)];
    for (const expr of expressions) for (const [, alias, col] of expr.matchAll(/(\w+)\.\[([^\]]+)\]/g)) {
      if (aliases[alias]) result.get(aliases[alias]).add(col);
    }
    for (const f of Object.values(d.filters || {})) if (f.lookup) {
      result.get(f.lookup.table).add(f.lookup.code); result.get(f.lookup.table).add(f.lookup.description);
    }
  }
  return result;
}

export function etlInstallation({ linkedServer = 'FC-BC-DEV-DB01', database = 'FCL' } = {}) {
  const columns = downloadColumns();
  const batches = [];
  batches.push(`
    IF OBJECT_ID('dbo.DL_CompanyState') IS NULL CREATE TABLE dbo.DL_CompanyState (
      Company nvarchar(10) NOT NULL PRIMARY KEY, ReadyAt datetime2 NULL, LastSuccessAt datetime2 NULL,
      LastStartedAt datetime2 NULL, LastError nvarchar(2048) NULL);
    IF OBJECT_ID('dbo.DL_TableState') IS NULL CREATE TABLE dbo.DL_TableState (
      Company nvarchar(10) NOT NULL, TableKey nvarchar(80) NOT NULL,
      Watermark binary(8) NOT NULL DEFAULT 0x0000000000000000, WindowHigh binary(8) NULL,
      CursorJson nvarchar(4000) NULL, InitialComplete bit NOT NULL DEFAULT 0,
      RowsCopied bigint NOT NULL DEFAULT 0, LastSuccessAt datetime2 NULL,
      LastError nvarchar(2048) NULL, PRIMARY KEY(Company,TableKey));
    IF OBJECT_ID('dbo.DL_Run') IS NULL CREATE TABLE dbo.DL_Run (
      RunId bigint IDENTITY PRIMARY KEY, StartedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
      FinishedAt datetime2 NULL, Status varchar(20) NOT NULL, Error nvarchar(2048) NULL);
  `);
  const calls = [];
  for (const company of DOWNLOAD_COMPANIES) {
    batches.push(`IF NOT EXISTS(SELECT 1 FROM dbo.DL_CompanyState WHERE Company=${lit(company)}) INSERT dbo.DL_CompanyState(Company) VALUES(${lit(company)});`);
    const companyCalls = [];
    for (const spec of DOWNLOAD_TABLES) {
      const names = [...columns.get(spec.table)], colList = names.map(q).join(','), allCols = colList + ',[_SourceVersion]';
      const target = downloadTable(company, spec.table);
      const stage = `[dbo].[DLStage_${company}_${spec.key}]`;
      const source = `${q(database)}.${tableRef({ ...getSource(`${company}-CUR`), pool: 'live' }, spec.table)}`;
      const remoteSelect = `${colList},CONVERT(binary(8),[timestamp]) AS [_SourceVersion]`;
      const empty = `SELECT TOP (0) ${remoteSelect} FROM ${source}`;
      const proc = `[dbo].[Refresh_DL_${company}_${spec.key}]`;
      batches.push(`
        IF OBJECT_ID(${lit(target)}) IS NULL BEGIN
          SELECT * INTO ${target} FROM OPENQUERY(${q(linkedServer)},${lit(empty)});
          CREATE UNIQUE CLUSTERED INDEX [PK_Download] ON ${target} (${spec.keys.map(q).join(',')});
          ${spec.date ? `CREATE INDEX [IX_DownloadDate] ON ${target} (${q(spec.date)});` : ''}
        END;
        IF OBJECT_ID(${lit(stage)}) IS NULL SELECT TOP(0) * INTO ${stage} FROM ${target};
        IF NOT EXISTS(SELECT 1 FROM dbo.DL_TableState WHERE Company=${lit(company)} AND TableKey=${lit(spec.key)})
          INSERT dbo.DL_TableState(Company,TableKey) VALUES(${lit(company)},${lit(spec.key)});
      `);
      const match = spec.keys.map(k => `t.${q(k)}=s.${q(k)}`).join(' AND ');
      const scope = spec.date ? `s.${q(spec.date)}>=CONVERT(date,'${DOWNLOAD_CUTOFF}',23)` : '1=1';
      // Primary-key keyset pagination: no growing OFFSET and no sorting the
      // entire table by rowversion for every chunk. Checkpoint stays local.
      const keyPredicate = spec.keys.map((k, i) => {
        const parts = spec.keys.slice(0, i + 1).map((name, j) =>
          `${q(name)}${j === i ? '>' : '='}'` + `" + REPLACE(JSON_VALUE(@Cursor,'$.k${j}'),'''','''''') + "` + "'");
        return '(' + parts.join(' AND ') + ')';
      }).join(' OR ');
      // Convert the template's marked string boundaries into T-SQL concatenation.
      const cursorExpression = keyPredicate.split('" + ').map((part, i) => {
        if (i === 0) return lit(part);
        const [code, ...tail] = part.split(' + "');
        return code + ' + ' + lit(tail.join(' + "'));
      }).join(' + ');
      const order = spec.keys.map(q).join(',');
      const cursorSelect = spec.keys.map((k, i) => `${q(k)} AS k${i}`).join(',');
      batches.push(`CREATE OR ALTER PROCEDURE ${proc} @BatchSize int=5000 AS
      BEGIN
        SET NOCOUNT ON; SET XACT_ABORT ON;
        IF @BatchSize<100 OR @BatchSize>20000 THROW 51000,'Batch size must be 100..20000',1;
        DECLARE @Low binary(8),@High binary(8),@Cursor nvarchar(4000),@Initial bit,@Remote nvarchar(max),@Sql nvarchar(max),@Count int;
        SELECT @Low=Watermark,@High=WindowHigh,@Cursor=CursorJson,@Initial=InitialComplete
          FROM dbo.DL_TableState WHERE Company=${lit(company)} AND TableKey=${lit(spec.key)};
        IF @High IS NULL BEGIN
          SELECT @High=SafeVersion FROM OPENQUERY(${q(linkedServer)},${lit(`EXEC ${q(database)}.sys.sp_executesql N'SELECT CONVERT(binary(8),MIN_ACTIVE_ROWVERSION()) AS SafeVersion'`)});
          IF @High<@Low THROW 51000,'ERP rowversion moved backwards; rebuild the download mirror',1;
          UPDATE dbo.DL_TableState SET WindowHigh=@High,LastError=NULL WHERE Company=${lit(company)} AND TableKey=${lit(spec.key)};
        END;
        WHILE 1=1 BEGIN
          SET @Remote=${lit(`SELECT TOP (`)}+CONVERT(varchar(10),@BatchSize)+${lit(`) ${remoteSelect} FROM ${source} WHERE [timestamp]>=`)}
            +CONVERT(varchar(18),@Low,1)+' AND [timestamp]<'+CONVERT(varchar(18),@High,1);
          ${spec.date ? `IF @Initial=0 SET @Remote=@Remote+${lit(` AND ${q(spec.date)}>='${DOWNLOAD_CUTOFF}'`)};` : ''}
          IF @Cursor IS NOT NULL SET @Remote=@Remote+' AND ('+${cursorExpression}+')';
          SET @Remote=@Remote+${lit(` ORDER BY ${order}`)};
          IF LEN(@Remote)>7900 THROW 51000,'Remote query exceeds OPENQUERY limit',1;
          TRUNCATE TABLE ${stage};
          SET @Sql=N'INSERT ${stage} (${allCols}) SELECT ${allCols} FROM OPENQUERY(${q(linkedServer)},'''+REPLACE(@Remote,'''','''''')+''');';
          -- Remote fetch is outside the local transaction: no MSDTC required.
          EXEC sys.sp_executesql @Sql;
          SELECT @Count=COUNT(*) FROM ${stage};
          IF @Count=0 BREAK;
          SET @Cursor=(SELECT TOP(1) ${cursorSelect} FROM ${stage} ORDER BY ${spec.keys.map(k => q(k)+' DESC').join(',')} FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
          BEGIN TRANSACTION;
          UPDATE t SET ${names.filter(k => !spec.keys.includes(k)).map(k => `t.${q(k)}=s.${q(k)}`).concat('t.[_SourceVersion]=s.[_SourceVersion]').join(',')}
            FROM ${target} t JOIN ${stage} s ON ${match} WHERE ${scope};
          INSERT ${target} (${allCols}) SELECT ${names.map(k => 's.'+q(k)).join(',')},s.[_SourceVersion]
            FROM ${stage} s WHERE ${scope} AND NOT EXISTS(SELECT 1 FROM ${target} t WHERE ${match});
          ${spec.date ? `DELETE t FROM ${target} t JOIN ${stage} s ON ${match} WHERE NOT (${scope});` : ''}
          UPDATE dbo.DL_TableState SET CursorJson=@Cursor,RowsCopied=RowsCopied+@Count
            WHERE Company=${lit(company)} AND TableKey=${lit(spec.key)};
          COMMIT;
          -- Let OLTP and existing ETL jobs share the server.
          WAITFOR DELAY '00:00:00.100';
        END;
        UPDATE dbo.DL_TableState SET Watermark=@High,WindowHigh=NULL,CursorJson=NULL,
          InitialComplete=1,LastSuccessAt=SYSUTCDATETIME(),LastError=NULL
          WHERE Company=${lit(company)} AND TableKey=${lit(spec.key)};
      END;`);
      companyCalls.push(`BEGIN TRY EXEC ${proc} @BatchSize=@BatchSize; END TRY BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        UPDATE dbo.DL_TableState SET LastError=ERROR_MESSAGE() WHERE Company=${lit(company)} AND TableKey=${lit(spec.key)};
        THROW; END CATCH;`);
    }
    calls.push(`BEGIN TRY
      UPDATE dbo.DL_CompanyState SET LastStartedAt=SYSUTCDATETIME(),LastError=NULL WHERE Company=${lit(company)};
      ${companyCalls.join('\n')}
      UPDATE dbo.DL_CompanyState SET ReadyAt=COALESCE(ReadyAt,SYSUTCDATETIME()),LastSuccessAt=SYSUTCDATETIME(),LastError=NULL WHERE Company=${lit(company)};
      END TRY BEGIN CATCH
        UPDATE dbo.DL_CompanyState SET LastError=ERROR_MESSAGE() WHERE Company=${lit(company)};
        SET @Errors=CONCAT(@Errors,${lit(company + ': ')},ERROR_MESSAGE(),'; ');
      END CATCH;`);
  }
  batches.push(`CREATE OR ALTER PROCEDURE dbo.Refresh_DownloadWarehouse @BatchSize int=5000 AS
    BEGIN
      SET NOCOUNT ON; SET XACT_ABORT ON;
      DECLARE @Lock int,@Run bigint,@Errors nvarchar(2048)=N'';
      EXEC @Lock=sys.sp_getapplock @Resource='DL_Warehouse_ETL',@LockMode='Exclusive',@LockOwner='Session',@LockTimeout=0;
      IF @Lock<0 THROW 51000,'Download ETL is already running',1;
      BEGIN TRY
        UPDATE dbo.DL_Run SET Status='Interrupted',FinishedAt=SYSUTCDATETIME() WHERE Status='Running';
        INSERT dbo.DL_Run(Status) VALUES('Running'); SET @Run=SCOPE_IDENTITY();
        ${calls.join('\n')}
        IF @Errors<>N'' THROW 51000,@Errors,1;
        UPDATE dbo.DL_Run SET Status='Succeeded',FinishedAt=SYSUTCDATETIME() WHERE RunId=@Run;
        EXEC sys.sp_releaseapplock @Resource='DL_Warehouse_ETL',@LockOwner='Session';
      END TRY BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        UPDATE dbo.DL_Run SET Status='Failed',Error=ERROR_MESSAGE(),FinishedAt=SYSUTCDATETIME() WHERE RunId=@Run;
        EXEC sys.sp_releaseapplock @Resource='DL_Warehouse_ETL',@LockOwner='Session';
        THROW;
      END CATCH;
    END;`);
  return batches;
}

export function etlJobSql(warehouseDatabase = 'FCLWHS') {
  return `DECLARE @Job uniqueidentifier,@Schedule int;
    SELECT @Job=job_id FROM msdb.dbo.sysjobs WHERE name=${lit(DOWNLOAD_JOB)};
    IF @Job IS NULL BEGIN
      EXEC msdb.dbo.sp_add_job @job_name=${lit(DOWNLOAD_JOB)},@enabled=1,
        @description=N'Resumable keyset batches, committed rowversion increments; current data from 2025-01-06',@job_id=@Job OUTPUT;
      EXEC msdb.dbo.sp_add_jobstep @job_id=@Job,@step_name=N'Refresh downloads',@subsystem=N'TSQL',
        @database_name=${lit(warehouseDatabase)},@command=N'EXEC dbo.Refresh_DownloadWarehouse @BatchSize=5000;',
        @retry_attempts=2,@retry_interval=10;
      EXEC msdb.dbo.sp_add_jobserver @job_id=@Job;
    END;
    SELECT @Schedule=schedule_id FROM msdb.dbo.sysschedules WHERE name=N'BC Downloads every 2 hours';
    IF @Schedule IS NULL BEGIN
      EXEC msdb.dbo.sp_add_schedule @schedule_name=N'BC Downloads every 2 hours',@enabled=1,
        @freq_type=4,@freq_interval=1,@freq_subday_type=8,@freq_subday_interval=2,@active_start_time=1500,@schedule_id=@Schedule OUTPUT;
    END;
    IF NOT EXISTS(SELECT 1 FROM msdb.dbo.sysjobschedules WHERE job_id=@Job AND schedule_id=@Schedule)
      EXEC msdb.dbo.sp_attach_schedule @job_id=@Job,@schedule_id=@Schedule;
  `;
}
