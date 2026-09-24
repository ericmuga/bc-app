/**
 * models/WarehouseSyncModel.js
 * Read-only monitoring of the FCLWHS data-warehouse ETL (172.16.10.9):
 *   - SQL Server Agent job health (last run, outcome, duration, schedule, next run)
 *   - per-job run history (step-level)
 *   - the refresh stored procedures and which job drives each
 *   - freshness of the key materialised fact tables
 *   - "Run now" (sp_start_job) for a chosen job
 *
 * Everything reads msdb / sys catalog views on the warehouse box via `whsDb`.
 * The only write is sp_start_job (asks Agent to start a job; it does not itself
 * mutate warehouse data).
 */
import { whsDb, whsSql as sql } from '../db/whsPool.js';
import logger from '../services/logger.js';

async function pool() { return whsDb.getPool(); }

export async function downloadEtlStatus() {
  const p = await pool();
  const exists = await p.request().query("SELECT OBJECT_ID('dbo.DL_TableState') AS Id");
  if (!exists.recordset[0]?.Id) return { installed: false, companies: [], tables: [], runs: [] };
  const [companies, tables, runs] = await Promise.all([
    p.request().query('SELECT * FROM dbo.DL_CompanyState ORDER BY Company'),
    p.request().query(`SELECT s.Company,s.TableKey,s.InitialComplete,s.RowsCopied,s.LastSuccessAt,s.LastError,
      CASE WHEN s.WindowHigh IS NOT NULL THEN 1 ELSE 0 END HasCheckpoint,
      ISNULL(p.Rows,0) StoredRows FROM dbo.DL_TableState s OUTER APPLY (
        SELECT SUM(row_count) Rows FROM sys.dm_db_partition_stats
        WHERE object_id=OBJECT_ID('dbo.DL_'+s.Company+'_'+s.TableKey) AND index_id IN (0,1)) p
      ORDER BY s.Company,s.TableKey`),
    p.request().query('SELECT TOP(20) * FROM dbo.DL_Run ORDER BY RunId DESC'),
  ]);
  return { installed: true, companies: companies.recordset, tables: tables.recordset, runs: runs.recordset };
}

// SQL Agent run_status → label. 0 Failed, 1 Succeeded, 2 Retry, 3 Canceled, 4 In progress.
const RUN_STATUS = { 0: 'FAILED', 1: 'SUCCEEDED', 2: 'RETRY', 3: 'CANCELED', 4: 'IN PROGRESS' };

