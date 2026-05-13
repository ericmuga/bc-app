/**
 * db/cleanup-pos.js
 * One-shot cleanup of bad POS items.
 *
 * Run: node src/db/cleanup-pos.js
 *
 * Removes:
 *   1. Items with no price (UnitPrice <= 0 OR NULL)
 *   2. Items whose description contains "Test" (case-insensitive, word match)
 *   3. Items whose description contains "Discontinued" (case-insensitive)
 *   4. The SP-SPARE inventory posting group + every item belonging to it
 *
 * Safe to re-run. Cascades through stock movements / favourites / special prices
 * so referential integrity is maintained.
 */

import sql from 'mssql';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  server:   process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME || 'BCApp',
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt:                process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    enableArithAbort:       true,
  },
};

async function main() {
  console.log(`Connecting to ${config.server}:${config.port}/${config.database}…`);
  const pool = await sql.connect(config);

  // 1. Pick the offending items
  const targetsQ = await pool.request().query(`
    SELECT [ItemId], [ItemNo], [Description], [UnitPrice], [CategoryCode]
    FROM   [dbo].[PosItem]
    WHERE
         (UnitPrice IS NULL OR UnitPrice <= 0)
      OR (Description LIKE '%test%')
      OR (Description LIKE '%discontinued%')
      OR (UPPER(ISNULL(CategoryCode,'')) = 'SP-SPARE')
  `);

  const targets = targetsQ.recordset;
  console.log(`Found ${targets.length} item(s) to remove.`);
  if (!targets.length) {
    console.log('Nothing to do.');
    await pool.close();
    return;
  }

  for (const it of targets) {
    console.log(`  - ${it.ItemNo}  ${it.Description}  (price=${it.UnitPrice}, cat=${it.CategoryCode || ''})`);
  }

  // 2. Cascade-delete dependents, then the items themselves.
  const itemNos = targets.map(t => t.ItemNo);
  const itemIds = targets.map(t => t.ItemId);

  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const dropDependentsByNo = async (table, col) => {
      const r = new sql.Request(tx);
      itemNos.forEach((no, i) => r.input(`n${i}`, sql.NVarChar(30), no));
      const params = itemNos.map((_, i) => `@n${i}`).join(',');
      const res = await r.query(`DELETE FROM [dbo].[${table}] WHERE [${col}] IN (${params})`);
      console.log(`  · ${table}: ${res.rowsAffected[0]} row(s) removed`);
    };
    // Dependents that reference the item by ItemNo
    await dropDependentsByNo('PosFavourite',              'ItemNo');
    await dropDependentsByNo('PosStockMovement',          'ItemNo');
    await dropDependentsByNo('PosOrderLine',              'ItemNo');
    await dropDependentsByNo('PosManualSale',             'ItemNo');
    await dropDependentsByNo('PosWriteOff',               'ItemNo');
    await dropDependentsByNo('PosThirdPartyTransferLine', 'ItemNo');
    await dropDependentsByNo('PosPortioningLine',         'ItemNo');
    await dropDependentsByNo('PosStockRequestLine',       'ItemNo');
    await dropDependentsByNo('PosStockTakeLine',          'ItemNo');
    await dropDependentsByNo('PosSpecialPrice',           'ItemNo');

    // Now the items themselves
    {
      const r = new sql.Request(tx);
      itemIds.forEach((id, i) => r.input(`i${i}`, sql.UniqueIdentifier, id));
      const params = itemIds.map((_, i) => `@i${i}`).join(',');
      const res = await r.query(`DELETE FROM [dbo].[PosItem] WHERE [ItemId] IN (${params})`);
      console.log(`  · PosItem: ${res.rowsAffected[0]} row(s) removed`);
    }

    // 3. Drop the SP-SPARE category itself if present
    const catRes = await new sql.Request(tx).query(`
      DELETE FROM [dbo].[PosCategory] WHERE UPPER([Code]) = 'SP-SPARE'
    `);
    console.log(`  · PosCategory(SP-SPARE): ${catRes.rowsAffected[0]} row(s) removed`);

    await tx.commit();
    console.log('Cleanup committed.');
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  await pool.close();
}

main()
  .then(() => { console.log('Done.'); process.exit(0); })
  .catch(err => { console.error('Cleanup failed:', err); process.exit(1); });
