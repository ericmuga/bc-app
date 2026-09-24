import 'dotenv/config';
import assert from 'node:assert/strict';
import {db,sql} from './pool.js';
import {saveSchedule,claimDueSchedule} from '../models/DispatchScheduleModel.js';
const pool=await db.getPool(),tx=new sql.Transaction(pool),original=db.getPool;
await tx.begin();
try{
 db.getPool=async()=>({request:()=>new sql.Request(tx)});
 const saved=await saveSchedule('FCL',{kind:'pull',enabled:true,intervalMinutes:7},{userId:'schedule-test'});
 const pull=saved.find(r=>r.Kind==='pull');assert.equal(pull.IntervalMinutes,7);assert.equal(pull.Enabled,true);assert.ok(new Date(pull.NextRunAt)>new Date());
 const disabled=await saveSchedule('FCL',{kind:'pull',enabled:false,intervalMinutes:7},{userId:'schedule-test'});assert.equal(disabled.find(r=>r.Kind==='pull').NextRunAt,null);
 await new sql.Request(tx).query("INSERT dbo.DispatchSyncSchedule(Company,Kind,Enabled,IntervalMinutes,NextRunAt) VALUES('TEST','push',1,11,'1900-01-01')");
 const claimed=await claimDueSchedule();assert.equal(claimed.Company,'TEST');assert.ok(claimed.LastStartedAt);assert.equal(Math.round((new Date(claimed.NextRunAt)-new Date(claimed.LastStartedAt))/60000),11);
 console.log('PASS: schedule save, disable and atomic due claim; all changes rolled back, no sync executed');
}finally{db.getPool=original;await tx.rollback();await db.close();}
