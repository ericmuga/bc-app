import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import router from '../server/src/routes/index.js';
import { reportGroupsForRole, canReadLegacyDataset } from '../shared/reportAccess.mjs';
import { reportShopCode } from '../server/src/services/reportShopScope.js';
import { createLookupCache } from '../server/src/services/lookupCache.js';
import { listSources } from '../server/src/controllers/legacyReportController.js';

test('report listings follow business roles and put POS under Sales', () => {
  for (const role of ['shop', 'shop-admin', 'chef', 'sales', 'sales-admin', 'finance', 'analyst']) {
    assert.ok(reportGroupsForRole(role).find(g => g.key === 'sales').reports.some(r => r.path === '/pos/reports'));
  }
  assert.deepEqual(reportGroupsForRole('packer'), []);
  assert.ok(!reportGroupsForRole('sales').some(g => g.key === 'finance'));
  assert.ok(reportGroupsForRole('costing').some(g => g.key === 'costing'));
  assert.ok(reportGroupsForRole('production').some(g => g.key === 'inventory'));
  assert.ok(!reportGroupsForRole('finance').flatMap(g => g.reports).some(r => r.path.includes('warehouse-sync')));
});

// Exercise actual API middleware, without running database-backed handlers.
function gate(method, path, role, query = {}) {
  const route = router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
  const req = { headers: {}, query };
  process.env.JWT_SECRET = 'report-access-test-only';
  if (role) req.headers.authorization = 'Bearer ' + jwt.sign({ role, userId: 99 }, process.env.JWT_SECRET);
  let status = 200;
  const res = { status(code) { status = code; return this; }, json() {} };
  const guards = route.stack.slice(0, -1);
  let i = 0;
  const next = () => { if (i < guards.length) guards[i++].handle(req, res, next); };
  next();
  return status;
}

test('report read grants do not grant POS writes or warehouse job execution', () => {
  for (const role of ['sales', 'finance', 'analyst', 'sales-admin']) {
    assert.equal(gate('get', '/pos/reports/daily-sales', role), 200);
    assert.equal(gate('get', '/pos/reports/shops', role), 200);
  }
  for (const role of ['sales', 'finance', 'costing', 'production']) {
    assert.equal(gate('post', '/reporting/warehouse/jobs/:name/run', role), 403);
  }
  for (const role of ['sales', 'finance', 'analyst']) {
    assert.equal(gate('post', '/pos/setup/shops', role), 403);
  }
  assert.equal(gate('get', '/pos/reports/daily-sales', null), 401);
  assert.equal(gate('get', '/pos/reports/daily-sales', 'packer'), 403);
  assert.equal(gate('get', '/reporting/warehouse/inventory/items', 'costing'), 200);
});

test('legacy catalogue and all data endpoints enforce dataset permissions', () => {
  let sources;
  listSources({ user: { role: 'sales' } }, { json(data) { sources = data.sources; } });
  assert.ok(sources.length);
  for (const source of sources) for (const d of source.datasets) assert.ok(d.key.startsWith('postedSales'));
  for (const path of ['run', 'download', 'lookup']) {
    assert.equal(gate('get', '/reporting/legacy/' + path, 'sales', { dataset: 'glEntries' }), 403);
    assert.equal(gate('get', '/reporting/legacy/' + path, 'sales', { dataset: 'postedSalesInvoices' }), 200);
    assert.equal(gate('get', '/reporting/legacy/' + path, 'costing', { dataset: 'valueEntries' }), 200);
  }
  assert.equal(canReadLegacyDataset('admin', 'unknown'), false);
});

test('cashier and chef reports cannot override their shop or fall back to all shops', async () => {
  for (const role of ['shop', 'chef']) {
    const req = { user: { role, userId: 99 }, query: { shopCode: 'OTHER' } };
    assert.equal(await reportShopCode(req, async () => 'OWN'), 'OWN');
    await assert.rejects(reportShopCode(req, async () => null), /No shop assigned/);
  }
  assert.equal(await reportShopCode({ user: { role: 'sales' }, query: {} }), null);
  assert.equal(await reportShopCode({ user: { role: 'sales-admin' }, query: { shopCode: ' s1 ' } }), 'S1');
});

test('lookup cache coalesces, expires, bounds entries and retries failures', async () => {
  let now = 0, calls = 0;
  const cache = createLookupCache({ ttlMs: 10, maxEntries: 2, now: () => now });
  const load = async () => ++calls;
  assert.deepEqual(await Promise.all([cache('a', load), cache('a', load)]), [1, 1]);
  now = 11;
  assert.equal(await cache('a', load), 2);
  await cache('b', load); await cache('c', load);
  assert.equal(await cache('a', load), 5);
  await assert.rejects(cache('bad', async () => { throw new Error('offline'); }), /offline/);
  assert.equal(await cache('bad', load), 6);
});
