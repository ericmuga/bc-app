import 'dotenv/config';
import assert from 'node:assert/strict';
import {db,sql} from './pool.js';
import {nextDispatchNumber} from '../services/dispatchNumber.js';

let tx;
try {
  const pool=await db.getPool();
  tx=new sql.Transaction(pool);await tx.begin();
  // Rollback-only fixtures in a future date range: no business orders are changed.
  const date=new Date(2199,0,1),stem='DSP-21990101-';
  const occupied=(await new sql.Request(tx).input('stem',sql.NVarChar(30),stem+'%')
    .query('SELECT COUNT(*) N FROM dbo.DispatchOrder WHERE DispatchNo LIKE @stem')).recordset[0].N;
  assert.equal(occupied,0,'Fixture date must be unused');
  assert.equal(await nextDispatchNumber(tx,date),stem+'001');
  for(const suffix of ['998','999','1000','10000']) {
    await new sql.Request(tx).input('no',sql.NVarChar(30),stem+suffix)
      .query("INSERT dbo.DispatchOrder(DispatchNo,SourceType,OrderNo,CustomerName,Status) VALUES(@no,'bc',@no,'Numbering rollback test','pending')");
    assert.equal(await nextDispatchNumber(tx,date),stem+String(Number(suffix)+1).padStart(3,'0'));
  }
  const held=(await new sql.Request(tx).query("SELECT APPLOCK_MODE('public','dispatch-number-21990101','Transaction') Mode")).recordset[0].Mode;
  assert.equal(held,'Exclusive','allocation lock remains held until the insertion transaction ends');
  console.log('PASS: empty sequence, 999/1000 and 9999/10000 numeric boundaries, transaction-owned allocation lock');
} finally {
  if(tx)await tx.rollback();
  await db.close();
}
