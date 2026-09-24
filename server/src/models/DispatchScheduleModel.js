import {db,sql} from '../db/pool.js';
import {ALL_COMPANIES} from '../services/bcTables.js';
export function validateSchedule(company,body){
 if(!ALL_COMPANIES.includes(company))throw new Error('Select a BC company');
 if(!['pull','push'].includes(body.kind))throw new Error('Select pull or push');
 if(typeof body.enabled!=='boolean')throw new Error('Enabled must be true or false');
 if(!Number.isInteger(body.intervalMinutes)||body.intervalMinutes<1||body.intervalMinutes>1440)throw new Error('Interval must be a whole number from 1 to 1440 minutes');
}
export async function schedules(company=null){return (await (await db.getPool()).request().input('company',sql.NVarChar(10),company).query('SELECT * FROM dbo.DispatchSyncSchedule WHERE (@company IS NULL OR Company=@company) ORDER BY Company,Kind')).recordset;}
export async function saveSchedule(company,body,user){
 validateSchedule(company,body);
 await (await db.getPool()).request().input('company',sql.NVarChar(10),company).input('kind',sql.VarChar(10),body.kind)
 .input('enabled',sql.Bit,body.enabled).input('minutes',sql.Int,body.intervalMinutes).input('user',sql.NVarChar(100),String(user.userId))
 .query(`UPDATE dbo.DispatchSyncSchedule SET Enabled=@enabled,IntervalMinutes=@minutes,
 NextRunAt=CASE WHEN @enabled=1 THEN DATEADD(MINUTE,@minutes,GETUTCDATE()) END,UpdatedAt=GETUTCDATE(),UpdatedBy=@user
 WHERE Company=@company AND Kind=@kind; IF @@ROWCOUNT=0 THROW 51000,'Schedule not initialized; run the dispatch migration',1;`);
 return schedules(company);
}
export async function claimDueSchedule(){
 return (await (await db.getPool()).request().query(`;WITH due AS (
 SELECT TOP(1) * FROM dbo.DispatchSyncSchedule WITH(UPDLOCK,READPAST,ROWLOCK)
 WHERE Enabled=1 AND NextRunAt<=GETUTCDATE() ORDER BY NextRunAt,Company,Kind)
 UPDATE due SET LastStartedAt=GETUTCDATE(),NextRunAt=DATEADD(MINUTE,IntervalMinutes,GETUTCDATE()) OUTPUT inserted.*;`)).recordset[0]||null;
}
