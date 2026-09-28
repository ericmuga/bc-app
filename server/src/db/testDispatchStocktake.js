import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import XLSX from 'xlsx-js-style';
import {db,sql} from './pool.js';
import {migrateDispatchStocktake} from './dispatchStocktake.js';
import * as Stocktake from '../models/DispatchStocktakeModel.js';
import {exportExcel} from '../controllers/dispatchStocktakeController.js';

const owner={userId:'stocktake-test-'+randomUUID(),userName:'Stocktake test fixture',role:'chiller-attendant'};
let pool;
try {
  pool=await db.getPool();
  await migrateDispatchStocktake(pool);
  await migrateDispatchStocktake(pool); // Upgrade remains idempotent.
  const fixture=(await pool.request().query(`SELECT TOP(1) u.Company,u.ItemNo,u.Uom,m.Chiller
    FROM dbo.DispatchItemUom u JOIN dbo.DispatchItemRule r ON r.Company=u.Company AND r.ItemNo=u.ItemNo
    JOIN dbo.DispatchItemChiller m ON m.ItemNo=u.ItemNo WHERE u.KgPerUom>0 ORDER BY CASE WHEN u.Uom='PC' THEN 0 ELSE 1 END,u.Company,u.ItemNo`)).recordset[0];
  assert.ok(fixture,'Refresh dispatch item/UOM cache before running this integration test');
  const input={company:fixture.Company,chiller:fixture.Chiller,location:'TEST-'+randomUUID().slice(0,8)};
  const session=await Stocktake.start(input,owner),id=session.StocktakeId;
  await assert.rejects(()=>Stocktake.start(input,owner),/open stock take/);
  await assert.rejects(()=>Stocktake.complete(id,owner),/at least one/);
  const count={itemNo:fixture.ItemNo,uom:fixture.Uom,batchNo:'T123',quantity:2,revision:0};
  await assert.rejects(()=>Stocktake.saveCount(id,count,{userId:'someone-else',role:'chiller-attendant'}),/Only/);
  const results=await Promise.allSettled([Stocktake.saveCount(id,count,owner),Stocktake.saveCount(id,count,owner)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,'parallel duplicate saves cannot double-count');
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  let saved=await Stocktake.detail(id);
  assert.equal(saved.lines.length,1);assert.equal(saved.lines[0].Quantity,2);
  assert.ok(saved.lines[0].WeightKg>0);
  saved=await Stocktake.saveCount(id,{...count,quantity:0,revision:1},owner);
  assert.equal(saved.lines[0].Quantity,0);assert.equal(saved.lines[0].Revision,2);
  await assert.rejects(()=>Stocktake.saveCount(id,{...count,quantity:4,revision:1},owner),/changed/);
  const closed=await Stocktake.complete(id,owner);
  assert.ok(closed.CompletedAt);assert.equal(closed.ReconciliationStatus,'awaiting-intray');
  await assert.rejects(()=>Stocktake.saveCount(id,{...count,revision:2},owner),/read-only/);
  let exported;
  await exportExcel({params:{id}},{setHeader(){},send(buffer){exported=buffer},status(){return this},json(error){throw new Error(error.error)}});
  const workbook=XLSX.read(exported,{type:'buffer'});
  assert.deepEqual(workbook.SheetNames,['Session','Counts']);
  const rows=XLSX.utils.sheet_to_json(workbook.Sheets.Counts);
  assert.equal(rows[0]['Counted quantity'],0);assert.equal(rows[0]['Batch'],'T123');assert.equal(rows[0]['Session ID'],id);
  assert.ok((await Stocktake.list({company:fixture.Company,chiller:fixture.Chiller})).some(s=>s.StocktakeId===id));
  const audit=(await pool.request().input('id',sql.UniqueIdentifier,id).query('SELECT COUNT(*) Entries FROM dbo.DispatchStocktakeEvent WHERE StocktakeId=@id')).recordset[0];
  assert.equal(audit.Entries,3,'only successful count revisions and completion are audited');
  console.log('PASS: migration, duplicate sessions, concurrent counts, ownership, corrections, immutable completion, audit and Excel round-trip');
} finally {
  if(pool)await pool.request().input('user',sql.NVarChar(100),owner.userId).query(`
    DELETE e FROM dbo.DispatchStocktakeEvent e JOIN dbo.DispatchStocktake s ON s.StocktakeId=e.StocktakeId WHERE s.UserId=@user;
    DELETE l FROM dbo.DispatchStocktakeLine l JOIN dbo.DispatchStocktake s ON s.StocktakeId=l.StocktakeId WHERE s.UserId=@user;
    DELETE dbo.DispatchStocktake WHERE UserId=@user;`);
  await db.close();
}
