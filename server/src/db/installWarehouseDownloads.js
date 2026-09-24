import { writeFileSync } from 'node:fs';
import { whsDb } from './whsPool.js';
import { etlInstallation, etlJobSql, DOWNLOAD_JOB } from '../services/warehouseDownloadEtl.js';

const args = new Set(process.argv.slice(2));
const batches = etlInstallation({ linkedServer: process.env.DOWNLOAD_ERP_LINK || 'FC-BC-DEV-DB01', database: process.env.BC_DB_NAME || 'FCL' });
const job = etlJobSql(process.env.WHS_DB_NAME || 'FCLWHS');
if (!args.has('--apply')) {
  writeFileSync(new URL('../../../warehouse-downloads.sql', import.meta.url), batches.concat(job).join('\nGO\n') + '\n');
  console.log('Wrote warehouse-downloads.sql for review. Use --apply to install; --start to begin the initial backfill.');
} else {
  let pool;
  try {
    pool = await whsDb.getPool();
    // Validate every remote projection before adding local objects.
    for (const batch of batches.filter(b => b.includes('CREATE UNIQUE CLUSTERED INDEX'))) {
      const query = batch.match(/FROM OPENQUERY\([\s\S]+?\);/)?.[0];
      await pool.request().query('SELECT TOP(0) * ' + query);
    }
    for (const batch of batches) await pool.request().query(batch);
    await pool.request().query(job);
    console.log('Installed 68 download mirrors, staging tables, checkpoints, refresh procedures and the two-hour SQL Agent job.');
    if (args.has('--start')) {
      await pool.request().input('job', DOWNLOAD_JOB).query('EXEC msdb.dbo.sp_start_job @job_name=@job');
      console.log('Initial backfill started in SQL Agent. Monitor Warehouse Sync Center.');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { if (pool) await pool.close(); }
}
