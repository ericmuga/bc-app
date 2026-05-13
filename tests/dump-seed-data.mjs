/**
 * Dump bc-app master tables to JSON files for use as prime-pos seed data.
 * Reads creds from bc-app/server/.env (relative to this script).
 */
import sql from 'mssql';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', 'server', '.env') });

const TABLES = {
  pos_shop:         'SELECT [ShopId],[Code],[Name],[LocationCode],[SalespersonCode],[WalkInCustomerNo],[IsActive],[SortOrder] FROM dbo.PosShop',
  pos_category:     'SELECT [CategoryId],[Code],[Name],[SortOrder],[IsActive] FROM dbo.PosCategory',
  pos_item:         'SELECT [ItemId],[ItemNo] AS Code,[Description] AS Name,[CategoryCode],[Barcode] AS BarCodeNo,[EtimsItemCode],[EtimsItemClassCode] AS EtimsClassCode,[UnitOfMeasure],[UnitPrice],[VatPercent],[SourceCompany],[IsActive] FROM dbo.PosItem WHERE IsActive=1',
  pos_payment_type: 'SELECT * FROM dbo.PosPaymentType WHERE IsActive=1',
  pos_vat_rate:     'SELECT * FROM dbo.PosVatRate',
};

const OUT_DIR = process.argv[2] || 'F:/applications/prime-pos/server/src/db/seed-data';
mkdirSync(OUT_DIR, { recursive: true });

const pool = await sql.connect({
  server:   process.env.DB_HOST,
  port:     Number(process.env.DB_PORT || 1433),
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  options:  { encrypt: process.env.DB_ENCRYPT === 'true', trustServerCertificate: true },
});

for (const [name, query] of Object.entries(TABLES)) {
  const r = await pool.request().query(query);
  // Strip "Id" PKs so the seed inserts as new rows in target DB
  const rows = r.recordset.map(({ ShopId, CategoryId, ItemId, PaymentTypeId, VatRateId, ...rest }) => rest);
  const out = join(OUT_DIR, `${name}.json`);
  writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`${name}: ${rows.length} rows → ${out}`);
}

await pool.close();
process.exit(0);
