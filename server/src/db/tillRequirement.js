export async function migrateTillRequirement(pool) {
  await pool.request().query(`
    IF COL_LENGTH('dbo.Users', 'RequireDailyTill') IS NULL
      ALTER TABLE dbo.Users ADD RequireDailyTill BIT NOT NULL CONSTRAINT DF_Users_RequireDailyTill DEFAULT 0
  `);
}
