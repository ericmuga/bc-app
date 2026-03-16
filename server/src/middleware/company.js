/**
 * middleware/company.js
 * Reads X-Company-ID header and validates it against registered companies.
 * Attaches req.companyId for downstream use.
 */
import { db, sql } from '../db/pool.js';

const cache = new Map(); // Simple in-memory company cache (TTL 5 min)
const CACHE_TTL = 5 * 60 * 1000;

async function isValidCompany(companyId) {
  const cached = cache.get(companyId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.valid;

  try {
    const pool = await db.getPool();
    const req = pool.request();
    req.input('CompanyId', sql.NVarChar(60), companyId);
    const result = await req.query(
      `SELECT 1 FROM [dbo].[Companies] WHERE CompanyId = @CompanyId AND IsActive = 1`
    );
    const valid = result.recordset.length > 0;
    cache.set(companyId, { valid, ts: Date.now() });
    return valid;
  } catch {
    return false;
  }
}

export function companyMiddleware(options = {}) {
  const { required = true } = options;
  return async (req, res, next) => {
    const companyId = req.headers['x-company-id'] || process.env.DEFAULT_COMPANY;
    if (!companyId) {
      if (required) return res.status(400).json({ error: 'X-Company-ID header is required' });
      return next();
    }

    // In dev mode, skip DB validation if company matches env default
    if (process.env.NODE_ENV === 'development' && companyId === process.env.DEFAULT_COMPANY) {
      req.companyId = companyId;
      return next();
    }

    const valid = await isValidCompany(companyId);
    if (!valid && required) {
      return res.status(404).json({ error: `Company '${companyId}' not found or inactive` });
    }

    req.companyId = companyId;
    next();
  };
}
