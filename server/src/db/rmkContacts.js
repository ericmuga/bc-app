export async function migrateRmkContacts(pool) {
  await pool.request().query(`IF OBJECT_ID('dbo.PosRmkContact','U') IS NULL
    CREATE TABLE dbo.PosRmkContact (
      BcContactNo nvarchar(20) NOT NULL PRIMARY KEY,
      Name nvarchar(200) NOT NULL, MobileNo nvarchar(100) NULL,
      Email nvarchar(200) NULL,KraPin nvarchar(100) NULL,
      SalespersonCode nvarchar(20) NULL,RouteCode nvarchar(100) NULL,
      CustomerType nvarchar(20) NULL,CompanyName nvarchar(200) NULL,
      UpdatedAt datetime2 NOT NULL DEFAULT GETUTCDATE()
    );`);
}
