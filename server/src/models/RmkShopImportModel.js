import { db, sql } from '../db/pool.js';
import { bcDb } from '../db/bcPool.js';
import { bcTable, extCol } from '../services/bcTables.js';
import { planRmkShops, RMK_SHOP_CUSTOMER_TYPE } from '../services/rmkShopPlan.js';

export async function listRmkShopCustomers() {
  const pool = await bcDb.getPool();
  const result = await pool.request().input('shopType', sql.Int, RMK_SHOP_CUSTOMER_TYPE).query(`
    SELECT c.[No_] No,c.[Name],c.[Salesperson Code] SalespersonCode,c.[Location Code] LocationCode,
      c.[Customer Price Group] CustomerPriceGroup,c.[VAT Bus_ Posting Group] VatBusPostingGroup,
      c.[E-Mail] Email,COALESCE(NULLIF(c.[Mobile Phone No_],''),c.[Phone No_]) MobileNo,
      COALESCE(NULLIF(LTRIM(RTRIM(c.[Telex Answer Back])),''),c.[VAT Registration No_]) KraPin
    FROM ${bcTable('RMK', 'Customer')} c
    JOIN ${bcTable('RMK', 'Customer', { coreExt: true })} x ON x.[No_]=c.[No_]
    WHERE x.${extCol('Customer Type')}=@shopType AND c.[Blocked]=0 AND c.[Privacy Blocked]=0
    ORDER BY c.[No_]`);
  return result.recordset.map(row => Object.fromEntries(Object.entries(row).map(([k,v]) => [k, typeof v === 'string' ? v.trim() : v])));
}

// One additive transaction for shops, RMK company mappings and POS customers.
// Never clears walk-ins or user assignments belonging to other companies.
export async function syncRmkShops({ dryRun = false } = {}) {
  const customers = await listRmkShopCustomers();
  const pool = await db.getPool();
  if (dryRun) {
    const existing = (await pool.request().query('SELECT Code,Name,RmkCustomerNo FROM dbo.PosShop')).recordset;
    return { dryRun: true, shops: planRmkShops(customers, existing), count: customers.length, errors: [] };
  }
  const tx = new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    await new sql.Request(tx).query(`DECLARE @r int;
      EXEC @r=sys.sp_getapplock @Resource='BCConsole-RMK-Shop-Import',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=15000;
      IF @r<0 THROW 51000,'RMK shop import is already running',1;`);
    const existing = (await new sql.Request(tx).query('SELECT Code,Name,RmkCustomerNo FROM dbo.PosShop WITH (UPDLOCK,HOLDLOCK)')).recordset;
    const plan = planRmkShops(customers, existing);
    for (const row of plan) {
      await new sql.Request(tx)
        .input('code', sql.NVarChar(50), row.Code).input('customer', sql.NVarChar(20), row.No)
        .input('name', sql.NVarChar(200), row.Name).input('location', sql.NVarChar(20), row.LocationCode || null)
        .input('salesperson', sql.NVarChar(20), row.SalespersonCode || null)
        .input('priceGroup', sql.NVarChar(50), row.CustomerPriceGroup || null)
        .input('vatGroup', sql.NVarChar(50), row.VatBusPostingGroup || null)
        .input('email', sql.NVarChar(200), row.Email || null).input('phone', sql.NVarChar(30), row.MobileNo || null)
        .input('pin', sql.NVarChar(30), row.KraPin || null)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.PosContact WITH (UPDLOCK,HOLDLOCK) WHERE BcContactNo=@customer
            AND (ISNULL(ShopCode,'')<>@code OR ISNULL(CompanyName,'') NOT IN ('','RMK')))
            THROW 51001,'RMK customer conflicts with an existing POS contact; check its company mapping',1;
          MERGE dbo.PosShop WITH (HOLDLOCK) AS t USING (SELECT @code Code) s ON t.Code=s.Code
          WHEN MATCHED THEN UPDATE SET RmkCustomerNo=@customer,UpdatedAt=GETUTCDATE()
          WHEN NOT MATCHED THEN INSERT (Code,Name,LocationCode,SalespersonCode,RmkCustomerNo,WalkInCustomerNo,
            CustomerPriceGroup,VatBusPostingGroup,Email,IsActive)
            VALUES (@code,@name,@location,@salesperson,@customer,@customer,@priceGroup,@vatGroup,@email,1);
          MERGE dbo.PosShopCompany WITH (HOLDLOCK) AS t USING (SELECT @code ShopCode,'RMK' Company) s
            ON t.ShopCode=s.ShopCode AND t.Company=s.Company
          WHEN MATCHED THEN UPDATE SET CustomerNo=@customer,LocationCode=COALESCE(@location,t.LocationCode),
            SalespersonCode=COALESCE(@salesperson,t.SalespersonCode),KraPin=COALESCE(@pin,t.KraPin)
          WHEN NOT MATCHED THEN INSERT (ShopCode,Company,CustomerNo,LocationCode,SalespersonCode,KraPin,DisplayName,IsActive,SortOrder)
            VALUES (@code,'RMK',@customer,@location,@salesperson,@pin,@name,1,0);
          MERGE dbo.PosContact WITH (HOLDLOCK) AS t USING (SELECT @customer BcContactNo) s ON t.BcContactNo=s.BcContactNo
          WHEN MATCHED THEN UPDATE SET Name=@name,MobileNo=@phone,Email=@email,KraPin=@pin,
            SalespersonCode=@salesperson,ShopCode=@code,CustomerType='3',CompanyName='RMK',IsWalkIn=1,IsActive=1,UpdatedAt=GETUTCDATE()
          WHEN NOT MATCHED THEN INSERT (BcContactNo,Name,MobileNo,Email,KraPin,SalespersonCode,ShopCode,CustomerType,CompanyName,IsWalkIn,IsActive)
            VALUES (@customer,@name,@phone,@email,@pin,@salesperson,@code,'3','RMK',1,1);
        `);
    }
    await tx.commit();
    return { count: plan.length, inserted: plan.filter(s => s.action === 'insert').length,
      updated: plan.filter(s => s.action === 'update').length, shops: plan, errors: [], wiped: 0 };
  } catch (error) { await tx.rollback(); throw error; }
}
