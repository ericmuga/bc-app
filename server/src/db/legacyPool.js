/**
 * db/legacyPool.js
 * Connection pools for the LEGACY Business Central databases on 172.16.10.9
 * (rm-bc, fcl-bc-main, …). One pool per database, created lazily and cached.
 *
 * Reuses the same DB_USER / DB_PASSWORD as the rest of the app (the `reporter`
 * login). Host is env-overridable via LEGACY_DB_HOST (defaults to the WHS box
 * 172.16.10.9, the same server the weekly-targets feature already reaches).
 *
 * READ-ONLY BY DESIGN: nothing in this module (or its callers) ever issues a
 * write. Sessions run under READ UNCOMMITTED (see LegacyReportModel) so reports
 * never take shared locks on the live OLTP tables.
 */
import sql from 'mssql';
import dotenv from 'dotenv';
import logger from '../services/logger.js';

dotenv.config();

/** database name → ConnectionPool */
const pools = new Map();

function makeConfig(database) {
  return {
    server:   process.env.LEGACY_DB_HOST || '172.16.10.9',
    port:     parseInt(process.env.DB_PORT) || 1433,
    database,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionTimeout: parseInt(process.env.LEGACY_DB_CONNECTION_TIMEOUT) || 30000,
    requestTimeout:    parseInt(process.env.LEGACY_DB_REQUEST_TIMEOUT) || 120000,
    options: {
      encrypt:                process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
      enableArithAbort:       true,
      readOnlyIntent:         true,
    },
    pool: { min: 0, max: 4, idleTimeoutMillis: 30000, acquireTimeoutMillis: 60000 },
  };
}

/** Get (or lazily create) a cached pool for a legacy database. */
export async function getLegacyPool(database) {
  if (!database) throw new Error('legacy database name is required');
  const existing = pools.get(database);
  if (existing) return existing;
  try {
    const pool = await new sql.ConnectionPool(makeConfig(database)).connect();
    pool.on('error', (err) => {
      logger.error('Legacy SQL pool error', { database, error: err.message });
      pools.delete(database);
    });
    pools.set(database, pool);
    logger.info('Legacy SQL pool connected', { server: makeConfig(database).server, database });
    return pool;
  } catch (err) {
    logger.error('Legacy SQL pool connect failed', { database, error: err.message });
    throw err;
  }
}

export { sql as legacySql };
