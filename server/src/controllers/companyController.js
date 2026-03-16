/**
 * controllers/companyController.js
 */
import { db, sql } from '../db/pool.js'
import logger from '../services/logger.js'

export async function listCompanies(req, res) {
  try {
    const pool = await db.getPool()
    const result = await pool.request().query(
      `SELECT CompanyId, CompanyName, IsActive, CreatedAt
       FROM [dbo].[Companies]
       WHERE IsActive = 1
       ORDER BY CompanyName`
    )
    return res.json(result.recordset)
  } catch (err) {
    logger.error('listCompanies error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
}

export async function createCompany(req, res) {
  try {
    const { companyId, companyName } = req.body
    if (!companyId || !companyName) {
      return res.status(400).json({ error: 'companyId and companyName are required' })
    }
    // Validate companyId format
    if (!/^[a-zA-Z0-9_]+$/.test(companyId)) {
      return res.status(400).json({ error: 'companyId may only contain letters, numbers, underscores' })
    }

    const pool = await db.getPool()
    const req2 = pool.request()
    req2.input('CompanyId',   sql.NVarChar(60), companyId)
    req2.input('CompanyName', sql.NVarChar(200), companyName)
    await req2.query(`
      MERGE [dbo].[Companies] AS t
      USING (SELECT @CompanyId AS CompanyId) AS s ON t.CompanyId = s.CompanyId
      WHEN MATCHED THEN UPDATE SET CompanyName = @CompanyName, IsActive = 1
      WHEN NOT MATCHED THEN INSERT (CompanyId, CompanyName) VALUES (@CompanyId, @CompanyName);
    `)

    logger.info('Company created/updated', { companyId, companyName })
    return res.status(201).json({ message: 'Company saved', companyId })
  } catch (err) {
    logger.error('createCompany error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
}
