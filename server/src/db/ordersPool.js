/**
 * db/ordersPool.js
 * Connection pool to the `orders` database — the same DB that the
 * order-invoice-service writes Daraja STK callbacks into (mpesa_transactions table).
 *
 * Configured via env (defaults to the main DB host, just a different database name):
 *   ORDERS_DB_HOST, ORDERS_DB_PORT, ORDERS_DB_NAME (default 'orders'),
 *   ORDERS_DB_USER, ORDERS_DB_PASSWORD,
 *   ORDERS_DB_ENCRYPT, ORDERS_DB_TRUST_CERT.
 */
import sql from 'mssql';
import dotenv from 'dotenv';
import logger from '../services/logger.js';

dotenv.config();

const config = {
  server:   process.env.ORDERS_DB_HOST     || process.env.DB_HOST,
  port:     parseInt(process.env.ORDERS_DB_PORT  || process.env.DB_PORT) || 1433,
  database: process.env.ORDERS_DB_NAME     || 'orders',
  user:     process.env.ORDERS_DB_USER     || process.env.DB_USER,
  password: process.env.ORDERS_DB_PASSWORD || process.env.DB_PASSWORD,
  connectionTimeout: 15000,
  requestTimeout:    30000,
  options: {
    encrypt:                (process.env.ORDERS_DB_ENCRYPT     ?? process.env.DB_ENCRYPT) === 'true',
    trustServerCertificate: (process.env.ORDERS_DB_TRUST_CERT  ?? process.env.DB_TRUST_CERT) === 'true',
    enableArithAbort:       true,
  },
  pool: { min: 0, max: 4, idleTimeoutMillis: 30000 },
};

class OrdersDatabase {
  constructor() { this.pool = null; this.isConnected = false; }
  async connect() {
    if (this.pool && this.isConnected) return this.pool;
    this.pool = await new sql.ConnectionPool(config).connect();
    this.isConnected = true;
    this.pool.on('error', (err) => {
      logger.error('Orders SQL Pool error', { error: err.message });
      this.isConnected = false;
    });
    logger.info(`Orders SQL connection pool established (${config.database}@${config.server})`);
    return this.pool;
  }
  async getPool() { if (!this.pool || !this.isConnected) await this.connect(); return this.pool; }
  async close()   { if (this.pool) { await this.pool.close(); this.isConnected = false; } }
}

export const ordersDb = new OrdersDatabase();
export { sql };
