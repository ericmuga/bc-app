/**
 * db/pool.js
 * Single mssql ConnectionPool shared across the app.
 * Each company maps to a schema prefix (e.g. COMPANY_001.SalesHeader).
 * We use ONE pool to the same SQL Server instance; the company/schema
 * is injected at query time via the getCompanySchema() helper.
 */
import sql from 'mssql';
import dotenv from 'dotenv';
import logger from '../services/logger.js';

dotenv.config();

const config = {
  server:   process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_NAME || 'BCApp',
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt:                process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
    enableArithAbort:       true,
  },
  pool: {
    min:                   parseInt(process.env.DB_POOL_MIN)              || 2,
    max:                   parseInt(process.env.DB_POOL_MAX)              || 20,
    idleTimeoutMillis:     parseInt(process.env.DB_POOL_IDLE_TIMEOUT)     || 30000,
    acquireTimeoutMillis:  parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT)  || 60000,
  },
};

class Database {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  async connect() {
    if (this.pool && this.isConnected) return this.pool;
    try {
      this.pool = await new sql.ConnectionPool(config).connect();
      this.isConnected = true;
      this.pool.on('error', (err) => {
        logger.error('SQL Pool error', { error: err.message });
        this.isConnected = false;
      });
      logger.info('SQL Server connection pool established');
      return this.pool;
    } catch (err) {
      logger.error('Failed to connect to SQL Server', { error: err.message });
      throw err;
    }
  }

  async getPool() {
    if (!this.pool || !this.isConnected) await this.connect();
    return this.pool;
  }

  /**
   * Returns the schema prefix for a company.
   * Companies are stored as schemas: [COMPANY_001], [COMPANY_002], etc.
   */
  getCompanySchema(companyId) {
    if (!companyId) throw new Error('Company ID is required');
    // Sanitize – only allow alphanumeric and underscores
    const safe = companyId.replace(/[^a-zA-Z0-9_]/g, '');
    return `[${safe}]`;
  }

  async query(companyId, queryFn) {
    const pool = await this.getPool();
    const schema = this.getCompanySchema(companyId);
    return queryFn(pool, schema, sql);
  }

  async close() {
    if (this.pool) {
      await this.pool.close();
      this.isConnected = false;
      logger.info('SQL Server pool closed');
    }
  }
}

export const db = new Database();
export { sql };