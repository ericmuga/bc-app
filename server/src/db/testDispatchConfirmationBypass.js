import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {db,sql} from './pool.js';
import {migrateDispatchChillers} from './dispatchChillers.js';
import {applyConfirmationBypass} from '../models/DispatchConfirmationBypass.js';
let tx;
try{
 const pool=await db.getPool();await migrateDispatchChillers(pool);
 tx=new sql.Transaction(pool);await tx.begin();
 const id=randomUUID();
 await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).input('no',sql.NVarChar(30),'TEST-'+id.slice(0,20)).query(`
 INSERT dbo.DispatchOrder(DispatchOrderId,DispatchNo,SourceType,OrderNo,Status) VALUES(@id,@no,'bc',@no,'pending');
 INSERT dbo.DispatchOrderPart(DispatchOrderId,Part,Active) VALUES(@id,'A',1);
 UPDATE dbo.DispatchChillerConfig SET BypassConfirmation=0 WHERE Id=1;`);
 assert.equal(await applyConfirmationBypass(tx,id),0);
 await new sql.Request(tx).query('UPDATE dbo.DispatchChillerConfig SET BypassConfirmation=1 WHERE Id=1');
 assert.equal(await applyConfirmationBypass(tx,id),1);
 assert.equal(await applyConfirmationBypass(tx,id),0);
 const row=(await new sql.Request(tx).input('id',sql.UniqueIdentifier,id).query(`SELECT o.Confirmed,o.Status,o.ConfirmationBypassed,p.Confirmed PartConfirmed,p.ConfirmationBypassed PartBypassed,p.ConfirmedByUserId
 FROM dbo.DispatchOrder o JOIN dbo.DispatchOrderPart p ON p.DispatchOrderId=o.DispatchOrderId WHERE o.DispatchOrderId=@id`)).recordset[0];
 assert.equal(row.Status,'confirmed');assert.ok(row.Confirmed&&row.ConfirmationBypassed&&row.PartConfirmed&&row.PartBypassed);assert.equal(row.ConfirmedByUserId,null);
 await new sql.Request(tx).query('UPDATE dbo.DispatchChillerConfig SET BypassConfirmation=0 WHERE Id=1');
 assert.equal(await applyConfirmationBypass(tx,id),0);
 console.log('PASS: disabled setting, release, bypass markers, idempotency and no fabricated human confirmation; all fixtures/settings rolled back');
}finally{if(tx)await tx.rollback();await db.close();}
