import {getDispatchBcPool,dispatchBcTarget} from '../db/dispatchBcPool.js';
import {trackSync} from './DispatchSyncModel.js';
import {packedPayload,packedHash,compareStaging} from '../services/dispatchPackedPayload.js';
import {db,sql} from '../db/pool.js';
import {ALL_COMPANIES,bcTable} from '../services/bcTables.js';
// Preview uses the imported BC line number (SortOrder), not just the item number.
export async function packedExportPreview(company,transaction=null,orderId=null){
 if(!ALL_COMPANIES.includes(company))throw new Error('Select a BC company');
 const request=transaction?new sql.Request(transaction):(await db.getPool()).request();
 const rows=(await request.input('company',sql.NVarChar(10),company).input('orderId',sql.UniqueIdentifier,orderId).query(`
 SELECT o.DispatchOrderId,o.Company,o.OrderNo,o.CustomerNo,o.CustomerName,l.LineId,l.SortOrder BcLineNo,l.ItemNo,l.Description,l.Uom,l.OrderQty,
   COALESCE(p.PackedQty,0) PackedQty,COALESCE(p.Pieces,0) Pieces,COALESCE(p.WeightKg,0) WeightKg,p.LastPackedAt,a.ReturnReasonCode,
   COALESCE(NULLIF(pu.Username,''),NULLIF(last.PackedByName,''),NULLIF(au.Username,''),a.AssembledByName) PackedUser,
   exported.PayloadHash,exported.SyncedAt,
   CASE WHEN l.SortOrder IS NULL OR l.SortOrder<=0 THEN 'Missing BC line number' ELSE 'Packed - ready for BC comparison' END Readiness
 FROM dbo.DispatchOrder o JOIN dbo.DispatchOrderLine l ON l.DispatchOrderId=o.DispatchOrderId
 LEFT JOIN dbo.DispatchAssemblyLine a ON a.LineId=l.LineId
 LEFT JOIN dbo.Users au ON CONVERT(nvarchar(100),au.UserId)=a.AssembledByUserId
 LEFT JOIN dbo.DispatchPackedExport exported ON exported.LineId=l.LineId
 OUTER APPLY(SELECT TOP(1) bl.PackedByUserId,bl.PackedByName FROM dbo.DispatchBoxLine bl JOIN dbo.DispatchBox b ON b.BoxId=bl.BoxId
   WHERE bl.LineId=l.LineId AND bl.VoidedAt IS NULL AND b.Status IN ('closed','loaded') ORDER BY bl.CreatedAt DESC,bl.BoxLineId) last
 LEFT JOIN dbo.Users pu ON CONVERT(nvarchar(100),pu.UserId)=last.PackedByUserId
 OUTER APPLY(SELECT SUM(bl.Qty) PackedQty,SUM(bl.Pieces) Pieces,SUM(bl.Weight) WeightKg,MAX(b.ClosedAt) LastPackedAt
   FROM dbo.DispatchBoxLine bl JOIN dbo.DispatchBox b ON b.BoxId=bl.BoxId
   WHERE bl.LineId=l.LineId AND bl.VoidedAt IS NULL AND b.Status IN ('closed','loaded')) p
 WHERE (@orderId IS NULL OR o.DispatchOrderId=@orderId) AND o.SourceType='bc' AND o.Company=@company AND o.Packed=1 AND o.Status IN ('packed','loaded')
 ORDER BY o.OrderNo,l.SortOrder`)).recordset;
 return rows.map(row=>{try{const payload=packedPayload(row),hash=packedHash(payload);return {...row,Payload:payload,CurrentHash:hash,Readiness:hash===row.PayloadHash?'Exported':row.PayloadHash?'Changed since export':'Pending export'}}catch(e){return {...row,Readiness:e.message,ExportError:e.message}}});
}

