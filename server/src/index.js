/**
 * server/src/index.js
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { db } from './db/pool.js';
import routes from './routes/index.js';
import logger from './services/logger.js';
import swaggerSpec from './docs/swagger.js';
import { startReportScheduler } from './services/reportScheduler.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security & parsing ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '5mb' }));

// Rate limit public-facing routes
app.use('/api', rateLimit({ windowMs: 60_000, max: 200 }));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Swagger UI ───────────────────────────────────────────────────────────────
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'BC Sales Console API',
}));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    const pool = await db.getPool();
    await pool.request().query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ── Error handler ────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────────────────────
async function start() {
  await db.connect();
  startReportScheduler();
  app.listen(PORT, () => logger.info(`API listening on :${PORT}`));
}

start().catch((err) => {
  logger.error('Failed to start server', { error: err.message });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  await db.close();
  process.exit(0);
});
