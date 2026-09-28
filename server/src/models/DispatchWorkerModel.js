import bcrypt from 'bcryptjs';
import {createHash,randomBytes} from 'node:crypto';
import {db,sql} from '../db/pool.js';
import {assertDelegateStage,workerInput,workerStages} from '../services/dispatchWorkerPolicy.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
export async function workers(){return (await(await db.getPool()).request().query('SELECT WorkerId,Code,Name,Assembly,Packing,Loading,Active,UpdatedAt FROM dbo.DispatchWorker ORDER BY Name')).recordset;}
export async function saveWorker(body,user){
 const clean=workerInput(body),id=body.workerId||null;
 if(!id&&!body.passcode)throw new Error('Set a passcode for the new worker');
 const password=body.passcode?await bcrypt.hash(String(body.passcode),12):null;
 const result=await(await db.getPool()).request().input('id',sql.UniqueIdentifier,id).input('code',sql.NVarChar(30),clean.code)
 .input('name',sql.NVarChar(150),clean.name).input('password',sql.NVarChar(100),password)
 .input('assembly',sql.Bit,body.assembly===true).input('packing',sql.Bit,body.packing===true).input('loading',sql.Bit,body.loading===true)
 .input('active',sql.Bit,body.active!==false).input('user',sql.NVarChar(100),String(user.userId)).query(`
 SET XACT_ABORT ON; BEGIN TRANSACTION;
 IF @id IS NULL BEGIN SET @id=NEWID(); INSERT dbo.DispatchWorker(WorkerId,Code,Name,PasscodeHash,Assembly,Packing,Loading,Active,UpdatedBy)
 VALUES(@id,@code,@name,@password,@assembly,@packing,@loading,@active,@user); END
 ELSE BEGIN IF EXISTS(SELECT 1 FROM dbo.DispatchWorker WHERE WorkerId=@id AND Code<>@code) THROW 50000,'Worker codes cannot be changed; deactivate and create a new worker',1;
 UPDATE dbo.DispatchWorker SET Name=@name,PasscodeHash=COALESCE(@password,PasscodeHash),Assembly=@assembly,Packing=@packing,Loading=@loading,
 Active=@active,Version=Version+1,FailedAttempts=0,LockedUntil=NULL,UpdatedBy=@user,UpdatedAt=SYSUTCDATETIME() WHERE WorkerId=@id;
 IF @@ROWCOUNT=0 THROW 50000,'Worker not found',1; END;
 INSERT dbo.DispatchActionAudit(Action,EntityId,UserId,Details) VALUES('dispatch-worker-setup',CONVERT(nvarchar(100),@id),@user,
 (SELECT @code Code,@name Name,@active Active,@assembly Assembly,@packing Packing,@loading Loading,CAST(CASE WHEN @password IS NULL THEN 0 ELSE 1 END AS bit) PasscodeReset FOR JSON PATH,WITHOUT_ARRAY_WRAPPER));
 COMMIT; SELECT @id WorkerId;`);
 return result.recordset[0];
}
export async function delegate(body,user){
 assertDelegateStage(user,body.stage);
 const code=String(body.code||'').trim().toUpperCase();
 if(!/^[A-Z0-9_-]{1,30}$/.test(code)||!/^\d{6,12}$/.test(String(body.passcode||'')))throw new Error('Invalid worker code or passcode');
 const tx=new sql.Transaction(await db.getPool());await tx.begin();
 let committed=false;
 try{
 const row=(await new sql.Request(tx).input('code',sql.NVarChar(30),code).query('SELECT * FROM dbo.DispatchWorker WITH(UPDLOCK,HOLDLOCK) WHERE Code=@code')).recordset[0];
 const field={assembly:'Assembly',packing:'Packing',loading:'Loading'}[body.stage];
 if(!row||!row.Active||!row[field]||row.LockedUntil&&new Date(row.LockedUntil)>new Date())throw new Error('Worker unavailable for this stage or temporarily locked');
 if(!await bcrypt.compare(String(body.passcode),row.PasscodeHash)){
  await new sql.Request(tx).input('id',sql.UniqueIdentifier,row.WorkerId).query('UPDATE dbo.DispatchWorker SET FailedAttempts=FailedAttempts+1,LockedUntil=CASE WHEN FailedAttempts>=4 THEN DATEADD(MINUTE,15,SYSUTCDATETIME()) ELSE NULL END WHERE WorkerId=@id');
  await tx.commit();committed=true;throw new Error('Invalid worker code or passcode');
 }
 const token=randomBytes(32).toString('hex');
 const r=await new sql.Request(tx).input('worker',sql.UniqueIdentifier,row.WorkerId).input('code',sql.NVarChar(30),row.Code)
 .input('name',sql.NVarChar(150),row.Name).input('parent',sql.NVarChar(100),String(user.userId)).input('parentName',sql.NVarChar(200),user.userName||'')
 .input('stage',sql.VarChar(10),body.stage).input('version',sql.Int,row.Version).input('hash',sql.VarChar(64),hash(token)).query(`
 UPDATE dbo.DispatchWorker SET FailedAttempts=0,LockedUntil=NULL WHERE WorkerId=@worker;
 INSERT dbo.DispatchDelegation(TokenHash,WorkerId,WorkerCode,WorkerName,ParentUserId,ParentName,Stage,WorkerVersion,ExpiresAt)
 OUTPUT inserted.DelegationId,inserted.ExpiresAt VALUES(@hash,@worker,@code,@name,@parent,@parentName,@stage,@version,DATEADD(HOUR,12,SYSUTCDATETIME()));`);
 await tx.commit();committed=true;
 return {token,workerId:row.WorkerId,code:row.Code,name:row.Name,stage:body.stage,...r.recordset[0]};
 }catch(e){if(!committed)await tx.rollback();throw e;}
}
export async function resolveDelegation(token,parent){
 if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid worker delegation');
 const row=(await(await db.getPool()).request().input('hash',sql.VarChar(64),hash(token)).input('parent',sql.NVarChar(100),String(parent.userId)).query(`
 SELECT d.* FROM dbo.DispatchDelegation d JOIN dbo.DispatchWorker w ON w.WorkerId=d.WorkerId
 WHERE d.TokenHash=@hash AND d.ParentUserId=@parent AND d.EndedAt IS NULL AND d.ExpiresAt>SYSUTCDATETIME()
 AND w.Active=1 AND w.Version=d.WorkerVersion`)).recordset[0];
 if(!row)throw new Error('Delegation expired or revoked. Enter the worker passcode again');
 assertDelegateStage(parent,row.Stage);
 return {...parent,userId:row.WorkerId,userName:row.WorkerName,role:workerStages[row.Stage],workerCode:row.WorkerCode,
 parentUserId:String(parent.userId),parentName:parent.userName||'',delegationId:row.DelegationId,delegationStage:row.Stage};
}
export async function endDelegation(token,parent){
 if(!/^[a-f0-9]{64}$/.test(String(token||'')))throw new Error('Invalid delegation');
 await(await db.getPool()).request().input('hash',sql.VarChar(64),hash(token)).input('parent',sql.NVarChar(100),String(parent.userId))
 .query('UPDATE dbo.DispatchDelegation SET EndedAt=SYSUTCDATETIME() WHERE TokenHash=@hash AND ParentUserId=@parent AND EndedAt IS NULL');
 return {ok:true};
}
export async function history(){return (await(await db.getPool()).request().query(`SELECT TOP(500) DelegationId,WorkerId,WorkerCode,WorkerName,ParentUserId,ParentName,Stage,StartedAt,ExpiresAt,EndedAt FROM dbo.DispatchDelegation ORDER BY StartedAt DESC`)).recordset;}