const quote=name=>'['+name.replaceAll(']',']]')+']';
export async function inspectImportedAssemblies(pool,company){
 const table=bcTable(company,'Imported Assemblies',{ext:true});
 const cols=(await pool.request().input('table',sql.NVarChar(300),table).query(`SELECT c.name Name,t.name Type,c.max_length MaxLength,c.precision Precision,c.scale Scale,c.is_nullable Nullable,c.is_identity IsIdentity,c.is_computed IsComputed,c.default_object_id DefaultId
 FROM sys.columns c JOIN sys.types t ON t.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(@table)`)).recordset;
 if(!cols.length)throw new Error(`Imported Assemblies is not published or accessible for ${company} on ${dispatchBcTarget().server}/${dispatchBcTarget().database}`);
 const mapped=['Document No_','Line No_','Item No_','Quantity','User ID','Return Reason Code','Executed','Error Message'];
 for(const name of [...mapped,'Status','Executed At'])if(!cols.some(c=>c.Name===name))throw new Error(`Imported Assemblies is missing column ${name}`);
 // Status and Executed At must use BC's own defaults; never guess its enum value.
 const supplied=new Set([...mapped,'$systemId','$systemCreatedAt','$systemModifiedAt']);
 const missing=cols.filter(c=>!supplied.has(c.Name)&&!c.Nullable&&!c.DefaultId&&!c.IsIdentity&&!c.IsComputed&&!['timestamp','rowversion'].includes(c.Type));
 if(missing.length)throw new Error(`BC table requires defaults for: ${missing.map(c=>c.Name).join(', ')}. Publish the BC defaults before syncing`);
 return {table,cols};
}
export function bindImportedPayload(request,payload,cols){
 const params=[];
 for(const [name,value] of Object.entries(payload)){
  const col=cols.find(c=>c.Name===name);if(!col)throw new Error(`Missing BC column ${name}`);
  let type;
  if(['nvarchar','varchar','nchar','char'].includes(col.Type)){
   const max=col.MaxLength===-1?sql.MAX:col.MaxLength/(col.Type.startsWith('n')?2:1);
   if(max!==sql.MAX&&String(value).length>max)throw new Error(`${name} exceeds BC length ${max}`);
   type=col.Type.startsWith('n')?sql.NVarChar(max):sql.VarChar(max);
  }else if(['decimal','numeric'].includes(col.Type))type=sql.Decimal(col.Precision,col.Scale);
  else if(col.Type==='int')type=sql.Int;
  else if(col.Type==='bigint')type=sql.BigInt;
  else if(col.Type==='bit')type=sql.Bit;
  else throw new Error(`Unsupported BC type for ${name}: ${col.Type}`);
  const param='v'+params.length;request.input(param,type,value);params.push({name,param:'@'+param});
 }
 return params;
}
async function exportOrder(company,orderId,user,bc,schema){
 const appTx=new sql.Transaction(await db.getPool());await appTx.begin();let bcTx,bcCommitted=false,newIntent=false;
 try{
  const order=(await new sql.Request(appTx).input('id',sql.UniqueIdentifier,orderId).query('SELECT * FROM dbo.DispatchOrder WITH(UPDLOCK,HOLDLOCK) WHERE DispatchOrderId=@id')).recordset[0];
  if(!order?.Packed||order.Company!==company||!['packed','loaded'].includes(order.Status))throw new Error('Order is no longer fully packed');
  const rows=await packedExportPreview(company,appTx,orderId);
  if(rows.some(r=>r.ExportError))throw new Error(rows.find(r=>r.ExportError).ExportError);
  if(new Set(rows.map(r=>r.BcLineNo)).size!==rows.length)throw new Error('Duplicate BC line numbers on the dispatch order');
  const changed=rows.filter(r=>r.CurrentHash!==r.PayloadHash);if(!changed.length){await appTx.commit();return {exported:0,skipped:rows.length};}
  const intent=(await (await db.getPool()).request().input('id',sql.UniqueIdentifier,orderId).query(`SELECT DispatchOrderId FROM dbo.DispatchPackedExportIntent WHERE DispatchOrderId=@id`)).recordset[0];
  if(!intent){await (await db.getPool()).request().input('id',sql.UniqueIdentifier,orderId).query('INSERT dbo.DispatchPackedExportIntent(DispatchOrderId) VALUES(@id)');newIntent=true;}
  bcTx=new sql.Transaction(bc);await bcTx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  for(const row of changed){
   const source=(await new sql.Request(bcTx).input('doc',sql.NVarChar(40),row.OrderNo).input('line',sql.Int,row.BcLineNo).query(`SELECT [No_] ItemNo,[Unit of Measure Code] Uom,[Quantity Shipped] Shipped FROM ${bcTable(company,'Sales Line')} WITH(UPDLOCK,HOLDLOCK) WHERE [Document Type]=1 AND [Document No_]=@doc AND [Line No_]=@line`)).recordset[0];
   if(!source||source.ItemNo.trim()!==row.ItemNo.trim()||source.Uom.trim()!==row.Uom.trim())throw new Error(`BC line ${row.BcLineNo} no longer matches the item/UOM`);
   const existing=(await new sql.Request(bcTx).input('doc',sql.NVarChar(40),row.OrderNo).input('line',sql.Int,row.BcLineNo).query(`SELECT * FROM ${schema.table} WITH(UPDLOCK,HOLDLOCK) WHERE [Document No_]=@doc AND [Line No_]=@line`)).recordset;
   if(existing.length>1)throw new Error('Multiple BC staging rows match this order line');
   if(!existing.length&&intent)throw new Error('An earlier export was interrupted and the BC row is absent. Reconcile it in BC before retrying');
   const operation=compareStaging(existing[0],row.Payload,!!row.PayloadHash);
   if(operation!=='unchanged'){
    if(Number(source.Shipped)!==0)throw new Error('BC line already has shipped quantity; review in BC before exporting');
    const request=new sql.Request(bcTx),payload=operation==='insert'?{...row.Payload,Executed:false,'Error Message':''}:row.Payload;
    const params=bindImportedPayload(request,payload,schema.cols);
    if(operation==='insert'){
     const extras=schema.cols.filter(c=>['$systemId','$systemCreatedAt','$systemModifiedAt'].includes(c.Name));
     await request.query(`INSERT ${schema.table} (${[...params.map(p=>quote(p.name)),...extras.map(c=>quote(c.Name))].join(',')}) VALUES (${[...params.map(p=>p.param),...extras.map(c=>c.Name==='$systemId'?'NEWID()':'SYSUTCDATETIME()')].join(',')})`);
    }else{
     const keys=new Set(['Document No_','Line No_']);
     const modified=schema.cols.some(c=>c.Name==='$systemModifiedAt')?',[$systemModifiedAt]=SYSUTCDATETIME()':'';
     await request.query(`UPDATE ${schema.table} SET ${params.filter(p=>!keys.has(p.name)).map(p=>quote(p.name)+'='+p.param).join(',')}${modified} WHERE [Document No_]=@v0 AND [Line No_]=@v1 AND Executed=0`);
    }
   }
  }
  await bcTx.commit();bcCommitted=true;bcTx=null;
  for(const row of changed)await new sql.Request(appTx).input('line',sql.UniqueIdentifier,row.LineId).input('company',sql.NVarChar(10),company).input('hash',sql.VarChar(64),row.CurrentHash).input('payload',sql.NVarChar(sql.MAX),JSON.stringify(row.Payload)).input('user',sql.NVarChar(100),String(user.userId)).query(`
   MERGE dbo.DispatchPackedExport WITH(HOLDLOCK) t USING(SELECT @line LineId)s ON t.LineId=s.LineId
   WHEN MATCHED THEN UPDATE SET PayloadHash=@hash,Payload=@payload,SyncedAt=GETUTCDATE(),SyncedBy=@user
   WHEN NOT MATCHED THEN INSERT(LineId,Company,PayloadHash,Payload,SyncedBy) VALUES(@line,@company,@hash,@payload,@user);`);
  await new sql.Request(appTx).input('id',sql.UniqueIdentifier,orderId).query('DELETE dbo.DispatchPackedExportIntent WHERE DispatchOrderId=@id');
  await appTx.commit();return {exported:changed.length,skipped:rows.length-changed.length};
 }catch(e){let rolledBack=false;if(bcTx)try{await bcTx.rollback();rolledBack=true}catch{}try{await appTx.rollback()}catch{}
  if(newIntent&&rolledBack&&!bcCommitted)await (await db.getPool()).request().input('id',sql.UniqueIdentifier,orderId).query('DELETE dbo.DispatchPackedExportIntent WHERE DispatchOrderId=@id');
  throw e;}

}
export async function pushPackedOrders(company,user,trigger='manual'){
 if(!ALL_COMPANIES.includes(company))throw new Error('Select a BC company');
 const lock=new sql.Transaction(await db.getPool());await lock.begin();
 try{
  const result=await new sql.Request(lock).input('key',sql.NVarChar(200),'dispatch-packed-export-'+company).query("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=@key,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=0; SELECT @r Result");
  if(result.recordset[0].Result<0)throw new Error('A packed-order push is already running for this company');
  const output=await trackSync('BC packed orders',async()=>{
   const bc=await getDispatchBcPool(),schema=await inspectImportedAssemblies(bc,company);
   const candidates=await packedExportPreview(company),orderIds=[...new Set(candidates.filter(r=>r.Readiness!=='Exported').map(r=>r.DispatchOrderId))];
   const result={company,exported:0,skipped:candidates.filter(r=>r.Readiness==='Exported').length,errors:[],orders:orderIds.length};
   // One transaction per order, processed sequentially in bounded groups.
   for(let start=0;start<orderIds.length;start+=25)for(const id of orderIds.slice(start,start+25)){
    try{const done=await exportOrder(company,id,user,bc,schema);result.exported+=done.exported;result.skipped+=done.skipped;}
    catch(e){result.errors.push({company,orderNo:candidates.find(r=>r.DispatchOrderId===id)?.OrderNo,error:e.message});}
   }
   return result;
  },{trigger,companies:[company],userId:String(user.userId),target:dispatchBcTarget()});
  await lock.commit();return output;
 }catch(e){try{await lock.rollback()}catch{}throw e;}
}
