import {randomUUID} from 'node:crypto';
import QRCode from 'qrcode';
import {db,sql} from '../db/pool.js';
import {assertClaim} from './DispatchClaimModel.js';
import {cachedUom,withUnitConversions} from './DispatchUomModel.js';
import {assemblyValues} from '../../../shared/dispatchAssembly.mjs';

const uid=u=>String(u.userId);
export async function currentRun(user){return (await (await db.getPool()).request().input('uid',sql.NVarChar(100),uid(user))
  .query('SELECT * FROM dbo.DispatchPackingRun WHERE UserId=@uid AND EndedAt IS NULL')).recordset[0]||null;}
export async function startRun(user,checkerId){
  const tx=new sql.Transaction(await db.getPool());await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try{const req=new sql.Request(tx).input('uid',sql.NVarChar(100),uid(user)).input('name',sql.NVarChar(200),user.userName||'')
    .input('checker',sql.UniqueIdentifier,checkerId);
    const r=await req.query(`DECLARE @cn nvarchar(200); SELECT @cn=DisplayName FROM dbo.Users WHERE UserId=@checker AND IsActive=1 AND Role IN ('checker','dispatch-supervisor','admin');
      IF @cn IS NULL THROW 51000,'Select an active confirmer',1;
      IF CONVERT(nvarchar(100),@checker)=@uid THROW 51000,'Select a different person as confirmer',1;
      IF NOT EXISTS(SELECT 1 FROM dbo.DispatchPackingRun WITH(UPDLOCK,HOLDLOCK) WHERE UserId=@uid AND EndedAt IS NULL)
        INSERT dbo.DispatchPackingRun(UserId,UserName,CheckerUserId,CheckerName) VALUES(@uid,@name,CONVERT(nvarchar(100),@checker),@cn);
      SELECT * FROM dbo.DispatchPackingRun WHERE UserId=@uid AND EndedAt IS NULL;`);
    await tx.commit();return r.recordset[0];
  }catch(e){await tx.rollback();throw e;}
}
export async function endRun(user,id){
  const tx=new sql.Transaction(await db.getPool());await tx.begin();
  try{const r=await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('uid',sql.NVarChar(100),uid(user)).query(`
      UPDATE dbo.DispatchPackingRun SET EndedAt=GETUTCDATE() WHERE RunId=@id AND UserId=@uid AND EndedAt IS NULL;
      IF @@ROWCOUNT=0 THROW 51000,'Active packing session not found',1;
      DELETE dbo.DispatchOrderClaim WHERE Stage='packing' AND SessionId=@id AND UserId=@uid;
      UPDATE dbo.DispatchPackingSession SET Status='closed',EndedAt=GETUTCDATE(),UpdatedAt=GETUTCDATE() WHERE RunId=@id AND Status='open';`);
    await tx.commit();return {ok:true};
  }catch(e){await tx.rollback();throw e;}
}
export async function worklist(user,status='pending'){
  return (await (await db.getPool()).request().input('uid',sql.NVarChar(100),uid(user)).query(`SELECT o.*,c.UserName ClaimedBy,
    (SELECT COUNT(*) FROM dbo.DispatchBox b WHERE b.DispatchOrderId=o.DispatchOrderId) BoxCount
    FROM dbo.DispatchOrder o LEFT JOIN dbo.DispatchOrderClaim c ON c.DispatchOrderId=o.DispatchOrderId
    WHERE o.Assembled=1 AND o.Status ${status==='packed'?"IN ('packed','loaded')":status==='ongoing'?"='packing'":"='assembled'"}
      ${status==='packed'?'':"AND (c.DispatchOrderId IS NULL OR (c.Stage='packing' AND c.UserId=@uid))"}
    ORDER BY o.UpdatedAt DESC`)).recordset;
}
export async function detail(id,user){
  const p=await db.getPool();const req=p.request().input('id',sql.UniqueIdentifier,id).input('uid',sql.NVarChar(100),uid(user));
  const sets=(await req.query(`IF EXISTS(SELECT 1 FROM dbo.DispatchOrderClaim WHERE DispatchOrderId=@id AND UserId<>@uid)
      THROW 51000,'Order is being handled by another operator',1;
    SELECT * FROM dbo.DispatchOrder WHERE DispatchOrderId=@id;
    SELECT l.*,COALESCE(NULLIF(o.Company,''),NULLIF(i.SourceCompany,''),'FCL') BarcodeCompany,a.AssembledQty,a.Pieces AssembledPieces,a.BatchNo,a.AssembledWeight,
      COALESCE(p.Qty,0) PackedQty,COALESCE(p.Pieces,0) PackedPieces
    FROM dbo.DispatchOrderLine l JOIN dbo.DispatchOrder o ON o.DispatchOrderId=l.DispatchOrderId LEFT JOIN dbo.PosItem i ON i.ItemNo=l.ItemNo LEFT JOIN dbo.DispatchAssemblyLine a ON a.LineId=l.LineId
    OUTER APPLY(SELECT SUM(bl.Qty) Qty,SUM(bl.Pieces) Pieces FROM dbo.DispatchBoxLine bl JOIN dbo.DispatchBox b ON b.BoxId=bl.BoxId
      WHERE b.DispatchOrderId=@id AND bl.LineId=l.LineId AND bl.VoidedAt IS NULL) p
    WHERE l.DispatchOrderId=@id ORDER BY l.SortOrder;
    SELECT b.*,(SELECT COUNT(*) FROM dbo.DispatchBoxLine bl WHERE bl.BoxId=b.BoxId AND bl.VoidedAt IS NULL) LineCount
      FROM dbo.DispatchBox b WHERE b.DispatchOrderId=@id ORDER BY b.CreatedAt;
    SELECT bl.* FROM dbo.DispatchBoxLine bl JOIN dbo.DispatchBox b ON b.BoxId=bl.BoxId WHERE b.DispatchOrderId=@id AND bl.VoidedAt IS NULL;`)).recordsets;
  if(!sets[0][0])throw new Error('Order not found');
  return {...sets[0][0],lines:await withUnitConversions(sets[1]),boxes:sets[2].map(b=>({...b,lines:sets[3].filter(l=>l.BoxId===b.BoxId)}))};
}
async function lock(tx,id,user,{allowPacked=false}={}){
  const h=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query('SELECT * FROM dbo.DispatchOrder WITH(UPDLOCK,HOLDLOCK) WHERE DispatchOrderId=@id')).recordset[0];
  if(!h?.Assembled || !(allowPacked?['assembled','packing','packed']:['assembled','packing']).includes(h.Status))throw new Error('Order is not available for packing');
  const c=await assertClaim(tx,id,user,'packing');
  const run=(await new sql.Request(tx).input('sid',sql.UniqueIdentifier,c.SessionId).input('uid',sql.NVarChar(100),uid(user))
    .query('SELECT * FROM dbo.DispatchPackingRun WITH(UPDLOCK,HOLDLOCK) WHERE RunId=@sid AND UserId=@uid AND EndedAt IS NULL')).recordset[0];
  if(!run)throw new Error('Start your own packing session');
  return {header:h,run};
}
async function boxOrder(boxId){const b=(await (await db.getPool()).request().input('id',sql.UniqueIdentifier,boxId).query('SELECT * FROM dbo.DispatchBox WHERE BoxId=@id')).recordset[0];if(!b)throw new Error('Box not found');return b;}
export async function openBox(id,body,user){
  const tx=new sql.Transaction(await db.getPool());await tx.begin();
  try{const {run}=await lock(tx,id,user);const r=await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('run',sql.UniqueIdentifier,run.RunId)
    .input('uid',sql.NVarChar(100),uid(user)).input('name',sql.NVarChar(200),user.userName||'').input('checker',sql.NVarChar(100),run.CheckerUserId)
    .input('cn',sql.NVarChar(200),run.CheckerName).input('v',sql.UniqueIdentifier,body.vesselTypeId)
    .input('sno',sql.NVarChar(30),'PSN-'+randomUUID().replaceAll('-','').slice(0,24))
    .input('bno',sql.NVarChar(40),'BOX-'+randomUUID().replaceAll('-','').slice(0,24)).input('qr',sql.NVarChar(64),randomUUID()).query(`
      IF EXISTS(SELECT 1 FROM dbo.DispatchBox WHERE DispatchOrderId=@id AND Status='open') THROW 51000,'Close the current box before opening another',1;
      DECLARE @vc nvarchar(30); SELECT @vc=Code FROM dbo.DispatchVesselType WHERE VesselTypeId=@v AND Blocked=0;
      IF @vc IS NULL THROW 51000,'Select an active packing vessel',1;
      DECLARE @sid uniqueidentifier;
      SELECT @sid=SessionId FROM dbo.DispatchPackingSession WHERE DispatchOrderId=@id AND RunId=@run AND Status='open';
      IF @sid IS NULL BEGIN SET @sid=NEWID();
        INSERT dbo.DispatchPackingSession(SessionId,SessionNo,DispatchOrderId,PackerUserId,PackerName,CheckerUserId,CheckerName,RunId)
        VALUES(@sid,@sno,@id,@uid,@name,@checker,@cn,@run); END;
      INSERT dbo.DispatchBox(BoxNo,QrToken,SessionId,DispatchOrderId,VesselTypeId,VesselCode)
        OUTPUT inserted.* VALUES(@bno,@qr,@sid,@id,@v,@vc);
      UPDATE dbo.DispatchOrder SET Status='packing',UpdatedAt=GETUTCDATE() WHERE DispatchOrderId=@id;`);
    await tx.commit();return r.recordset[0];
  }catch(e){await tx.rollback();throw e;}
}
export async function addLine(boxId,body,user){
  if(!/^[0-9a-f-]{36}$/i.test(String(body.requestId||'')))throw new Error('A unique packing request ID is required');
  const box=await boxOrder(boxId),p=await db.getPool();
  const meta=(await p.request().input('lid',sql.UniqueIdentifier,body.lineId).input('oid',sql.UniqueIdentifier,box.DispatchOrderId).query(`
    SELECT l.*,COALESCE(NULLIF(o.Company,''),NULLIF(i.SourceCompany,''),'FCL') Company FROM dbo.DispatchOrderLine l
    JOIN dbo.DispatchOrder o ON o.DispatchOrderId=l.DispatchOrderId LEFT JOIN dbo.PosItem i ON i.ItemNo=l.ItemNo WHERE l.LineId=@lid AND l.DispatchOrderId=@oid`)).recordset[0];
  if(!meta)throw new Error('Select an item on this order');
  const value=assemblyValues(meta,body),unit=await cachedUom(meta.Company,meta.ItemNo,meta.Uom);
  if(!(unit.KgPerUom>0))throw new Error('BC has no KG conversion for this item. Refresh or correct its units before packing');
  if(value.qty<=0)throw new Error('Packed quantity must be positive');
  const tx=new sql.Transaction(p);await tx.begin();
  try{await lock(tx,box.DispatchOrderId,user);
    const r=await new sql.Request(tx).input('bid',sql.UniqueIdentifier,boxId).input('lid',sql.UniqueIdentifier,body.lineId)
      .input('request',sql.UniqueIdentifier,body.requestId).input('qty',sql.Decimal(18,4),value.qty).input('pieces',sql.Int,value.pieces)
      .input('batch',sql.NVarChar(5),value.batch).input('weight',sql.Decimal(18,4),Math.round(value.qty*Number(unit.KgPerUom)*10000)/10000)
      .input('uid',sql.NVarChar(100),uid(user)).input('name',sql.NVarChar(200),user.userName||'').query(`
      IF EXISTS(SELECT 1 FROM dbo.DispatchBoxLine WHERE RequestId=@request) BEGIN
        IF NOT EXISTS(SELECT 1 FROM dbo.DispatchBoxLine WHERE RequestId=@request AND BoxId=@bid AND LineId=@lid AND Qty=@qty AND Pieces=@pieces AND BatchNo=@batch AND VoidedAt IS NULL)
          THROW 51000,'Request already used; reload the box',1;
        SELECT * FROM dbo.DispatchBoxLine WHERE RequestId=@request; RETURN; END;
      IF NOT EXISTS(SELECT 1 FROM dbo.DispatchBox WHERE BoxId=@bid AND Status='open') THROW 51000,'Box is not open',1;
      DECLARE @assembled decimal(18,4),@ap int,@packed decimal(18,4),@pp int;
      SELECT @assembled=AssembledQty,@ap=Pieces FROM dbo.DispatchAssemblyLine WHERE LineId=@lid;
      SELECT @packed=COALESCE(SUM(Qty),0),@pp=COALESCE(SUM(Pieces),0) FROM dbo.DispatchBoxLine WHERE LineId=@lid AND VoidedAt IS NULL;
      IF @assembled IS NULL OR @packed+@qty>@assembled+0.00005 OR (@ap IS NOT NULL AND @pp+@pieces>@ap)
        THROW 51000,'Packed quantity or pieces exceed the assembled balance',1;
      INSERT dbo.DispatchBoxLine(BoxId,LineId,ItemNo,Description,Qty,Weight,Pieces,BatchNo,PackedByUserId,PackedByName,RequestId)
        OUTPUT inserted.* SELECT @bid,@lid,ItemNo,Description,@qty,@weight,@pieces,@batch,@uid,@name,@request FROM dbo.DispatchOrderLine WHERE LineId=@lid;`);
    await tx.commit();return r.recordset[0];
  }catch(e){await tx.rollback();throw e;}
}
export async function removeLine(lineId,user){
  const b=(await (await db.getPool()).request().input('id',sql.UniqueIdentifier,lineId).query('SELECT b.* FROM dbo.DispatchBoxLine l JOIN dbo.DispatchBox b ON b.BoxId=l.BoxId WHERE l.BoxLineId=@id')).recordset[0];
  if(!b)throw new Error('Box line not found');const tx=new sql.Transaction(await db.getPool());await tx.begin();
  try{await lock(tx,b.DispatchOrderId,user);await new sql.Request(tx).input('id',sql.UniqueIdentifier,lineId).input('bid',sql.UniqueIdentifier,b.BoxId).query(`
      IF NOT EXISTS(SELECT 1 FROM dbo.DispatchBox WHERE BoxId=@bid AND Status='open') THROW 51000,'Supervisor authorization is required to unpack a closed box',1;
      UPDATE dbo.DispatchBoxLine SET VoidedAt=GETUTCDATE() WHERE BoxLineId=@id AND VoidedAt IS NULL;`);await tx.commit();return {ok:true};
  }catch(e){await tx.rollback();throw e;}
}
async function finishIfReady(tx,id){
  const r=await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query(`DECLARE @ready bit=0;
    IF EXISTS(SELECT 1 FROM dbo.DispatchOrderLine WHERE DispatchOrderId=@id)
      AND NOT EXISTS(SELECT 1 FROM dbo.DispatchBox WHERE DispatchOrderId=@id AND Status<>'closed')
      AND NOT EXISTS(SELECT 1 FROM dbo.DispatchBoxLine bl JOIN dbo.DispatchBox b ON b.BoxId=bl.BoxId WHERE b.DispatchOrderId=@id AND bl.LineId IS NULL AND bl.VoidedAt IS NULL)
      AND NOT EXISTS(SELECT 1 FROM dbo.DispatchOrderLine l LEFT JOIN dbo.DispatchAssemblyLine a ON a.LineId=l.LineId
        OUTER APPLY(SELECT SUM(Qty) Qty,SUM(Pieces) Pieces FROM dbo.DispatchBoxLine bl WHERE bl.LineId=l.LineId AND bl.VoidedAt IS NULL) p
        WHERE l.DispatchOrderId=@id AND (a.AssembledQty IS NULL OR ABS(a.AssembledQty-COALESCE(p.Qty,0))>0.00005 OR (a.Pieces IS NOT NULL AND a.Pieces<>COALESCE(p.Pieces,0)))) SET @ready=1;
    IF @ready=1 BEGIN
      UPDATE dbo.DispatchOrder SET Packed=1,Status='packed',UpdatedAt=GETUTCDATE() WHERE DispatchOrderId=@id;
      UPDATE dbo.DispatchOrderPart SET Packed=1,PackedAt=GETUTCDATE() WHERE DispatchOrderId=@id AND Active=1;
      UPDATE dbo.DispatchPackingSession SET Status='closed',EndedAt=GETUTCDATE(),UpdatedAt=GETUTCDATE() WHERE DispatchOrderId=@id AND Status='open';
      DELETE dbo.DispatchOrderClaim WHERE DispatchOrderId=@id AND Stage='packing'; END;
    SELECT @ready Packed;`);return !!r.recordset[0].Packed;
}
export async function complete(id,user){const tx=new sql.Transaction(await db.getPool());await tx.begin();try{await lock(tx,id,user);if(!await finishIfReady(tx,id))throw new Error('Pack every assembled quantity and piece, then close all boxes');await tx.commit();return {packed:true};}catch(e){await tx.rollback();throw e;}}
export async function closeBox(boxId,body,user){
  const b=await boxOrder(boxId),tx=new sql.Transaction(await db.getPool());await tx.begin();
  try{const {run}=await lock(tx,b.DispatchOrderId,user);
    await new sql.Request(tx).input('bid',sql.UniqueIdentifier,boxId).input('uid',sql.NVarChar(100),uid(user))
      .input('name',sql.NVarChar(200),user.userName||'').input('cid',sql.NVarChar(100),run.CheckerUserId).input('cn',sql.NVarChar(200),run.CheckerName).query(`
      IF NOT EXISTS(SELECT 1 FROM dbo.DispatchBoxLine WHERE BoxId=@bid AND VoidedAt IS NULL) THROW 51000,'Cannot close an empty box',1;
      UPDATE b SET Status='closed',CheckedByUserId=@cid,CheckedByName=@cn,CheckedAt=GETUTCDATE(),ClosedByUserId=@uid,
        ClosedByName=@name,ClosedAt=GETUTCDATE(),UpdatedAt=GETUTCDATE(),GrossWeight=
          (SELECT SUM(Weight) FROM dbo.DispatchBoxLine WHERE BoxId=@bid AND VoidedAt IS NULL)+COALESCE(v.TareWeight,0)
      FROM dbo.DispatchBox b LEFT JOIN dbo.DispatchVesselType v ON v.VesselTypeId=b.VesselTypeId WHERE b.BoxId=@bid AND b.Status='open';
      IF @@ROWCOUNT=0 THROW 51000,'Box is already closed',1;`);
    const packed=await finishIfReady(tx,b.DispatchOrderId);await tx.commit();return {...await label(boxId),packed};
  }catch(e){if(!tx._aborted)try{await tx.rollback();}catch{}throw e;}
}
export async function label(boxId){
  const p=await db.getPool();const sets=(await p.request().input('bid',sql.UniqueIdentifier,boxId).query(`SELECT b.*,o.OrderNo,o.CustomerName,o.SalespersonName,o.RouteCode,o.ShipmentDate
    FROM dbo.DispatchBox b JOIN dbo.DispatchOrder o ON o.DispatchOrderId=b.DispatchOrderId WHERE BoxId=@bid AND b.Status IN ('closed','loaded');
    SELECT bl.*,l.Part FROM dbo.DispatchBoxLine bl LEFT JOIN dbo.DispatchOrderLine l ON l.LineId=bl.LineId WHERE BoxId=@bid AND VoidedAt IS NULL;`)).recordsets;
  const b=sets[0][0];if(!b)throw new Error('Close the box before printing its label');
  return {label:{boxNo:b.BoxNo,orderNo:b.OrderNo,customerName:b.CustomerName,part:[...new Set(sets[1].map(l=>l.Part))].join(','),
    estWeight:sets[1].reduce((n,l)=>n+Number(l.Weight),0),grossWeight:Number(b.GrossWeight),route:b.RouteCode,salesperson:b.SalespersonName,
    confirmer:b.CheckedByName,batches:[...new Set(sets[1].map(l=>l.BatchNo).filter(Boolean))].join(', ')},qrImage:await QRCode.toDataURL(b.QrToken,{width:240,margin:1})};
}
export async function unpack(boxId,reason,user,approver){
  if(!String(reason||'').trim())throw new Error('Enter an unpacking reason');
  const b=await boxOrder(boxId),tx=new sql.Transaction(await db.getPool());await tx.begin();
  try{
    await new sql.Request(tx).input('id',sql.UniqueIdentifier,b.DispatchOrderId).query('SELECT DispatchOrderId FROM dbo.DispatchOrder WITH(UPDLOCK,HOLDLOCK) WHERE DispatchOrderId=@id');
    const run=(await new sql.Request(tx).input('uid',sql.NVarChar(100),uid(user)).query('SELECT * FROM dbo.DispatchPackingRun WITH(UPDLOCK,HOLDLOCK) WHERE UserId=@uid AND EndedAt IS NULL')).recordset[0];
    if(!run)throw new Error('Start a packing session before unpacking');
    await new sql.Request(tx).input('bid',sql.UniqueIdentifier,boxId).input('oid',sql.UniqueIdentifier,b.DispatchOrderId)
      .input('qr',sql.NVarChar(64),randomUUID()).input('uid',sql.NVarChar(100),uid(user)).input('approved',sql.NVarChar(100),String(approver.UserId))
      .input('run',sql.UniqueIdentifier,run.RunId).input('name',sql.NVarChar(200),user.userName||'')
      .input('reason',sql.NVarChar(sql.MAX),JSON.stringify({reason:String(reason).trim(),previousQr:b.QrToken})).query(`
      IF EXISTS(SELECT 1 FROM dbo.DispatchOrderClaim WHERE DispatchOrderId=@oid AND UserId<>@uid) THROW 51000,'Release the other operator claim before unpacking',1;
      IF NOT EXISTS(SELECT 1 FROM dbo.DispatchBox WHERE BoxId=@bid AND Status='closed' AND LoadingSessionId IS NULL AND LoadedAt IS NULL)
        THROW 51000,'Only a closed, unloaded box can be unpacked',1;
      IF EXISTS(SELECT 1 FROM dbo.DispatchBox WHERE DispatchOrderId=@oid AND Status='open' AND BoxId<>@bid)
        THROW 51000,'Close the current open box before unpacking another',1;
      UPDATE dbo.DispatchBox SET Status='open',QrToken=@qr,ClosedAt=NULL,CheckedAt=NULL,GrossWeight=0,UpdatedAt=GETUTCDATE() WHERE BoxId=@bid;
      UPDATE dbo.DispatchOrder SET Packed=0,Status='packing',UpdatedAt=GETUTCDATE() WHERE DispatchOrderId=@oid;
      UPDATE dbo.DispatchOrderPart SET Packed=0,PackedAt=NULL WHERE DispatchOrderId=@oid;
      IF NOT EXISTS(SELECT 1 FROM dbo.DispatchOrderClaim WHERE DispatchOrderId=@oid)
        INSERT dbo.DispatchOrderClaim(DispatchOrderId,Stage,UserId,UserName,SessionId) VALUES(@oid,'packing',@uid,@name,@run);
      INSERT dbo.DispatchActionAudit(Action,EntityId,UserId,ApprovedBy,Details) VALUES('unpack-box',CONVERT(nvarchar(100),@bid),@uid,@approved,@reason);`);
    await tx.commit();return {ok:true};
  }catch(e){await tx.rollback();throw e;}
}
