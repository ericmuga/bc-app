import { readFileSync } from 'node:fs';
import { migrateDispatchSessions } from './dispatchSessions.js';
import { migrateDispatchPackingV2 } from './dispatchPackingV2.js';

// Idempotent upgrade; seed only once so deleted or edited mappings stay edited.
export async function migrateDispatchChillers(pool) {
  await migrateDispatchSessions(pool);
  if ((await pool.request().query("SELECT OBJECT_ID('dbo.DispatchBoxLine') Id")).recordset[0].Id) await migrateDispatchPackingV2(pool);
  await pool.request().query(`
    IF OBJECT_ID('dbo.DispatchChillerConfig') IS NULL
      CREATE TABLE dbo.DispatchChillerConfig (Id int NOT NULL PRIMARY KEY CHECK (Id=1),
        BypassAssignment bit NOT NULL DEFAULT 0, StockCompany nvarchar(10) NOT NULL DEFAULT 'FCL',
        StockLocation nvarchar(20) NOT NULL DEFAULT '3535', Seeded bit NOT NULL DEFAULT 0);
    IF NOT EXISTS (SELECT 1 FROM dbo.DispatchChillerConfig WHERE Id=1)
      INSERT dbo.DispatchChillerConfig (Id) VALUES (1);
    IF OBJECT_ID('dbo.DispatchItemChiller') IS NULL
      CREATE TABLE dbo.DispatchItemChiller (ItemNo nvarchar(30) NOT NULL PRIMARY KEY,
        Description nvarchar(250) NOT NULL, Chiller nvarchar(50) NOT NULL);
    IF COL_LENGTH('dbo.DispatchAssemblyLine','Completed') IS NULL
      ALTER TABLE dbo.DispatchAssemblyLine ADD Completed bit NOT NULL DEFAULT 0;
    IF COL_LENGTH('dbo.DispatchAssemblyLine','Chiller') IS NULL
      ALTER TABLE dbo.DispatchAssemblyLine ADD Chiller nvarchar(50) NULL;
  `);
  const seed = JSON.parse(readFileSync(new URL('../data/dispatch-chillers.json', import.meta.url), 'utf8'));
  // Static, repository-owned seed values only; escape literals for the migration.
  const literal = v => "N'" + v.replaceAll("'", "''") + "'";
  await pool.request().query(`SET XACT_ABORT ON; BEGIN TRANSACTION;
    IF EXISTS (SELECT 1 FROM dbo.DispatchChillerConfig WITH (UPDLOCK,HOLDLOCK) WHERE Id=1 AND Seeded=0)
    BEGIN
      INSERT dbo.DispatchItemChiller (ItemNo,Description,Chiller) VALUES
      ${seed.map(r => `(${literal(r.itemNo)},${literal(r.description)},${literal(r.chiller)})`).join(',')};
      UPDATE dbo.DispatchChillerConfig SET Seeded=1 WHERE Id=1;
    END; COMMIT;`);
}
