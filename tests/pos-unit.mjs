/**
 * POS unit checks that do not require SQL Server, BC, printers, or a running API.
 *
 * These tests protect the release-critical role matrix and BA documentation
 * artefacts. The deeper endpoint suites remain in pos-smoke.mjs and pos-roles.mjs.
 */
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROLES,
  normalizeRole,
  POS_ROLES,
  POS_MANAGER_ROLES,
  ADMIN_ROLES,
  ORDER_ROLES,
  INVOICE_ROLES,
  REPORT_ROLES,
  FINANCE_ROLES,
} from '../server/src/services/access.js';

import {
  canAccessPos,
  canManagePos,
  isGlobalAdmin,
} from '../client/src/lib/posAccess.js';

const POS_FEATURE_SECTIONS = [
  'SECTION A — Inventory Load Per Location',
  'SECTION B — User Creation & Access Control',
  'SECTION C — Setups',
  'SECTION D — POS Terminal: Cart & Checkout',
  'SECTION E — Stock Operations',
  'SECTION F — Reports',
  'SECTION G — Non-functional',
];

test('server role constants include POS rollout roles without widening global admin', () => {
  assert.deepEqual(POS_ROLES, [ROLES.ADMIN, ROLES.SHOP_ADMIN, ROLES.SHOP]);
  assert.deepEqual(POS_MANAGER_ROLES, [ROLES.ADMIN, ROLES.SHOP_ADMIN]);
  assert.deepEqual(ADMIN_ROLES, [ROLES.ADMIN]);

  assert.ok(!ORDER_ROLES.includes(ROLES.SHOP_ADMIN), 'shop-admin must not access dispatch order queue');
  assert.ok(!INVOICE_ROLES.includes(ROLES.SHOP), 'cashier must not access security invoice queue');
  assert.ok(!REPORT_ROLES.includes(ROLES.SHOP), 'cashier must not access global reports');
  assert.ok(!FINANCE_ROLES.includes(ROLES.SHOP_ADMIN), 'shop-admin must not access finance');
});

test('role normalization is case and whitespace tolerant', () => {
  assert.equal(normalizeRole(' SHOP-ADMIN '), ROLES.SHOP_ADMIN);
  assert.equal(normalizeRole(null), '');
  assert.equal(normalizeRole(undefined), '');
});

test('client POS access helpers match the server POS role model', () => {
  for (const role of [ROLES.ADMIN, ROLES.SHOP_ADMIN, ROLES.SHOP]) {
    assert.equal(canAccessPos(role), true, `${role} should enter POS`);
  }

  assert.equal(canManagePos(ROLES.ADMIN), true);
  assert.equal(canManagePos(ROLES.SHOP_ADMIN), true);
  assert.equal(canManagePos(ROLES.SHOP), false);

  assert.equal(isGlobalAdmin(ROLES.ADMIN), true);
  assert.equal(isGlobalAdmin(ROLES.SHOP_ADMIN), false);
  assert.equal(isGlobalAdmin(ROLES.SHOP), false);
});

test('BA/UAT test plan covers every POS release feature area', () => {
  const testPlan = readFileSync(new URL('../docs/POS-Test-Plan.md', import.meta.url), 'utf8');
  for (const heading of POS_FEATURE_SECTIONS) {
    assert.ok(testPlan.includes(heading), `missing test-plan section: ${heading}`);
  }
  assert.match(testPlan, /\*\*Total\*\*\s*\|\s*\*\*105\*\*/, 'sign-off total should stay visible');
});

test('BA release documentation links rollout scope to acceptance evidence', () => {
  const baDoc = readFileSync(new URL('../docs/POS-BA-Release-Readiness.md', import.meta.url), 'utf8');
  for (const phrase of [
    'Business Analyst Release Readiness',
    'Feature Coverage Matrix',
    'Acceptance Evidence',
    'Rollout Decision',
    'POS-Test-Plan.md',
    'POS-User-Guide.md',
  ]) {
    assert.ok(baDoc.includes(phrase), `missing BA release phrase: ${phrase}`);
  }
});
