import {resolveDelegation} from '../models/DispatchWorkerModel.js';
import {db,sql} from '../db/pool.js';
export async function dispatchDelegation(req,res,next){
 const token=req.headers['x-dispatch-delegation'];
 if(!token)return next();
 try{
  if(!req.path.startsWith('/dispatch/'))throw new Error('Worker access is limited to dispatch');
  const actor=await resolveDelegation(String(token),req.user);
  const path=req.path.replace('/dispatch/','');
  const shared=/^(chillers\/config|bc-routes|bc-salespersons|report-lookups|reports)(\/|$)/.test(path);
  const assembly=/^(assembly|assembly-sessions|return-reasons|chillers\/worklist)(\/|$)/.test(path);
  const packing=/^(packing|packing-runs|boxes|box-lines|box-by-qr|vessel-types|checkers)(\/|$)/.test(path);
  const loading=/^(loading|loading-lines|vehicles)(\/|$)/.test(path)||(req.method==='GET'&&path==='setup/vehicles');
  const barcode=path==='item-barcode'&&['assembly','packing'].includes(actor.delegationStage);
  const claim=/^orders\/[^/]+\/(claim|release)$/.test(path);
  const allowed=shared||barcode||(actor.delegationStage==='assembly'&&assembly)||(actor.delegationStage==='packing'&&packing)||(actor.delegationStage==='loading'&&loading)
    ||(claim&&['assembly','packing'].includes(actor.delegationStage)&&(!req.body?.stage||req.body.stage===actor.delegationStage));
  if(!allowed)throw new Error('This action is outside the delegated work stage');
  if(actor.delegationStage==='loading' && (req.params.id||req.params.loadingLineId)){
   const owner=(await(await db.getPool()).request().input('id',sql.UniqueIdentifier,req.params.id||null)
    .input('line',sql.UniqueIdentifier,req.params.loadingLineId||null).query(`SELECT s.CreatedByUserId,s.Status FROM dbo.DispatchLoadingSession s
      WHERE s.LoadingSessionId=@id OR EXISTS(SELECT 1 FROM dbo.DispatchLoadingLine l WHERE l.LoadingSessionId=s.LoadingSessionId AND l.LoadingLineId=@line)`)).recordset[0];
   if(!owner||String(owner.CreatedByUserId)!==String(actor.userId))throw new Error('This loading session belongs to another worker');
   if(req.method!=='GET'&&owner.Status!=='open')throw new Error('This loading session is already closed');
  }
  req.parentUser=req.user;req.user=actor;
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
   await(await db.getPool()).request().input('id',sql.NVarChar(100),actor.delegationId).input('worker',sql.NVarChar(100),String(actor.userId))
    .input('name',sql.NVarChar(200),actor.userName).input('details',sql.NVarChar(sql.MAX),JSON.stringify({parentUserId:actor.parentUserId,parentName:actor.parentName,workerCode:actor.workerCode,stage:actor.delegationStage,method:req.method,path:req.path}))
    .query("INSERT dbo.DispatchActionAudit(Action,EntityId,UserId,UserName,Details) VALUES('delegated-work-request',@id,@worker,@name,@details)");
  }
  next();
 }catch(e){res.status(403).json({error:e.message,code:'DISPATCH_DELEGATION'})}
}
