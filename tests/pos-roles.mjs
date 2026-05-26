/**
 * Role-gate regression test.
 *
 * Logs in as each role (using the temporary `reg_*` users created by
 * tests/seed-regression-users.sql) and verifies that every route is either
 * allowed (200) or forbidden (403) according to the expected matrix below.
 *
 * Anonymous (no token) is verified to receive 401 on every protected route.
 *
 * Run:
 *   API_BASE=http://localhost:4000/api PASS=RegrTest!2026 node tests/pos-roles.mjs
 */
import assert from 'node:assert/strict';

const BASE = process.env.API_BASE || 'http://localhost:4000/api';
const PASS = process.env.PASS     || 'RegrTest!2026';

// ── Roles ────────────────────────────────────────────────────────────────────
const ROLES = ['admin', 'shop-admin', 'shop', 'dispatch', 'security', 'sales', 'analyst', 'finance'];
const USER = (role) => ({
  'admin':       'reg_admin',
  'shop-admin':  'reg_shopadmin',
  'shop':        'reg_shop',
  'dispatch':    'reg_dispatch',
  'security':    'reg_security',
  'sales':       'reg_sales',
  'analyst':     'reg_analyst',
  'finance':     'reg_finance',
}[role]);

// ── Route matrix ─────────────────────────────────────────────────────────────
// `allow` lists the roles that should get past requireRole and reach the handler
// (i.e., a 2xx — though some controllers may 404 if data is missing, we accept
// any non-401/403 as "passed the gate").
const ROUTES = [
  // Orders
  { method: 'GET', path: '/orders',              allow: ['admin', 'dispatch'] },
  { method: 'GET', path: '/orders/summary',      allow: ['admin', 'sales', 'analyst'] },

  // Invoices
  { method: 'GET', path: '/invoices',            allow: ['admin', 'security'] },
  { method: 'GET', path: '/invoices/summary',    allow: ['admin', 'sales', 'analyst'] },

  // BC reports
  { method: 'GET', path: '/bc-reports/companies', allow: ['admin', 'sales', 'analyst'] },

  // Admin-only
  { method: 'GET', path: '/admin/users',         allow: ['admin'] },
  { method: 'GET', path: '/admin/settings/smtp', allow: ['admin'] },

  // Finance — /finance/gl-mappings is a read endpoint gated to canFinance
  { method: 'GET', path: '/finance/gl-mappings',  allow: ['admin', 'finance', 'analyst'] },

  // POS — cashier scope
  { method: 'GET', path: '/pos/items',           allow: ['admin', 'shop-admin', 'shop'] },
  { method: 'GET', path: '/pos/payment-types',   allow: ['admin', 'shop-admin', 'shop'] },
  { method: 'GET', path: '/pos/my-shop',         allow: ['admin', 'shop-admin', 'shop'] },
  { method: 'GET', path: '/pos/contacts',        allow: ['admin', 'shop-admin', 'shop'] },
  { method: 'GET', path: '/pos/orders',          allow: ['admin', 'shop-admin', 'shop'] },
  { method: 'GET', path: '/pos/till/current',    allow: ['admin', 'shop-admin', 'shop'] },
  { method: 'GET', path: '/pos/stock-requests',  allow: ['admin', 'shop-admin', 'shop'] },
  { method: 'GET', path: '/pos/transfers',       allow: ['admin', 'shop-admin', 'shop'] },
  { method: 'GET', path: '/pos/portionings',     allow: ['admin', 'shop-admin', 'shop'] },
  { method: 'GET', path: '/pos/write-offs',      allow: ['admin', 'shop-admin', 'shop'] },
  { method: 'GET', path: '/pos/manual-sales',    allow: ['admin', 'shop-admin', 'shop'] },
  { method: 'GET', path: '/pos/targets',         allow: ['admin', 'shop-admin', 'shop'] },

  // POS — admin/shop-admin scope (POS setup + cashier-shop assignment) — POS_MANAGER gate
  { method: 'GET', path: '/pos/setup/shops',           allow: ['admin', 'shop-admin'] },
  { method: 'GET', path: '/pos/setup/items',           allow: ['admin', 'shop-admin'] },
  { method: 'GET', path: '/pos/setup/categories',      allow: ['admin', 'shop-admin'] },
  { method: 'GET', path: '/pos/setup/cashier-shops',   allow: ['admin', 'shop-admin'] },
  { method: 'GET', path: '/pos/setup/print-config',    allow: ['admin', 'shop-admin'] },
  { method: 'GET', path: '/pos/setup/etims-config',    allow: ['admin', 'shop-admin'] },

  // Coupons (admin/shop-admin manager actions; cashier can /pos/coupons/:code/redeem)
  { method: 'GET', path: '/pos/coupons',         allow: ['admin', 'shop-admin'] },
];

