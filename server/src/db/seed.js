/**
 * db/seed.js  —  Interactive first-run setup
 *
 * Creates the admin user and registers initial companies.
 *
 * Usage:
 *   node src/db/seed.js
 *
 * Environment variables read from server/.env
 */
import { createInterface } from 'readline'
import bcrypt  from 'bcryptjs'
import dotenv  from 'dotenv'
import { db, sql } from './pool.js'

dotenv.config()

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise((res) => rl.question(q, res))

async function run() {
  console.log('\n╔══════════════════════════════════════╗')
  console.log('║   BC Sales Console — First-run seed  ║')
  console.log('╚══════════════════════════════════════╝\n')

  await db.connect()
  const pool = await db.getPool()

  // ── 1. Create admin user ─────────────────────────────────────────────────
  console.log('── Admin user ──────────────────────────')
  const username    = (await ask('  Username   [admin]: ')).trim() || 'admin'
  const displayName = (await ask('  Display name [Administrator]: ')).trim() || 'Administrator'
  const password    = (await ask('  Password: ')).trim()

  if (!password) { console.error('Password cannot be empty.'); process.exit(1) }

  const hash = await bcrypt.hash(password, 12)
  const uReq = pool.request()
  uReq.input('Username',     sql.NVarChar(100), username)
  uReq.input('PasswordHash', sql.NVarChar(200), hash)
  uReq.input('DisplayName',  sql.NVarChar(200), displayName)
  await uReq.query(`
    MERGE [dbo].[Users] AS t
    USING (SELECT @Username AS Username) AS s ON t.Username = s.Username
    WHEN MATCHED THEN
      UPDATE SET PasswordHash = @PasswordHash, DisplayName = @DisplayName,
                 Role = 'admin', IsActive = 1
    WHEN NOT MATCHED THEN
      INSERT (Username, PasswordHash, DisplayName, Role)
      VALUES (@Username, @PasswordHash, @DisplayName, 'admin');
  `)
  console.log(`  ✓ User "${username}" saved.\n`)

  // ── 2. Register companies ────────────────────────────────────────────────
  console.log('── Companies ───────────────────────────')
  console.log('  Enter company details (leave CompanyId blank to stop).\n')

  let more = true
  while (more) {
    const companyId   = (await ask('  Company ID   (e.g. CONTOSO_001): ')).trim()
    if (!companyId) { more = false; break }

    if (!/^[a-zA-Z0-9_]+$/.test(companyId)) {
      console.log('  ✗ CompanyId may only contain letters, numbers, underscores. Try again.')
      continue
    }

    const companyName = (await ask(`  Company name [${companyId}]: `)).trim() || companyId

    const cReq = pool.request()
    cReq.input('CompanyId',   sql.NVarChar(60),  companyId)
    cReq.input('CompanyName', sql.NVarChar(200), companyName)
    await cReq.query(`
      MERGE [dbo].[Companies] AS t
      USING (SELECT @CompanyId AS CompanyId) AS s ON t.CompanyId = s.CompanyId
      WHEN MATCHED THEN UPDATE SET CompanyName = @CompanyName, IsActive = 1
      WHEN NOT MATCHED THEN INSERT (CompanyId, CompanyName) VALUES (@CompanyId, @CompanyName);
    `)
    console.log(`  ✓ Company "${companyName}" (${companyId}) saved.`)
    console.log(`    Run migrate: node src/db/migrate.js ${companyId}\n`)
  }

  console.log('\n✓ Seed complete. You can now start the server and log in.\n')
  rl.close()
  await db.close()
  process.exit(0)
}

run().catch((err) => {
  console.error('Seed failed:', err.message)
  rl.close()
  process.exit(1)
})
