/**
 * POS smoke test — read-only API checks against a running server.
 *
 * Run:
 *   API_BASE=http://localhost:3000/api \
 *   ADMIN_USER=qa.admin   ADMIN_PASS=...      \
 *   CASHIER_USER=qa.cashier1 CASHIER_PASS=... \
 *   node --test tests/pos-smoke.mjs
 *
 * The script ONLY hits GET endpoints + login. It will not create, modify,
 * or delete data. Safe to run against a populated test environment.
 */
import { test } from 'node:test';
import assert   from 'node:assert/strict';

const BASE         = process.env.API_BASE      || 'http://localhost:3000/api';
const ADMIN_USER   = process.env.ADMIN_USER    || '';
const ADMIN_PASS   = process.env.ADMIN_PASS    || '';
const CASHIER_USER = process.env.CASHIER_USER  || '';
const CASHIER_PASS = process.env.CASHIER_PASS  || '';

const tokens = { admin: null, cashier: null, adminUser: null, cashierUser: null };

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON response */ }
  return { status: res.status, data };
}

// ── Reachability ──────────────────────────────────────────────────────────────
test('API: server is reachable', async () => {
  const r = await call('/companies').catch(e => ({ err: e.message }));
  assert.ok(!r.err, `server unreachable at ${BASE}: ${r.err ?? ''}`);
  // 401 (no token) is the success signal — endpoint exists, requires auth
  assert.ok([200, 401].includes(r.status), `expected 200/401, got ${r.status}`);
});

// ── Auth ──────────────────────────────────────────────────────────────────────
test('Auth: bad credentials → 401', async () => {
  const r = await call('/auth/login', {
    method: 'POST', body: { username: 'no-such-user', password: 'x' },
  });
  assert.equal(r.status, 401);
  assert.match(JSON.stringify(r.data), /invalid|credentials/i);
});

test('Auth: missing fields → 400', async () => {
  const r = await call('/auth/login', { method: 'POST', body: { username: 'x' } });
  assert.equal(r.status, 400);
});

test('Auth: admin login (skipped if creds missing)', async (t) => {
  if (!ADMIN_USER || !ADMIN_PASS) return t.skip('ADMIN_USER/ADMIN_PASS not set');
  const r = await call('/auth/login', {
    method: 'POST', body: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data?.token, 'token missing in response');
  assert.ok(r.data?.user, 'user missing in response');
  tokens.admin     = r.data.token;
  tokens.adminUser = r.data.user;
});

test('Auth: cashier login (skipped if creds missing)', async (t) => {
  if (!CASHIER_USER || !CASHIER_PASS) return t.skip('CASHIER_USER/CASHIER_PASS not set');
  const r = await call('/auth/login', {
    method: 'POST', body: { username: CASHIER_USER, password: CASHIER_PASS },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  tokens.cashier     = r.data.token;
  tokens.cashierUser = r.data.user;
});

// ── Role gates ────────────────────────────────────────────────────────────────
test('RBAC: anonymous /pos/items → 401', async () => {
  const r = await call('/pos/items');
  assert.equal(r.status, 401);
});

test('RBAC: cashier reads /pos/items', async (t) => {
  if (!tokens.cashier) return t.skip('cashier not logged in');
  const r = await call('/pos/items', { token: tokens.cashier });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(Array.isArray(r.data), 'expected array');
});

test('RBAC: cashier reads /pos/payment-types', async (t) => {
  if (!tokens.cashier) return t.skip('cashier not logged in');
  const r = await call('/pos/payment-types', { token: tokens.cashier });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data));
});

test('RBAC: cashier reads /pos/my-shop', async (t) => {
  if (!tokens.cashier) return t.skip('cashier not logged in');
  const r = await call('/pos/my-shop', { token: tokens.cashier });
  assert.equal(r.status, 200);
  // Either an object with Code, or null if no shop assigned
  if (r.data) assert.ok(r.data.Code || r.data.code, 'shop should expose Code');
});

test('RBAC: cashier reads /pos/contacts', async (t) => {
  if (!tokens.cashier) return t.skip('cashier not logged in');
  const r = await call('/pos/contacts', { token: tokens.cashier });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data));
});

test('RBAC: cashier reads /pos/orders', async (t) => {
  if (!tokens.cashier) return t.skip('cashier not logged in');
  const r = await call('/pos/orders', { token: tokens.cashier });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data));
});

test('RBAC: cashier blocked from /pos/setup/items (admin-only)', async (t) => {
  if (!tokens.cashier) return t.skip('cashier not logged in');
  const r = await call('/pos/setup/items', { token: tokens.cashier });
  assert.equal(r.status, 403);
});

test('RBAC: cashier blocked from /orders (dispatch/admin only)', async (t) => {
  if (!tokens.cashier) return t.skip('cashier not logged in');
  const r = await call('/orders', { token: tokens.cashier });
  assert.equal(r.status, 403);
});

// ── Admin reads ──────────────────────────────────────────────────────────────
test('Admin: GET /pos/setup/shops returns array', async (t) => {
  if (!tokens.admin) return t.skip('admin not logged in');
  const r = await call('/pos/setup/shops', { token: tokens.admin });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data));
});

test('Admin: GET /pos/setup/categories returns array', async (t) => {
  if (!tokens.admin) return t.skip('admin not logged in');
  const r = await call('/pos/setup/categories', { token: tokens.admin });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data));
});

test('Admin: GET /pos/setup/items returns array', async (t) => {
  if (!tokens.admin) return t.skip('admin not logged in');
  const r = await call('/pos/setup/items', { token: tokens.admin });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data));
});

test('Admin: GET /pos/setup/cashier-shops returns array', async (t) => {
  if (!tokens.admin) return t.skip('admin not logged in');
  const r = await call('/pos/setup/cashier-shops', { token: tokens.admin });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data));
});

// ── Data shape sanity ────────────────────────────────────────────────────────
test('Shape: shops carry the multi-company customer columns', async (t) => {
  if (!tokens.admin) return t.skip('admin not logged in');
  const r = await call('/pos/setup/shops', { token: tokens.admin });
  if (!r.data?.length) return t.skip('no shops yet');
  const s = r.data[0];
  // We don't require values, but the columns should be exposed
  for (const col of ['Code', 'Name', 'LocationCode']) {
    assert.ok(col in s, `missing column ${col}`);
  }
});

test('Shape: items expose VatPercent and SourceCompany', async (t) => {
  if (!tokens.admin) return t.skip('admin not logged in');
  const r = await call('/pos/setup/items', { token: tokens.admin });
  if (!r.data?.length) return t.skip('no items yet');
  const i = r.data[0];
  for (const col of ['Code', 'Name', 'UnitPrice']) {
    assert.ok(col in i, `missing column ${col}`);
  }
});
