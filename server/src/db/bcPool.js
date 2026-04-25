/**
 * db/bcPool.js
 * Read-only connection pool for the Business Central SQL database.
 * Same server as BCApp; targets BC_DB_NAME (default: 'FCL').
 * Uses the same DB_USER / DB_PASSWORD as the app pool.
 */
import sql from 'mssql';
import dotenv from 'dotenv';
import logger from '../services/logger.js';

dotenv.config();

const config = {
  server:   process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 1433,
  database: process.env.BC_DB_NAME || 'FCL',
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeout: parseInt(process.env.BC_DB_CONNECTION_TIMEOUT) || 30000,
  requestTimeout: parseInt(process.env.BC_DB_REQUEST_TIMEOUT) || 120000,
  options: {
    encrypt:                process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    enableArithAbort:       true,
  },
  pool: {
    min:                  2,
    max:                  10,
    idleTimeoutMillis:    30000,
    acquireTimeoutMillis: 60000,
  },
};

class BcDatabase {
  constructor() {
    this.pool = null;
  }

  async getPool() {
    if (this.pool) return this.pool;
    try {
      this.pool = await new sql.ConnectionPool(config).connect();
      this.pool.on('error', (err) => {
        logger.error('BC SQL pool error', { error: err.message });
        this.pool = null;
      });
      logger.info('BC SQL pool connected', { database: config.database });
    } catch (err) {
      logger.error('BC SQL pool connect failed', { error: err.message });
      throw err;
    }
    return this.pool;
  }
}

export const bcDb = new BcDatabase();
export { sql as bcSql };
