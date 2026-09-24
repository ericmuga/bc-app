import {schedules} from './DispatchScheduleModel.js';
import {dispatchPullSchedule} from '../services/dispatchPullScheduler.js';
import {db,sql} from '../db/pool.js';
export async function trackSync(kind,work,context={}){
 const p=await db.getPool(),startedAt=new Date().toISOString();
 const row=(await p.request().input('kind',sql.NVarChar(100),kind).input('details',sql.NVarChar(sql.MAX),JSON.stringify({status:'running',startedAt,...context})).query("INSERT dbo.DispatchActionAudit(Action,EntityId,UserId,Details) OUTPUT inserted.AuditId VALUES('dispatch-sync',@kind,'system',@details)")).recordset[0];
 const finish=async details=>p.request().input('id',sql.BigInt,row.AuditId).input('details',sql.NVarChar(sql.MAX),JSON.stringify({...context,startedAt,endedAt:new Date().toISOString(),...details})).query('UPDATE dbo.DispatchActionAudit SET Details=@details WHERE AuditId=@id');
 try{const result=await work();await finish({status:result?.errors?.length?'partial':'succeeded',result});return result}catch(e){await finish({status:'failed',error:e.message});throw e}
}
export async function syncStatus(kind=null,company=null){
 const sets=(await (await db.getPool()).request().input('kind',sql.NVarChar(100),kind).input('company',sql.NVarChar(10),company).query(`SELECT TOP(100) AuditId,EntityId Kind,Details,CreatedAt FROM dbo.DispatchActionAudit WHERE Action='dispatch-sync' AND (@kind IS NULL OR EntityId=@kind) AND (@company IS NULL OR EXISTS(SELECT 1 FROM OPENJSON(Details,'$.companies') WHERE value=@company)) ORDER BY AuditId DESC;
 SELECT Company,COUNT(*) CachedUnits,MAX(RefreshedAt) RefreshedAt,SUM(CASE WHEN KgPerUom IS NULL THEN 1 ELSE 0 END) MissingKg FROM dbo.DispatchItemUom WHERE (@company IS NULL OR Company=@company) GROUP BY Company;`)).recordsets;
 return {schedule:dispatchPullSchedule(),schedules:await schedules(company),runs:sets[0].map(r=>{const entry={...r,...JSON.parse(r.Details||'{}'),Details:undefined};
   if(company&&entry.result?.byCompany){const result=entry.result,selected=result.byCompany[company];entry.result={...result,imported:selected?.imported??0,skipped:selected?.skipped??null,byCompany:selected?{[company]:selected}:{},errors:(result.errors||[]).filter(e=>e.company===company)};}
   return entry;}),units:sets[1]};
}
