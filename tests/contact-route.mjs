import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactRoute, CONTACT_ROUTE_LENGTH } from '../server/src/services/contactRoute.js';

test('BC route descriptions longer than 20 characters are preserved', () => {
  const route = 'KASARANI FEEDMILL DISTRIBUTOR ROUTE';
  assert.equal(contactRoute(` ${route} `), route);
  assert.equal(contactRoute('R'.repeat(CONTACT_ROUTE_LENGTH)).length, 100);
});
test('empty routes are null and overlength routes fail without silent truncation', () => {
  assert.equal(contactRoute(null), null);
  assert.equal(contactRoute('   '), null);
  assert.throws(() => contactRoute('R'.repeat(101)), /exceeds 100/);
});
