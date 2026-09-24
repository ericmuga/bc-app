import { db, sql } from '../db/pool.js';
import { bcDb } from '../db/bcPool.js';
import { bcTable, extCol } from '../services/bcTables.js';

export async function syncFlmShops() {
  const source = await bcDb.getPool();
  const customers = (await source.request().query(`SELECT c.[No_] No,c.Name,c.[Location Code] LocationCode,
    c.[Salesperson Code] SalespersonCode,c.[Customer Price Group] CustomerPriceGroup,
    c.[VAT Bus_ Posting Group] VatBusPostingGroup,c.[E-Mail] Email
    FROM ${bcTable('FLM','Customer')} c JOIN ${bcTable('FLM','Customer',{coreExt:true})} x ON x.[No_]=c.[No_]
    WHERE x.${extCol('Customer Type')}=3 AND c.Blocked=0 AND c.[Privacy Blocked]=0`)).recordset;
  const tx = new sql.Transaction(await db.getPool());
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    await new sql.Request(tx).query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.Companies WITH (UPDLOCK,HOLDLOCK) WHERE CompanyId='FLM')
        INSERT dbo.Companies (CompanyId,CompanyName,IsActive) VALUES ('FLM','FLM',1);
    `);
    const shops = [];
    for (const c of customers) {
      const r = await new sql.Request(tx).input('no',sql.NVarChar(20),c.No.trim())
        .input('code',sql.NVarChar(50),'FLM-'+c.No.trim()).input('name',sql.NVarChar(200),c.Name)
        .input('location',sql.NVarChar(20),c.LocationCode?.trim() || null)
        .input('sp',sql.NVarChar(20),c.SalespersonCode?.trim() || null)
        .input('price',sql.NVarChar(50),c.CustomerPriceGroup || null)
        .input('vat',sql.NVarChar(50),c.VatBusPostingGroup || null).input('email',sql.NVarChar(200),c.Email || null)
        .query(`
          IF (SELECT COUNT(*) FROM dbo.PosShop WITH (UPDLOCK,HOLDLOCK) WHERE FlmCustomerNo=@no)>1
            THROW 51001,'FLM customer is mapped to multiple shops',1;
          SELECT @code=Code FROM dbo.PosShop WHERE FlmCustomerNo=@no;
          IF EXISTS(SELECT 1 FROM dbo.PosShop WHERE Code=@code AND ISNULL(FlmCustomerNo,'')<>@no)
            THROW 51001,'FLM shop code belongs to another customer',1;
          IF NOT EXISTS(SELECT 1 FROM dbo.PosShop WHERE Code=@code)
            INSERT dbo.PosShop(Code,Name,LocationCode,SalespersonCode,FlmCustomerNo,WalkInCustomerNo,CustomerPriceGroup,VatBusPostingGroup,Email,IsActive)
            VALUES(@code,@name,@location,@sp,@no,@no,@price,@vat,@email,1);
          MERGE dbo.PosShopCompany WITH(HOLDLOCK) t USING(SELECT @code ShopCode,'FLM' Company) s
          ON t.ShopCode=s.ShopCode AND t.Company=s.Company
          WHEN MATCHED THEN UPDATE SET CustomerNo=@no,LocationCode=COALESCE(@location,t.LocationCode),SalespersonCode=@sp
          WHEN NOT MATCHED THEN INSERT(ShopCode,Company,CustomerNo,LocationCode,SalespersonCode,DisplayName,IsActive,SortOrder)
            VALUES(@code,'FLM',@no,@location,@sp,@name,1,0);
          SELECT @code Code,@no CustomerNo,@location LocationCode;`);
      shops.push(r.recordset[0]);
    }
    await tx.commit();
    return {count:shops.length,shops,errors:[]};
  } catch(error) {await tx.rollback();throw error;}
}
