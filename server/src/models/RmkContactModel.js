import { db, sql } from '../db/pool.js';
import { bcDb } from '../db/bcPool.js';
import { bcTable, extCol } from '../services/bcTables.js';

// Company-specific cache: contact numbers can overlap across BC companies.
// Read every RMK contact, including those without a salesperson, in bounded batches.
export async function syncRmkContacts() {
  const source = await bcDb.getPool();
  const rows = [];
  let after = '';
  while (true) {
    const batch = (await source.request().input('after', sql.NVarChar(20), after).query(`
      SELECT TOP (500) c.[No_] BcContactNo,c.Name,
        COALESCE(NULLIF(c.[Mobile Phone No_],''),c.[Phone No_]) MobileNo,c.[E-Mail] Email,
        COALESCE(NULLIF(c.[Telex Answer Back],''),c.[VAT Registration No_]) KraPin,
        c.[Salesperson Code] SalespersonCode,x.${extCol('Route Code')} RouteCode,
        CASE WHEN c.Type=1 THEN 'Person' ELSE 'Company' END CustomerType,c.[Company Name] CompanyName
      FROM ${bcTable('RMK','Contact')} c
      LEFT JOIN ${bcTable('RMK','Contact',{coreExt:true})} x ON x.[No_]=c.[No_]
      WHERE c.[No_]>@after AND ISNULL(c.[Privacy Blocked],0)=0 ORDER BY c.[No_]`)).recordset;
    if (!batch.length) break;
    rows.push(...batch);
    after = batch[batch.length - 1].BcContactNo;
  }
  const tx = new sql.Transaction(await db.getPool());
  await tx.begin();
  try {
    // Atomic cache replacement also removes contacts now privacy-blocked in BC.
    await new sql.Request(tx).query('DELETE FROM dbo.PosRmkContact WITH (TABLOCKX)');
    for (let i=0; i<rows.length; i+=500) {
      await new sql.Request(tx).input('rows', sql.NVarChar(sql.MAX), JSON.stringify(rows.slice(i,i+500))).query(`
        INSERT dbo.PosRmkContact (BcContactNo,Name,MobileNo,Email,KraPin,SalespersonCode,RouteCode,CustomerType,CompanyName)
        SELECT BcContactNo,Name,MobileNo,Email,KraPin,SalespersonCode,RouteCode,CustomerType,CompanyName
        FROM OPENJSON(@rows) WITH (BcContactNo nvarchar(20),Name nvarchar(200),MobileNo nvarchar(100),
          Email nvarchar(200),KraPin nvarchar(100),SalespersonCode nvarchar(20),RouteCode nvarchar(100),
          CustomerType nvarchar(20),CompanyName nvarchar(200));`);
    }
    await tx.commit();
    return { count: rows.length, errors: [], sharedAcrossCompany: 'RMK' };
  } catch (error) { await tx.rollback(); throw error; }
}

export async function listSharedRmkContacts(shopCode) {
  if (!shopCode) return null;
  const pool = await db.getPool();
  const req = pool.request().input('shop', sql.NVarChar(50), shopCode);
  const eligible = (await req.query(`SELECT 1 Eligible FROM dbo.PosShop s WHERE s.Code=@shop AND s.IsActive=1
    AND (NULLIF(s.RmkCustomerNo,'') IS NOT NULL OR EXISTS (SELECT 1 FROM dbo.PosShopCompany c
      WHERE c.ShopCode=s.Code AND c.Company='RMK' AND c.IsActive=1))`)).recordset.length;
  if (!eligible) return null;
  const shared = (await pool.request().query(`SELECT *,CAST(0 AS bit) IsWalkIn,CAST(1 AS bit) IsActive FROM dbo.PosRmkContact ORDER BY Name,BcContactNo`)).recordset;
  const local = (await pool.request().query(`SELECT c.* FROM dbo.PosContact c
    JOIN dbo.PosShop s ON s.Code=c.ShopCode
    WHERE c.IsActive=1 AND (c.IsLocalOnly=1 OR (c.IsWalkIn=1 AND c.CompanyName='RMK'))
      AND (NULLIF(s.RmkCustomerNo,'') IS NOT NULL OR EXISTS (SELECT 1 FROM dbo.PosShopCompany m
        WHERE m.ShopCode=s.Code AND m.Company='RMK' AND m.IsActive=1))`)).recordset;
  const byNo = new Map(local.map(c => [c.BcContactNo.trim().toUpperCase(),c]));
  for (const c of shared) byNo.set(c.BcContactNo.trim().toUpperCase(),c);
  return [...byNo.values()].sort((a,b) => a.Name.localeCompare(b.Name));
}