// SQL Agent run_duration is an int shaped HHMMSS (e.g. 12327 = 1h23m27s). Format it.
function fmtDuration(d) {
  const n = Number(d || 0);
  if (!n) return '00:00:00';
  const s = String(n).padStart(6, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
}

/** Agent job health: one row per job with last-run + schedule + next-run. */
export async function listJobs() {
  const p = await pool();
  const r = await p.request().query(`
    SELECT j.name AS job, j.enabled, j.description,
      CASE WHEN act.start_execution_date IS NOT NULL AND act.stop_execution_date IS NULL
           THEN 1 ELSE 0 END AS is_running,
      msdb.dbo.agent_datetime(h.run_date, h.run_time) AS last_run,
      h.run_status   AS last_status,
      h.run_duration AS last_duration,
      act.next_scheduled_run_date AS next_run,
      sch.schedules AS schedules
    FROM msdb.dbo.sysjobs j
    OUTER APPLY (
      SELECT TOP 1 a.start_execution_date, a.stop_execution_date, a.next_scheduled_run_date
      FROM msdb.dbo.sysjobactivity a WHERE a.job_id = j.job_id
      ORDER BY a.session_id DESC
    ) act
    OUTER APPLY (
      SELECT TOP 1 hh.run_date, hh.run_time, hh.run_status, hh.run_duration
      FROM msdb.dbo.sysjobhistory hh
      WHERE hh.job_id = j.job_id AND hh.step_id = 0
      ORDER BY hh.run_date DESC, hh.run_time DESC
    ) h
    OUTER APPLY (
      SELECT STUFF((
        SELECT ', ' + ss.name
        FROM msdb.dbo.sysjobschedules js
        JOIN msdb.dbo.sysschedules ss ON ss.schedule_id = js.schedule_id
        WHERE js.job_id = j.job_id
        FOR XML PATH('')), 1, 2, '') AS schedules
    ) sch
    ORDER BY j.name`);

  return r.recordset.map((x) => ({
    job:          x.job,
    enabled:      !!x.enabled,
    description:  x.description || '',
    isRunning:    !!x.is_running,
    lastRun:      x.last_run || null,
    lastOutcome:  x.last_status == null ? null : (RUN_STATUS[x.last_status] || String(x.last_status)),
    lastDuration: fmtDuration(x.last_duration),
    // next_scheduled_run_date is a datetime; SQL Agent uses 1900-01-01 (pre-epoch)
    // as the "no next run" sentinel, so anything at/after 1970 is a real schedule.
    nextRun:      x.next_run && x.next_run.getTime && x.next_run.getTime() > 0 ? x.next_run : null,
    scheduled:    !!x.schedules,
    schedules:    x.schedules || '',
  }));
}

/** Recent run history (step-level) for one job. */
export async function jobHistory(jobName, limit = 25) {
  const p = await pool();
  const r = await p.request()
    .input('job', sql.NVarChar(128), String(jobName || ''))
    .input('lim', sql.Int, Math.min(200, Math.max(1, Number(limit) || 25)))
    .query(`
      SELECT TOP (@lim)
        h.instance_id, h.step_id, h.step_name, h.run_status,
        msdb.dbo.agent_datetime(h.run_date, h.run_time) AS run_at,
        h.run_duration, h.message
      FROM msdb.dbo.sysjobhistory h
      JOIN msdb.dbo.sysjobs j ON j.job_id = h.job_id
      WHERE j.name = @job
      ORDER BY h.instance_id DESC`);
  return r.recordset.map((x) => ({
    instanceId: x.instance_id,
    stepId:     x.step_id,
    stepName:   x.step_name || (x.step_id === 0 ? '(job outcome)' : ''),
    outcome:    RUN_STATUS[x.run_status] || String(x.run_status),
    runAt:      x.run_at || null,
    duration:   fmtDuration(x.run_duration),
    message:    x.message || '',
  }));
}

/** The refresh stored procedures + which Agent job (if any) executes each. */
export async function listProcedures() {
  const p = await pool();
  const procs = await p.request().query(`
    SELECT p.name AS proc_name, p.create_date, p.modify_date
    FROM sys.procedures p
    WHERE p.name LIKE 'Refresh[_]%' OR p.name LIKE 'refresh[_]%'
       OR p.name LIKE '%[_]refresh[_]%' OR p.name LIKE 'refresh%'
    ORDER BY p.name`);
  // Map procs → jobs by scanning job-step commands for the proc name.
  const steps = await p.request().query(`
    SELECT j.name AS job, CAST(s.command AS nvarchar(max)) AS command
    FROM msdb.dbo.sysjobs j JOIN msdb.dbo.sysjobsteps s ON s.job_id = j.job_id`);
  const cmds = steps.recordset;
  return procs.recordset.map((x) => {
    const name = x.proc_name.toLowerCase();
    const jobs = [...new Set(cmds
      .filter((c) => (c.command || '').toLowerCase().includes(name))
      .map((c) => c.job))];
    return {
      name:       x.proc_name,
      createdAt:  x.create_date,
      modifiedAt: x.modify_date,
      runByJobs:  jobs,
    };
  });
}

// Materialised fact tables whose freshness we surface. For each we detect the
// first available "last load" and "posting date" column so a schema tweak can't
// break the panel.
const FACT_TABLES = [
  { table: 'fact_PURCH_INVOICE',     label: 'Purchase Invoices' },
  { table: 'fact_PURCH_CREDITMEMO',  label: 'Purchase Credit Memos' },
  { table: 'FACT_NETSALES_MAT',      label: 'Net Sales (materialised)' },
  { table: 'FACT_GLENTRY_MV',        label: 'GL Entries' },
  { table: 'FACT_PURCHASELINE_MV',   label: 'Purchase Lines' },
  { table: 'fact_ILE_MV',            label: 'Item Ledger (inventory analytics)' },
];
const LOAD_COLS = ['LoadDtm', 'LastLoadAt', 'LoadDate', 'WatermarkAt', 'LoadedAt'];
const DATE_COLS = ['PostingDate', 'Posting Date', 'Posting_Date', 'PostingDate_'];

async function columnsOf(p, table) {
  const r = await p.request().input('t', sql.NVarChar(256), table)
    .query(`SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.' + @t)`);
  return new Set(r.recordset.map((x) => x.name));
}
function pick(cols, candidates) { return candidates.find((c) => cols.has(c)) || null; }

/** Row counts + newest posting date + last load time per key fact table. */
export async function factFreshness() {
  const p = await pool();
  const out = [];
  for (const f of FACT_TABLES) {
    try {
      const idR = await p.request().input('t', sql.NVarChar(256), f.table)
        .query(`SELECT OBJECT_ID('dbo.' + @t) AS id`);
      if (!idR.recordset[0]?.id) { out.push({ ...f, exists: false }); continue; }
      const cols = await columnsOf(p, f.table);
      const loadCol = pick(cols, LOAD_COLS);
      const dateCol = pick(cols, DATE_COLS);
      const sel = [
        'COUNT(*) AS rows',
        loadCol ? `MAX([${loadCol}]) AS lastLoad` : 'CAST(NULL AS datetime) AS lastLoad',
        dateCol ? `MAX([${dateCol}]) AS maxDate`  : 'CAST(NULL AS datetime) AS maxDate',
      ].join(', ');
      const r = await p.request().query(`SELECT ${sel} FROM [dbo].[${f.table}]`);
      const row = r.recordset[0] || {};
      out.push({
        ...f, exists: true,
        rows:     Number(row.rows || 0),
        lastLoad: row.lastLoad || null,
        maxDate:  row.maxDate || null,
        loadCol, dateCol,
      });
    } catch (e) {
      out.push({ ...f, exists: true, error: e.message });
    }
  }
  return out;
}

/** Ask SQL Agent to start a job now. Validates the job exists first. */
export async function startJob(jobName) {
  const name = String(jobName || '').trim();
  if (!name) throw new Error('job name is required');
  const p = await pool();
  const chk = await p.request().input('n', sql.NVarChar(128), name)
    .query(`SELECT COUNT(*) AS c FROM msdb.dbo.sysjobs WHERE name = @n`);
  if (!chk.recordset[0].c) throw new Error(`Unknown job: ${name}`);
  await p.request().input('n', sql.NVarChar(128), name)
    .query(`EXEC msdb.dbo.sp_start_job @job_name = @n`);
  logger.info('warehouse/startJob', { job: name });
  return { job: name, started: true };
}
