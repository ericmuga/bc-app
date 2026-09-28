import 'dotenv/config';
import {db,sql} from './pool.js';
import {bcDb} from './bcPool.js';
import {bcTable} from '../services/bcTables.js';

let source,tx;
try {
  source=await bcDb.getPool();
  const customer=(await source.request().input('no',sql.NVarChar(20),'B3000').query(`
    SELECT [No_] CustomerNo,Name,[Location Code] LocationCode,[Salesperson Code] SalespersonCode,
      [Customer Price Group] CustomerPriceGroup,[VAT Bus_ Posting Group] VatBusPostingGroup,[E-Mail] Email
    FROM ${bcTable('CM','Customer')} WHERE [No_]=@no AND Blocked=0 AND [Privacy Blocked]=0`)).recordset[0];
  if(!customer?.LocationCode?.trim())throw new Error('CM customer B3000 needs an active customer and location in BC');
  tx=new sql.Transaction(await db.getPool());await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  const result=await new sql.Request(tx)
    .input('customer',sql.NVarChar(20),customer.CustomerNo.trim()).input('name',sql.NVarChar(200),customer.Name)
    .input('location',sql.NVarChar(20),customer.LocationCode.trim()).input('sp',sql.NVarChar(20),customer.SalespersonCode?.trim()||null)
    .input('price',sql.NVarChar(50),customer.CustomerPriceGroup||null).input('vat',sql.NVarChar(50),customer.VatBusPostingGroup||null)
    .input('email',sql.NVarChar(200),customer.Email||null).query(`
    DECLARE @code nvarchar(50)='CM-B3000';
    IF (SELECT COUNT(*) FROM dbo.PosShop WITH(UPDLOCK,HOLDLOCK) WHERE CmCustomerNo=@customer)>1
      THROW 50000,'CM customer is already mapped to multiple shops; review mappings',1;
    SELECT @code=Code FROM dbo.PosShop WHERE CmCustomerNo=@customer;
    IF EXISTS(SELECT 1 FROM dbo.PosShop WHERE Code=@code AND (
      ISNULL(CmCustomerNo,'')<>@customer OR NULLIF(FclCustomerNo,'') IS NOT NULL OR NULLIF(RmkCustomerNo,'') IS NOT NULL OR NULLIF(FlmCustomerNo,'') IS NOT NULL))
      THROW 50000,'Existing shop has conflicting customer mappings; no changes made',1;
    IF EXISTS(SELECT 1 FROM dbo.PosShopCompany WHERE ShopCode=@code AND Company<>'CM')
      THROW 50000,'Existing shop has another company mirror; no changes made',1;
    IF NOT EXISTS(SELECT 1 FROM dbo.Companies WHERE CompanyId='CM')
      INSERT dbo.Companies(CompanyId,CompanyName,IsActive) VALUES('CM','CM',1);
    IF NOT EXISTS(SELECT 1 FROM dbo.PosShop WHERE Code=@code)
      INSERT dbo.PosShop(Code,Name,Company,LocationCode,SalespersonCode,CmCustomerNo,WalkInCustomerNo,CustomerPriceGroup,VatBusPostingGroup,Email,IsActive)
      VALUES(@code,@name,'CM',@location,@sp,@customer,@customer,@price,@vat,@email,1);
    ELSE UPDATE dbo.PosShop SET Company='CM',Name=@name,LocationCode=@location,SalespersonCode=@sp,
      WalkInCustomerNo=@customer,CustomerPriceGroup=@price,VatBusPostingGroup=@vat,Email=@email,IsActive=1,UpdatedAt=GETUTCDATE() WHERE Code=@code;
    MERGE dbo.PosShopCompany WITH(HOLDLOCK) t USING(SELECT @code ShopCode,'CM' Company)s ON t.ShopCode=s.ShopCode AND t.Company=s.Company
    WHEN MATCHED THEN UPDATE SET CustomerNo=@customer,LocationCode=@location,SalespersonCode=@sp,DisplayName=@name,IsActive=1,SortOrder=0
    WHEN NOT MATCHED THEN INSERT(ShopCode,Company,CustomerNo,LocationCode,SalespersonCode,DisplayName,IsActive,SortOrder)
      VALUES(@code,'CM',@customer,@location,@sp,@name,1,0);
    SELECT Code,Name,Company,LocationCode,CmCustomerNo FROM dbo.PosShop WHERE Code=@code;
    SELECT Company,CustomerNo,LocationCode,IsActive FROM dbo.PosShopCompany WHERE ShopCode=@code;`);
  await tx.commit();tx=null;
  console.log(JSON.stringify({shop:result.recordsets[0][0],mirrors:result.recordsets[1]}));
}finally{if(tx)await tx.rollback();await db.close();if(source)await source.close();}
