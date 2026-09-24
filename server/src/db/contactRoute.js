export async function migrateContactRoute(pool) {
  await pool.request().query(`
    IF EXISTS (SELECT 1 FROM sys.columns
      WHERE object_id=OBJECT_ID('dbo.PosContact') AND name='RouteCode'
        AND max_length > 0 AND max_length < 200)
      ALTER TABLE dbo.PosContact ALTER COLUMN RouteCode NVARCHAR(100) NULL;
  `);
}
