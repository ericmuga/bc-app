import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db,sql} from './pool.js';
import {trackSync,syncStatus} from '../models/DispatchSyncModel.js';
import {reportLookups} from '../models/DispatchReportModel.js';
import {importFromBc} from '../models/DispatchModel.js';
const kind='TEST-SYNC-'+randomUUID();
try {
 await trackSync(kind,async()=>{
  assert.equal((await syncStatus()).runs.find(r=>r.Kind===kind).status,'running');
  return {count:3};
 });
 assert.equal((await syncStatus()).runs.find(r=>r.Kind===kind).result.count,3);
 await assert.rejects(()=>trackSync(kind,async()=>{throw new Error('Fixture failure')}),/Fixture failure/);
 assert.equal((await syncStatus()).runs.find(r=>r.Kind===kind).status,'failed');
 await trackSync(kind,async()=>({imported:2,errors:[{company:'FCL',error:'Fixture partial failure'}]}),{trigger:'scheduled'});
 const partial=(await syncStatus(kind)).runs[0];
 assert.equal(partial.status,'partial');
 assert.equal(partial.trigger,'scheduled');
 assert.equal(partial.result.imported,2);
 assert.ok((await syncStatus(kind)).runs.every(r=>r.Kind===kind),'history can be scoped to order pulls');
 const lookups=await reportLookups();assert.ok(Array.isArray(lookups.customer));assert.ok(Array.isArray(lookups.item));
 const lock=new sql.Transaction(await db.getPool());await lock.begin();
 try {
  const held=await new sql.Request(lock).query("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource='dispatch-bc-order-pull',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=0; SELECT @r Result");
  assert.ok(held.recordset[0].Result>=0,'test holds the order-pull lock');
  await assert.rejects(()=>importFromBc(),/already running/);
 }finally{await lock.rollback();}
 console.log('PASS: running, success and failed sync history, cache status and report lookups');
} finally {
 await (await db.getPool()).request().input('kind',sql.NVarChar(100),kind).query("DELETE dbo.DispatchActionAudit WHERE Action='dispatch-sync' AND EntityId=@kind");
 await db.close();
}
