import { assertClaim } from './DispatchClaimModel.js';
import { db, sql } from '../db/pool.js';
import { assemblyValues } from '../../../shared/dispatchAssembly.mjs';
import { resolveStockUnit, recordMovement } from './DispatchMovementModel.js';

export async function completeLine({ dispatchOrderId, lineId, body, user }) {
  if (!['admin','dispatch-supervisor','packer','assembler'].includes(user.role)) throw new Error('Assembly permission required');
  if (!body.sessionId) throw new Error('Start an assembly session first');
  const pool = await db.getPool();
  // Conversion is read before taking app locks. No stock balance is imported from BC.
  const meta = (await pool.request().input('id',sql.UniqueIdentifier,dispatchOrderId).input('lid',sql.UniqueIdentifier,lineId)
    .query(`SELECT l.ItemNo,l.Uom,COALESCE(NULLIF(o.Company,''),NULLIF(pi.SourceCompany,''),c.StockCompany) Company,c.StockLocation
      FROM dbo.DispatchOrderLine l JOIN dbo.DispatchOrder o ON o.DispatchOrderId=l.DispatchOrderId
      LEFT JOIN dbo.PosItem pi ON pi.ItemNo=l.ItemNo
      CROSS JOIN dbo.DispatchChillerConfig c WHERE l.DispatchOrderId=@id AND l.LineId=@lid AND c.Id=1`)).recordset[0];
  if (!meta) throw new Error('Assembly line not found');
  const stock = await resolveStockUnit(meta.Company,meta.ItemNo,meta.Uom);
  const tx = new sql.Transaction(pool); await tx.begin();
  const rq = () => new sql.Request(tx);
  try {
    const header = (await rq().input('id',sql.UniqueIdentifier,dispatchOrderId).query(`
      SELECT * FROM dbo.DispatchOrder WITH(UPDLOCK,HOLDLOCK) WHERE DispatchOrderId=@id`)).recordset[0];
    if (!header?.Confirmed || !['confirmed','assigned','assembling','assembled'].includes(header.Status)) throw new Error('Order is not available for assembly or correction');
    const session = (await rq().input('sid',sql.UniqueIdentifier,body.sessionId).input('uid',sql.NVarChar(100),String(user.userId))
      .query(`SELECT SessionId FROM dbo.DispatchAssemblySession WITH(UPDLOCK,HOLDLOCK) WHERE SessionId=@sid AND UserId=@uid AND EndedAt IS NULL`)).recordset[0];
    if (!session) throw new Error('Start your own active assembly session first');
    await assertClaim(tx,dispatchOrderId,user,'assembly',body.sessionId);
    const line = (await rq().input('lid',sql.UniqueIdentifier,lineId).input('id',sql.UniqueIdentifier,dispatchOrderId).input('co',sql.NVarChar(10),meta.Company).query(`
      SELECT l.*,p.Active,p.Assembled,p.AssignedToUserId,a.Completed,a.Revision,a.StockBaseQty,a.StockCompany,a.StockLocation,a.StockBaseUom,
        a.BatchNo,a.Pieces,a.SessionId,a.AssembledByUserId,COALESCE(a.Chiller,r.Chiller,m.Chiller) Chiller
      FROM dbo.DispatchOrderLine l JOIN dbo.DispatchOrderPart p ON p.DispatchOrderId=l.DispatchOrderId AND p.Part=l.Part
      LEFT JOIN dbo.DispatchAssemblyLine a ON a.LineId=l.LineId
      LEFT JOIN dbo.DispatchItemRule r ON r.Company=@co AND r.ItemNo=l.ItemNo
      LEFT JOIN dbo.DispatchItemChiller m ON m.ItemNo=l.ItemNo WHERE l.LineId=@lid AND l.DispatchOrderId=@id`)).recordset[0];
    if (!line?.Active) throw new Error('Order part is inactive');
    const config = (await rq().query('SELECT BypassAssignment FROM dbo.DispatchChillerConfig WHERE Id=1')).recordset[0];
    const elevated = ['admin','dispatch-supervisor'].includes(user.role);
    if (!config.BypassAssignment && !elevated && String(line.AssignedToUserId) !== String(user.userId)) throw new Error('This part is assigned to another assembler');
    if (!line.Chiller || body.chiller !== line.Chiller) throw new Error('Select the mapped chiller');
    if (!Number.isInteger(body.expectedRevision) || body.expectedRevision !== Number(line.Revision || 0)) throw new Error('This line changed. Reload the order before saving');
    const correcting = !!(line.Completed || line.Assembled);
    if (correcting && body.correct !== true) throw new Error('Use Correct / reassemble for an assembled line');
    if (correcting && !elevated && String(line.AssembledByUserId) !== String(user.userId)) throw new Error('Only the original assembler or a supervisor can correct this line');
    const correctionReason = correcting ? String(body.correctionReason || '').trim() : null;
    if (correcting && (!correctionReason || correctionReason.length>250)) throw new Error('Enter a correction reason (up to 250 characters)');
    const v = assemblyValues(line,body);
    if(stock.KgPerUom>0)v.weight=Math.round(v.qty*Number(stock.KgPerUom)*10000)/10000;
    const revision = Number(line.Revision || 0)+1;
    const baseQty = Math.round(v.qty*Number(stock.QtyPerUom)*10000)/10000;
    const event = (await rq().input('sid',sql.UniqueIdentifier,body.sessionId).input('oid',sql.UniqueIdentifier,dispatchOrderId)
      .input('lid',sql.UniqueIdentifier,lineId).input('co',sql.NVarChar(10),meta.Company).input('no',sql.NVarChar(40),header.OrderNo)
      .input('part',sql.Char(1),line.Part).input('item',sql.NVarChar(30),line.ItemNo).input('ch',sql.NVarChar(50),line.Chiller)
      .input('qty',sql.Decimal(18,4),v.qty).input('wt',sql.Decimal(18,4),v.weight).input('pieces',sql.Int,v.pieces)
      .input('batch',sql.NVarChar(5),v.batch).input('reason',sql.NVarChar(20),v.reason)
      .input('correction',sql.NVarChar(250),correctionReason).input('rev',sql.Int,revision).input('kg',sql.Decimal(18,4),stock.KgPerUom == null ? null : Math.round(v.qty*Number(stock.KgPerUom)*10000)/10000).query(`
        INSERT dbo.DispatchAssemblyEvent(SessionId,DispatchOrderId,LineId,Company,OrderNo,Part,ItemNo,Chiller,Quantity,Weight,Pieces,BatchNo,ReturnReasonCode,CorrectionReason,Revision,WeightKg)
        OUTPUT inserted.EventId VALUES(@sid,@oid,@lid,@co,@no,@part,@item,@ch,@qty,@wt,@pieces,@batch,@reason,@correction,@rev,@kg)`)).recordset[0];
    const movement = {eventId:event.EventId,company:meta.Company,location:meta.StockLocation,chiller:line.Chiller,
      itemNo:line.ItemNo,baseUom:stock.BaseUom,user};
    if (line.StockBaseQty != null) await recordMovement(tx,{...movement,company:line.StockCompany,location:line.StockLocation,
      baseUom:line.StockBaseUom || stock.BaseUom,quantity:Number(line.StockBaseQty),kind:'reversal',batch:line.BatchNo,reason:correctionReason});
    await recordMovement(tx,{...movement,quantity:-baseQty,kind:correcting ? 'reassembly' : 'assembly',batch:v.batch,reason:correctionReason});
    await rq().input('lid',sql.UniqueIdentifier,lineId).input('oid',sql.UniqueIdentifier,dispatchOrderId)
      .input('sid',sql.UniqueIdentifier,body.sessionId).input('qty',sql.Decimal(18,4),v.qty).input('wt',sql.Decimal(18,4),v.weight)
      .input('pieces',sql.Int,v.pieces).input('batch',sql.NVarChar(5),v.batch).input('rc',sql.NVarChar(20),v.reason)
      .input('rn',sql.NVarChar(200),v.reasonName).input('uid',sql.NVarChar(100),String(user.userId)).input('name',sql.NVarChar(200),user.userName || '')
      .input('ch',sql.NVarChar(50),line.Chiller).input('rev',sql.Int,revision).input('base',sql.Decimal(18,4),baseQty)
      .input('co',sql.NVarChar(10),meta.Company).input('loc',sql.NVarChar(20),meta.StockLocation).input('baseUom',sql.NVarChar(20),stock.BaseUom).query(`
      MERGE dbo.DispatchAssemblyLine WITH(HOLDLOCK) t USING(SELECT @lid LineId) s ON s.LineId=t.LineId
      WHEN MATCHED THEN UPDATE SET SessionId=@sid,AssembledQty=@qty,AssembledWeight=@wt,Pieces=@pieces,BatchNo=@batch,
        ReturnReasonCode=@rc,ReturnReasonName=@rn,AssembledByUserId=@uid,AssembledByName=@name,AssembledAt=GETUTCDATE(),
        Chiller=@ch,Completed=1,Revision=@rev,StockBaseQty=@base,StockCompany=@co,StockLocation=@loc,StockBaseUom=@baseUom
      WHEN NOT MATCHED THEN INSERT(DispatchOrderId,LineId,SessionId,AssembledQty,AssembledWeight,Pieces,BatchNo,
        ReturnReasonCode,ReturnReasonName,AssembledByUserId,AssembledByName,Chiller,Completed,Revision,StockBaseQty,StockCompany,StockLocation,StockBaseUom)
        VALUES(@oid,@lid,@sid,@qty,@wt,@pieces,@batch,@rc,@rn,@uid,@name,@ch,1,@rev,@base,@co,@loc,@baseUom);`);
    const result = await rq().input('id',sql.UniqueIdentifier,dispatchOrderId).input('part',sql.Char(1),line.Part)
      .input('uid',sql.NVarChar(100),String(user.userId)).input('name',sql.NVarChar(200),user.userName || '').query(`
      UPDATE p SET Assembled=1,AssembledByUserId=@uid,AssembledByName=@name,AssembledAt=GETUTCDATE(),UpdatedAt=GETUTCDATE()
        FROM dbo.DispatchOrderPart p WHERE p.DispatchOrderId=@id AND p.Part=@part AND p.Assembled=0 AND p.Active=1
        AND NOT EXISTS(SELECT 1 FROM dbo.DispatchOrderLine l LEFT JOIN dbo.DispatchAssemblyLine a ON a.LineId=l.LineId
          WHERE l.DispatchOrderId=@id AND l.Part=@part AND ISNULL(a.Completed,0)=0);
      DECLARE @done bit=0;
      IF NOT EXISTS(SELECT 1 FROM dbo.DispatchOrderLine l LEFT JOIN dbo.DispatchOrderPart p ON p.DispatchOrderId=l.DispatchOrderId AND p.Part=l.Part
        WHERE l.DispatchOrderId=@id AND (p.Part IS NULL OR p.Active=0 OR p.Assembled=0)) SET @done=1;
      UPDATE dbo.DispatchOrder SET Status=CASE WHEN @done=1 THEN 'assembled' ELSE 'assembling' END,Assembled=@done,UpdatedAt=GETUTCDATE() WHERE DispatchOrderId=@id;
      IF @done=1 DELETE dbo.DispatchOrderClaim WHERE DispatchOrderId=@id AND Stage='assembly';
      SELECT @done fullyAssembled;`);
    await tx.commit(); return {ok:true,revision,fullyAssembled:result.recordset[0].fullyAssembled};
  } catch(e) { try { await tx.rollback(); } catch {} throw e; }
}
