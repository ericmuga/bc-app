import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {db,sql} from './pool.js';
import * as P from '../models/DispatchPackingModel.js';
import * as C from '../models/DispatchClaimModel.js';
import * as A from '../models/DispatchAdminModel.js';
import {report} from '../models/DispatchReportModel.js';
import {getAssemblyOrder} from '../models/DispatchModel.js';
import {cachedUom} from '../models/DispatchUomModel.js';
const oid=randomUUID(),line=randomUUID(),line2=randomUUID(),checker=randomUUID(),supervisor=randomUUID();
const suffix=randomUUID().slice(0,12),orderNo='TEST-PACK-'+suffix,superName='test-super-'+suffix,password=randomUUID();
const users=[{userId:'test-pack-'+suffix,userName:'Packing regression',role:'packer'},
  {userId:'test-other-'+suffix,userName:'Other packing regression',role:'packer'}];
let pool;
try{
  pool=await db.getPool();
  await pool.request().input('oid',sql.UniqueIdentifier,oid).input('l1',sql.UniqueIdentifier,line).input('l2',sql.UniqueIdentifier,line2)
    .input('checker',sql.UniqueIdentifier,checker).input('super',sql.UniqueIdentifier,supervisor).input('sn',sql.NVarChar(100),superName)
    .input('cn',sql.NVarChar(100),'test-check-'+suffix).input('hash',sql.NVarChar(200),await bcrypt.hash(password,4)).input('no',sql.NVarChar(30),orderNo).query(`
    INSERT dbo.Users(UserId,Username,DisplayName,Role) VALUES(@checker,@cn,'Regression confirmer','checker');
    INSERT dbo.Users(UserId,Username,DisplayName,Role,PasswordHash) VALUES(@super,@sn,'Regression supervisor','dispatch-supervisor',@hash);
    INSERT dbo.DispatchOrder(DispatchOrderId,DispatchNo,OrderNo,Company,CustomerName,Status,Confirmed,Assembled,ShipmentDate)
      VALUES(@oid,@no,@no,'FCL','Packing regression fixture','assembled',1,1,CAST(GETUTCDATE() AS date));
    INSERT dbo.DispatchOrderPart(DispatchOrderId,Part,Active,Confirmed,Assembled) VALUES(@oid,'B',1,1,1);
    INSERT dbo.DispatchOrderLine(LineId,DispatchOrderId,ItemNo,Description,OrderQty,Uom,Part)
      VALUES(@l1,@oid,'J31010101','Regression same SKU line 1',10,'PC','B'),(@l2,@oid,'J31010101','Regression same SKU line 2',2,'PC','B');
    INSERT dbo.DispatchAssemblyLine(DispatchOrderId,LineId,AssembledQty,Pieces,BatchNo,Completed)
      VALUES(@oid,@l1,10,10,'AB12',1),(@oid,@l2,2,2,'AB12',1);`);
  const vessel=(await pool.request().query('SELECT TOP 1 VesselTypeId FROM dbo.DispatchVesselType WHERE Blocked=0')).recordset[0];
  assert.ok(vessel,'an active vessel is required');
  const runs=await Promise.all(users.map(u=>P.startRun(u,checker)));
  const claims=await Promise.allSettled(users.map((u,i)=>C.claim(u,oid,'packing',runs[i].RunId)));
  assert.equal(claims.filter(r=>r.status==='fulfilled').length,1,'one operator wins the claim');
  const winner=claims.findIndex(r=>r.status==='fulfilled');await C.release(users[winner],oid);
  await C.claim(users[0],oid,'packing',runs[0].RunId);
  assert.ok(!(await P.worklist(users[1])).some(o=>o.DispatchOrderId===oid.toUpperCase()),'other packer cannot see claimed order');
  await assert.rejects(()=>P.openBox(oid,{vesselTypeId:vessel.VesselTypeId},users[1]),/claim/);
  const box=await P.openBox(oid,{vesselTypeId:vessel.VesselTypeId},users[0]);
  await assert.rejects(()=>P.complete(oid,users[0]),/every assembled/);
  const first={lineId:line,pieces:6,batchNo:'AB12',requestId:randomUUID()};
  await Promise.all([P.addLine(box.BoxId,first,users[0]),P.addLine(box.BoxId,first,users[0])]);
  const detail=await P.detail(oid,users[0]);
  assert.ok(detail.lines.every(l=>l.BarcodeCompany==='FCL'),'packing barcode uses the source company');
  assert.ok((await getAssemblyOrder(oid)).lines.every(l=>l.BarcodeCompany==='FCL'),'assembly barcode uses the source company');
  assert.equal(detail.lines.find(l=>l.LineId.toLowerCase()===line.toLowerCase()).PackedQty,6,'duplicate retry adds once');
  assert.equal(detail.lines.find(l=>l.LineId.toLowerCase()===line2.toLowerCase()).PackedQty,0,'same SKU lines stay independent');
  await assert.rejects(()=>P.addLine(box.BoxId,{...first,pieces:5,requestId:randomUUID()},users[0]),/exceed/);
  assert.equal((await P.closeBox(box.BoxId,{},users[0])).packed,false,'partial box cannot complete order');
  await assert.rejects(()=>P.removeLine(detail.boxes[0].lines[0].BoxLineId,users[0]),/Supervisor/);
  await assert.rejects(()=>A.verifySupervisor(superName,'incorrect'),/credentials/);
  const approved=await A.verifySupervisor(superName,password);
  const extraBox=await P.openBox(oid,{vesselTypeId:vessel.VesselTypeId},users[0]);
  await assert.rejects(()=>P.unpack(box.BoxId,'Reject second open box',users[0],approved),/current open box/);
  await P.addLine(extraBox.BoxId,{...first,pieces:1,requestId:randomUUID()},users[0]);
  await P.closeBox(extraBox.BoxId,{},users[0]);
  await P.unpack(extraBox.BoxId,'Remove fixture contents',users[0],approved);
  const extraDetail=await P.detail(oid,users[0]);
  for(const contents of extraDetail.boxes.find(b=>b.BoxId===extraBox.BoxId).lines)await P.removeLine(contents.BoxLineId,users[0]);
  await pool.request().input('bid',sql.UniqueIdentifier,extraBox.BoxId).query("UPDATE dbo.DispatchBox SET Status='closed' WHERE BoxId=@bid");
  const oldLabel=(await pool.request().input('bid',sql.UniqueIdentifier,box.BoxId).query('SELECT QrToken FROM dbo.DispatchBox WHERE BoxId=@bid')).recordset[0].QrToken;
  await P.unpack(box.BoxId,'Regression repack',users[0],approved);
  const changed=(await pool.request().input('bid',sql.UniqueIdentifier,box.BoxId).query('SELECT QrToken FROM dbo.DispatchBox WHERE BoxId=@bid')).recordset[0].QrToken;
  assert.notEqual(oldLabel,changed,'old label invalidated');
  await P.removeLine(detail.boxes[0].lines[0].BoxLineId,users[0]);
  await P.addLine(box.BoxId,{...first,pieces:10,requestId:randomUUID()},users[0]);
  await P.addLine(box.BoxId,{...first,lineId:line2,pieces:2,requestId:randomUUID()},users[0]);
  const closed=await P.closeBox(box.BoxId,{},users[0]);assert.equal(closed.packed,true);
  assert.ok(closed.label.estWeight>0,'PC converted to KG');
  const pcUnit=await cachedUom('FCL','J31010101','PC');
  const expectedKg=[10,2].reduce((sum,qty)=>sum+Math.round(qty*Number(pcUnit.KgPerUom)*10000)/10000,0);
  assert.equal(closed.label.estWeight,expectedKg,'packed weight uses BC KG per PC for every line');
  assert.equal((await P.detail(oid,users[0])).Status,'packed');
  const reporting=await report({order:orderNo});const packed=reporting.activity.filter(r=>r.Stage==='packing');
  assert.equal(packed.length,2,'voided contents excluded from reports');
  assert.equal(packed.reduce((n,r)=>n+Number(r.WeightKg),0),closed.label.estWeight);
  const wildcardReport=await report({order:orderNo,item:'J31010???|NOT-AN-ITEM',customer:'Packing*'});
  assert.equal(wildcardReport.orders.length,2,'BC wildcards apply to item codes and customer names');
  assert.equal((await report({order:orderNo,customer:'No match*'})).orders.length,0,'customer filter excludes other customers');
  await assert.rejects(()=>report({item:'J*|'}),/Invalid filter/);
  await P.endRun(users[0],runs[0].RunId);await P.endRun(users[1],runs[1].RunId);
  console.log('PASS: exclusive claims, confirmer sessions, duplicate retries, line identity, quantity limits, closed-box protection, supervisor credentials, unpack audit, label invalidation, auto-completion and KG reports');
}finally{
  if(pool)await pool.request().input('oid',sql.UniqueIdentifier,oid).input('c',sql.UniqueIdentifier,checker).input('s',sql.UniqueIdentifier,supervisor)
    .input('u1',sql.NVarChar(100),users[0].userId).input('u2',sql.NVarChar(100),users[1].userId).query(`
      DELETE dbo.DispatchActionAudit WHERE UserId IN (@u1,@u2);
      DELETE dbo.DispatchOrderClaim WHERE DispatchOrderId=@oid;
      DELETE dbo.DispatchBoxLine WHERE BoxId IN (SELECT BoxId FROM dbo.DispatchBox WHERE DispatchOrderId=@oid);
      DELETE dbo.DispatchBox WHERE DispatchOrderId=@oid;
      DELETE dbo.DispatchPackingSession WHERE DispatchOrderId=@oid;
      DELETE dbo.DispatchPackingRun WHERE UserId IN (@u1,@u2);
      DELETE dbo.DispatchAssemblyLine WHERE DispatchOrderId=@oid;
      DELETE dbo.DispatchOrderLine WHERE DispatchOrderId=@oid;
      DELETE dbo.DispatchOrderPart WHERE DispatchOrderId=@oid;
      DELETE dbo.DispatchOrder WHERE DispatchOrderId=@oid;
      DELETE dbo.Users WHERE UserId IN (@c,@s);`);
  await db.close();
}
