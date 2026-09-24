import bcrypt from 'bcryptjs';
import {db,sql} from '../db/pool.js';
import {bcDb} from '../db/bcPool.js';
import {bcTable,extCol} from '../services/bcTables.js';
import {authenticateAD} from '../services/ldap.js';

export async function verifySupervisor(username,password){
  if(!username||!password)throw new Error('Supervisor username and password are required');
  const name=String(username).trim().replace(/^.*\\/,'').replace(/@.*$/,'');
  const row=(await (await db.getPool()).request().input('name',sql.NVarChar(100),name)
    .query("SELECT UserId,Username,DisplayName,Role,PasswordHash,AuthProvider FROM dbo.Users WHERE Username=@name AND IsActive=1 AND Role IN ('admin','dispatch-supervisor')")).recordset[0];
  if(!row)throw new Error('Invalid supervisor credentials');
  if(row.AuthProvider==='AD'){
    const ad=await authenticateAD(row.Username,String(password));
    if(ad.samAccountName.toLowerCase()!==row.Username.toLowerCase())throw new Error('Invalid supervisor credentials');
  }else if(!row.PasswordHash || !await bcrypt.compare(String(password),row.PasswordHash))throw new Error('Invalid supervisor credentials');
  return {UserId:row.UserId,DisplayName:row.DisplayName};
}
export async function staff(){return (await (await db.getPool()).request().query(`SELECT UserId,Username,DisplayName,Role FROM dbo.Users
  WHERE IsActive=1 AND Role IN ('user','assembler','packer','checker','loader','dispatch-registry','chiller-attendant') ORDER BY DisplayName`)).recordset;}
export async function assignRole(id,role,user){
  if(!['assembler','packer','checker'].includes(role))throw new Error('Only assembler, packer or confirmer roles can be assigned here');
  const tx=new sql.Transaction(await db.getPool());await tx.begin();
  try{await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('role',sql.NVarChar(30),role).input('uid',sql.NVarChar(100),String(user.userId)).query(`
    UPDATE dbo.Users SET Role=@role WHERE UserId=@id AND IsActive=1 AND Role IN ('user','assembler','packer','checker','loader','dispatch-registry','chiller-attendant');
    IF @@ROWCOUNT=0 THROW 51000,'Only dispatch staff or unassigned users can be changed here',1;
    INSERT dbo.DispatchActionAudit(Action,EntityId,UserId,Details) VALUES('assign-dispatch-role',CONVERT(nvarchar(100),@id),@uid,@role);`);
    await tx.commit();return {ok:true};
  }catch(e){await tx.rollback();throw e;}
}
export async function correctBarcode(body,user){
  const company=String(body.company||'').toUpperCase(),item=String(body.itemNo||'').trim().toUpperCase(),barcode=String(body.barcode||'').trim();
  if(!item || !barcode || barcode.length>50 || /[\s\x00-\x1f]/.test(barcode))throw new Error('Enter an item and a barcode up to 50 characters without spaces');
  const bc=await bcDb.getPool(),app=await db.getPool();
  const table=bcTable(company,'Item',{coreExt:true}),col=extCol('Bar Code No_');
  const tx=new sql.Transaction(bc);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  let changed=[];
  try{
    const found=(await new sql.Request(tx).input('item',sql.NVarChar(30),item).input('barcode',sql.NVarChar(50),barcode)
      .query(`SELECT [No_] ItemNo,${col} Barcode FROM ${table} WITH(UPDLOCK,HOLDLOCK) WHERE [No_]=@item OR ${col}=@barcode`)).recordset;
    if(!found.some(r=>r.ItemNo.trim()===item))throw new Error('Item not found in this BC company');
    const conflicts=found.filter(r=>r.ItemNo.trim()!==item);
    if(conflicts.length&&body.reassign!==true)throw new Error(`Barcode belongs to ${conflicts.map(r=>r.ItemNo.trim()).join(', ')}. Confirm reassignment to move it`);
    changed=found.map(r=>({ItemNo:r.ItemNo.trim(),Previous:r.Barcode,Barcode:r.ItemNo.trim()===item?barcode:''}));
    await new sql.Request(tx).input('item',sql.NVarChar(30),item).input('barcode',sql.NVarChar(50),barcode)
      .query(`UPDATE ${table} SET ${col}=CASE WHEN [No_]=@item THEN @barcode ELSE '' END WHERE [No_]=@item OR ${col}=@barcode`);
    await tx.commit();
  }catch(e){await tx.rollback();throw e;}
  // BC is authoritative; item refresh also repairs the cache if this second write fails.
  const local=new sql.Transaction(app);await local.begin();
  try{
    await new sql.Request(local).input('co',sql.NVarChar(10),company).input('rows',sql.NVarChar(sql.MAX),JSON.stringify(changed))
      .input('uid',sql.NVarChar(100),String(user.userId)).input('item',sql.NVarChar(30),item).query(`
      UPDATE r SET Barcode=j.Barcode FROM dbo.DispatchItemRule r JOIN OPENJSON(@rows) WITH(ItemNo nvarchar(30),Barcode nvarchar(50)) j ON j.ItemNo=r.ItemNo WHERE r.Company=@co;
      UPDATE p SET Barcode=j.Barcode FROM dbo.PosItem p JOIN OPENJSON(@rows) WITH(ItemNo nvarchar(30),Barcode nvarchar(50)) j ON j.ItemNo=p.ItemNo WHERE p.SourceCompany=@co;
      UPDATE l SET Barcode=j.Barcode FROM dbo.DispatchOrderLine l JOIN dbo.DispatchOrder o ON o.DispatchOrderId=l.DispatchOrderId
        JOIN OPENJSON(@rows) WITH(ItemNo nvarchar(30),Barcode nvarchar(50)) j ON j.ItemNo=l.ItemNo
        LEFT JOIN dbo.PosItem p ON p.ItemNo=l.ItemNo WHERE COALESCE(NULLIF(o.Company,''),p.SourceCompany,'FCL')=@co AND o.Status NOT IN ('loaded');
      INSERT dbo.DispatchActionAudit(Action,EntityId,UserId,Details) VALUES('barcode-correction',@co+':'+@item,@uid,@rows);`);
    await local.commit();return {ok:true,changed};
  }catch(e){await local.rollback();throw new Error(`BC barcode updated, but the app cache could not refresh. Run Refresh BC item rules before scanning again: ${e.message}`);}
}
