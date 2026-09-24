import {db,sql} from '../db/pool.js';

export async function assertClaim(tx,orderId,user,stage,sessionId){
  const row=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,orderId)
    .query('SELECT * FROM dbo.DispatchOrderClaim WITH(UPDLOCK,HOLDLOCK) WHERE DispatchOrderId=@id')).recordset[0];
  if(!row || row.Stage!==stage || String(row.UserId)!==String(user.userId) || (sessionId&&String(row.SessionId).toLowerCase()!==String(sessionId).toLowerCase()))
    throw new Error('Select and claim this order in your active session first; it may be held by another operator');
  return row;
}
export async function claim(user,orderId,stage,sessionId){
  if(!['assembly','packing'].includes(stage))throw new Error('Invalid work stage');
  const roles=stage==='assembly'?['admin','dispatch-supervisor','packer','assembler']:['admin','dispatch-supervisor','packer','checker'];
  if(!roles.includes(user.role))throw new Error('Permission required');
  const tx=new sql.Transaction(await db.getPool());await tx.begin();
  try{
    const header=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,orderId).query('SELECT * FROM dbo.DispatchOrder WITH(UPDLOCK,HOLDLOCK) WHERE DispatchOrderId=@id')).recordset[0];
    if(!header || !header.Confirmed || !(stage==='assembly'?['confirmed','assigned','assembling','assembled']:['assembled','packing']).includes(header.Status))throw new Error('Order is not ready for this stage');
    const table=stage==='assembly'?'DispatchAssemblySession':'DispatchPackingRun',column=stage==='assembly'?'SessionId':'RunId';
    const session=(await new sql.Request(tx).input('sid',sql.UniqueIdentifier,sessionId).input('uid',sql.NVarChar(100),String(user.userId))
      .query(`SELECT * FROM dbo.${table} WITH(UPDLOCK,HOLDLOCK) WHERE ${column}=@sid AND UserId=@uid AND EndedAt IS NULL`)).recordset[0];
    if(!session)throw new Error('Start your own active session first');
    if(stage==='assembly'&&!['admin','dispatch-supervisor'].includes(user.role)){
      const allowed=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,orderId).input('uid',sql.NVarChar(100),String(user.userId)).query(`
        SELECT 1 Allowed FROM dbo.DispatchChillerConfig WHERE Id=1 AND (BypassAssignment=1 OR EXISTS(
          SELECT 1 FROM dbo.DispatchOrderPart WHERE DispatchOrderId=@id AND Active=1 AND AssignedToUserId=@uid))`)).recordset[0];
      if(!allowed)throw new Error('Order is assigned to another assembler');
    }
    const existing=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,orderId).query('SELECT * FROM dbo.DispatchOrderClaim WITH(UPDLOCK,HOLDLOCK) WHERE DispatchOrderId=@id')).recordset[0];
    if(existing && (existing.Stage!==stage || String(existing.UserId)!==String(user.userId)))throw new Error(`Order is already claimed by ${existing.UserName}`);
    await new sql.Request(tx).input('id',sql.UniqueIdentifier,orderId).input('stage',sql.NVarChar(10),stage)
      .input('sid',sql.UniqueIdentifier,sessionId).input('uid',sql.NVarChar(100),String(user.userId)).input('name',sql.NVarChar(200),user.userName||'')
      .query(`IF NOT EXISTS(SELECT 1 FROM dbo.DispatchOrderClaim WHERE DispatchOrderId=@id)
        INSERT dbo.DispatchOrderClaim(DispatchOrderId,Stage,UserId,UserName,SessionId) VALUES(@id,@stage,@uid,@name,@sid);
        ELSE UPDATE dbo.DispatchOrderClaim SET SessionId=@sid WHERE DispatchOrderId=@id;`);
    await tx.commit();return {ok:true};
  }catch(e){await tx.rollback();throw e;}
}
export async function release(user,orderId){
  const tx=new sql.Transaction(await db.getPool());await tx.begin();
  try{
    await new sql.Request(tx).input('id',sql.UniqueIdentifier,orderId).query('SELECT DispatchOrderId FROM dbo.DispatchOrder WITH(UPDLOCK,HOLDLOCK) WHERE DispatchOrderId=@id');
    const r=await new sql.Request(tx).input('id',sql.UniqueIdentifier,orderId).input('uid',sql.NVarChar(100),String(user.userId))
      .input('super',sql.Bit,['admin','dispatch-supervisor'].includes(user.role)).query('DELETE dbo.DispatchOrderClaim WHERE DispatchOrderId=@id AND (UserId=@uid OR @super=1)');
    if(!r.rowsAffected[0])throw new Error('Only the owner or a supervisor can release this order');
    await new sql.Request(tx).input('id',sql.NVarChar(100),orderId).input('uid',sql.NVarChar(100),String(user.userId))
      .query("INSERT dbo.DispatchActionAudit(Action,EntityId,UserId) VALUES('release-order',@id,@uid)");
    await tx.commit();return {ok:true};
  }catch(e){await tx.rollback();throw e;}
}
