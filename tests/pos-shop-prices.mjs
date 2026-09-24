import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { priceWindowSql, pricePrioritySql } from '../server/src/services/posPricePolicy.js';

// Opt-in integration tests use a SQL table variable only; no application rows change.
const enabled = process.env.POS_PRICE_SQL_TEST === '1';
let db, sql;
after(async () => { if (db) await db.close(); });
async function effectivePrice(day, extra = '') {
  ({db, sql} = await import('../server/src/db/pool.js'));
  const p = await db.getPool();
  const r = await p.request().input('priceDate',sql.Date,day).query(`
    DECLARE @prices TABLE (SpecialPriceId int,ShopCode varchar(20),Source varchar(20),
      UnitPrice decimal(18,4),StartingDate date,EndingDate date,IsActive bit);
    INSERT @prices VALUES
      (1,'167','BC',100,'2026-01-01',NULL,1),
      (2,'167','BC_CUSTOMER',120,'2026-09-10','2026-09-20',1),
      (3,'215','BC_CUSTOMER',5,'2026-01-01',NULL,1),
      (4,'167','BC_CUSTOMER',1,'2026-09-10',NULL,0);
    ${extra}
    SELECT TOP 1 sp.UnitPrice FROM @prices sp WHERE ${priceWindowSql}
      AND (sp.ShopCode IS NULL OR sp.ShopCode='167') ORDER BY ${pricePrioritySql};`);
  return r.recordset[0]?.UnitPrice ?? null;
}
for (const [name,date,expected] of [
  ['customer price wins even when higher than group','2026-09-15',120],
  ['start date is inclusive','2026-09-10',120],
  ['end date is inclusive','2026-09-20',120],
  ['future customer price falls back to group','2026-09-09',100],
  ['expired customer price falls back to group','2026-09-21',100],
  ['no valid offer leaves item-card fallback','2025-12-31',null],
]) test(name,{skip:!enabled},async () => assert.equal(await effectivePrice(date),expected));
test('manual shop offer remains an explicit override',{skip:!enabled},async () => {
  assert.equal(await effectivePrice('2026-09-15',`INSERT @prices VALUES (5,'167','MANUAL',90,'2026-01-01',NULL,1);`),90);
});
test('newest valid customer price wins overlapping windows',{skip:!enabled},async () => {
  assert.equal(await effectivePrice('2026-09-15',`INSERT @prices VALUES (5,'167','BC_CUSTOMER',130,'2026-09-12',NULL,1);`),130);
});
test('a newer group price does not displace a valid customer price',{skip:!enabled},async () => {
  assert.equal(await effectivePrice('2026-09-15',`INSERT @prices VALUES (5,'167','BC',80,'2026-09-14',NULL,1);`),120);
});
