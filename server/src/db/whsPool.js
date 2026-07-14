/**
 * db/whsPool.js
 * Connection pool for the FCLWHS warehouse database on FC-AZ-BCDB01
 * (172.16.10.9). Reuses the same DB_USER / DB_PASSWORD as the app pool.
 * Host/db are env-overridable (WHS_DB_HOST, WHS_DB_NAME).
 */
import sql from 'mssql';
import dotenv from 'dotenv';
import logger from '../services/logger.js';

dotenv.config();

const config = {
  server:   process.env.WHS_DB_HOST || '172.16.10.9',
  port:     parseInt(process.env.DB_PORT) || 1433,
  database: process.env.WHS_DB_NAME || 'FCLWHS',
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeout: parseInt(process.env.WHS_DB_CONNECTION_TIMEOUT) || 30000,
  requestTimeout:    parseInt(process.env.WHS_DB_REQUEST_TIMEOUT) || 180000,
  options: {
    encrypt:                process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    enableArithAbort:       true,
  },
  pool: { min: 1, max: 5, idleTimeoutMillis: 30000, acquireTimeoutMillis: 60000 },
};

class WhsDatabase {
  constructor() { this.pool = null; }
  async getPool() {
    if (this.pool) return this.pool;
    try {
      this.pool = await new sql.ConnectionPool(config).connect();
      this.pool.on('error', (err) => { logger.error('WHS SQL pool error', { error: err.message }); this.pool = null; });
      logger.info('WHS SQL pool connected', { server: config.server, database: config.database });
    } catch (err) {
      logger.error('WHS SQL pool connect failed', { error: err.message });
      throw err;
    }
    return this.pool;
  }
}

export const whsDb = new WhsDatabase();
export { sql as whsSql };
