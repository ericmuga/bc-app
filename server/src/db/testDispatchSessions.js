import {claim} from '../models/DispatchClaimModel.js';
import {cachedUom} from '../models/DispatchUomModel.js';
// Opt-in integration regression. Creates only uniquely named fixtures and removes them.
import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db,sql} from './pool.js';
import {bcDb} from './bcPool.js';
import * as Sessions from '../models/DispatchSessionModel.js';
import {completeLine} from '../models/DispatchSessionWriter.js';
const id=randomUUID(),lineId=randomUUID(),line2=randomUUID(),uid=`test-${randomUUID()}`;
const user={userId:uid,userName:'Dispatch regression fixture',role:'assembler'};
let p;
try {
  p=await db.getPool();
  await p.request().input('id',sql.UniqueIdentifier,id).input('lid',sql.UniqueIdentifier,lineId).input('lid2',sql.UniqueIdentifier,line2)
    .input('uid',sql.NVarChar(100),uid)
    .input('no',sql.NVarChar(30),'TEST-'+id.slice(0,20)).query(`
      INSERT dbo.DispatchOrder(DispatchOrderId,DispatchNo,SourceType,Company,OrderNo,CustomerName,Status,Confirmed)
        VALUES(@id,@no,'bc','FCL',@no,'Regression fixture','confirmed',1);
      INSERT dbo.DispatchOrderPart(DispatchOrderId,Part,Active,Confirmed,AssignedToUserId) VALUES(@id,'B',1,1,@uid);
      INSERT dbo.DispatchOrderLine(LineId,DispatchOrderId,ItemNo,Description,OrderQty,Uom,IsWeighted,Part)
        VALUES(@lid,@id,'J31010101','Regression fixture',10,'PC',0,'B'),(@lid2,@id,'J31090110','Regression fixture 2',2,'KG',1,'B');`);
  const [session,second]=await Promise.all([Sessions.start(user),Sessions.start(user)]);
  assert.equal(session.SessionId,second.SessionId,'start is idempotent');
  const body={sessionId:session.SessionId,chiller:'CHILLER U',pieces:10,batchNo:'AB12',expectedRevision:0};
  await claim(user,id,'assembly',session.SessionId);
  const save=b=>completeLine({dispatchOrderId:id,lineId,body:b,user});
  await assert.rejects(()=>completeLine({dispatchOrderId:id,lineId,body,user:{...user,role:'chiller-attendant'}}),/permission/);
  await assert.rejects(()=>save({...body,sessionId:randomUUID()}),/active assembly session/);
  await assert.rejects(()=>save({...body,batchNo:'BAD'}),/Batch/);
  const attempts=await Promise.allSettled([save(body),save(body)]);
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1,'concurrent duplicate saves issue stock once');
  assert.equal(attempts.find(a=>a.status==='fulfilled').value.fullyAssembled,false,'part waits for lines in other chillers');
  await assert.rejects(()=>save(body),/line changed/);
  assert.equal((await completeLine({dispatchOrderId:id,lineId:line2,body:{...body,pieces:2,assembledWeight:2,chiller:'FREEZER W'},user})).fullyAssembled,true);
  await claim(user,id,'assembly',session.SessionId);
  await assert.rejects(()=>save({...body,expectedRevision:1}),/Correct/);
  await save({...body,pieces:8,expectedRevision:1,correct:true,correctionReason:'Corrected piece count'});
  const check=(await p.request().input('id',sql.UniqueIdentifier,id).query(`SELECT o.Status,p.Assembled
    FROM dbo.DispatchOrder o JOIN dbo.DispatchOrderPart p ON p.DispatchOrderId=o.DispatchOrderId WHERE o.DispatchOrderId=@id;
    SELECT m.Quantity,m.Kind,e.LineId FROM dbo.DispatchChillerMovement m JOIN dbo.DispatchAssemblyEvent e ON e.EventId=m.EventId WHERE e.DispatchOrderId=@id;
    SELECT * FROM dbo.DispatchAssemblyEvent WHERE DispatchOrderId=@id ORDER BY Revision;`)).recordsets;
  assert.equal(check[0][0].Status,'assembled');assert.equal(check[0][0].Assembled,true);
  assert.equal(check[1].length,4,'two initial issues plus reversal and replacement');
  assert.equal(check[2].length,3,'original entries retained');
  const pcUnit=await cachedUom('FCL','J31010101','PC');
  assert.ok(pcUnit.KgPerUom>0,'fixture has a BC PC-to-KG conversion');
  for(const event of check[2].filter(e=>e.LineId.toLowerCase()===lineId.toLowerCase())) {
    const expectedKg=Math.round(event.Quantity*Number(pcUnit.KgPerUom)*10000)/10000;
    assert.equal(event.WeightKg,expectedKg,'assembly tonnage uses actual PC quantity and BC KG per PC');
    assert.equal(event.Weight,expectedKg,'assembly session weight includes piece-based items');
  }
  const initial=check[1].find(m=>m.LineId.toLowerCase()===lineId.toLowerCase()&&m.Kind==='assembly').Quantity;
  const total=check[1].filter(m=>m.LineId.toLowerCase()===lineId.toLowerCase()).reduce((n,m)=>n+Number(m.Quantity),0);
  assert.ok(Math.abs(total-initial*0.8)<0.0001,'net stock change equals corrected quantity');
  assert.equal((await Sessions.events({userId:'other',role:'packer'},session.SessionId)).length,0);
  assert.equal((await Sessions.events({userId:'attendant',role:'chiller-attendant'},session.SessionId)).length,3);
  await Sessions.end(user,session.SessionId);
  await assert.rejects(()=>save({...body,expectedRevision:2,correct:true,correctionReason:'Closed session'}),/active assembly session/);
  console.log('PASS: sessions, validation, auto-completion, stale retries, correction audit, stock delta, report scope and closed-session protection');
} finally {
  if(p) await p.request().input('id',sql.UniqueIdentifier,id).input('uid',sql.NVarChar(100),uid).query(`
    DELETE m FROM dbo.DispatchChillerMovement m JOIN dbo.DispatchAssemblyEvent e ON e.EventId=m.EventId WHERE e.DispatchOrderId=@id;
    DELETE dbo.DispatchOrderClaim WHERE DispatchOrderId=@id;
    DELETE dbo.DispatchAssemblyEvent WHERE DispatchOrderId=@id;
    DELETE dbo.DispatchAssemblyLine WHERE DispatchOrderId=@id;
    DELETE dbo.DispatchOrderLine WHERE DispatchOrderId=@id;
    DELETE dbo.DispatchOrderPart WHERE DispatchOrderId=@id;
    DELETE dbo.DispatchOrder WHERE DispatchOrderId=@id;
    DELETE dbo.DispatchAssemblySession WHERE UserId=@uid;`);
  await db.close();
  if(bcDb.pool) await bcDb.pool.close();
}