// ── HTTP ─────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DELAY_MS = Number(process.env.DELAY_MS || 30);

async function call(path, { method = 'GET', token, body } = {}) {
  // Per-call delay avoids tripping the API's 200/min rate limit when running
  // ~250 calls in one shot.
  if (DELAY_MS > 0) await sleep(DELAY_MS);
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status };
}

async function login(username) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: PASS }),
  });
  if (res.status !== 200) {
    const txt = await res.text();
    throw new Error(`login ${username} failed: ${res.status} ${txt}`);
  }
  const data = await res.json();
  return data.token;
}

// ── Run ──────────────────────────────────────────────────────────────────────
function passGate(status) { return status !== 401 && status !== 403; }

(async () => {
  const tokens = {};
  console.log(`API_BASE = ${BASE}`);
  console.log('── Phase 0: anonymous access ──────────────────────');
  let pass0 = 0, fail0 = 0;
  for (const route of ROUTES) {
    const r = await call(route.path, { method: route.method });
    const ok = r.status === 401;
    (ok ? pass0++ : fail0++);
    if (!ok) console.log(`  FAIL anon ${route.method} ${route.path} → ${r.status} (expected 401)`);
  }
  console.log(`  anon: ${pass0} pass, ${fail0} fail (expected 401 on every route)`);

  console.log('── Phase 1: login each role ───────────────────────');
  for (const role of ROLES) {
    try {
      tokens[role] = await login(USER(role));
      console.log(`  ok   login ${role.padEnd(10)} as ${USER(role)}`);
    } catch (e) {
      console.log(`  FAIL login ${role.padEnd(10)} — ${e.message}`);
    }
  }

  console.log('── Phase 2: role × route matrix ───────────────────');
  // Header row
  process.stdout.write('  '.padEnd(40));
  for (const role of ROLES) process.stdout.write(role.slice(0, 6).padEnd(8));
  process.stdout.write('\n');

  let totalAllow = 0, totalDeny = 0, passAllow = 0, passDeny = 0, mismatches = [];
  for (const route of ROUTES) {
    process.stdout.write(`  ${(route.method + ' ' + route.path).padEnd(40)}`);
    for (const role of ROLES) {
      const shouldAllow = route.allow.includes(role);
      const tok = tokens[role];
      if (!tok) { process.stdout.write('SKIP'.padEnd(8)); continue; }
      const r = await call(route.path, { method: route.method, token: tok });
      const gate = passGate(r.status);
      let symbol;
      if (shouldAllow && gate)        { symbol = `${r.status}✓`; passAllow++; totalAllow++; }
      else if (!shouldAllow && !gate) { symbol = `${r.status}✓`; passDeny++;  totalDeny++; }
      else if (shouldAllow && !gate)  { symbol = `${r.status}✗`; mismatches.push({ role, route, expected: 'allow', actual: r.status }); totalAllow++; }
      else                             { symbol = `${r.status}✗`; mismatches.push({ role, route, expected: 'deny',  actual: r.status }); totalDeny++; }
      process.stdout.write(symbol.padEnd(8));
    }
    process.stdout.write('\n');
  }

  console.log('\n── Summary ────────────────────────────────────────');
  console.log(`  Anonymous   : ${pass0}/${pass0 + fail0} passed (401 expected on every route)`);
  console.log(`  Allow gates : ${passAllow}/${totalAllow} passed (non-401/403 expected)`);
  console.log(`  Deny  gates : ${passDeny}/${totalDeny} passed (403 expected)`);
  console.log(`  Mismatches  : ${mismatches.length}`);
  for (const m of mismatches) {
    console.log(`    ${m.role.padEnd(10)} ${m.route.method} ${m.route.path.padEnd(35)} expected ${m.expected}, got ${m.actual}`);
  }

  const overall = fail0 === 0 && mismatches.length === 0;
  console.log(`\n${overall ? '✓ ALL PASS' : '✗ FAILURES'} — exit ${overall ? 0 : 1}`);
  process.exit(overall ? 0 : 1);
})().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(2);
});
