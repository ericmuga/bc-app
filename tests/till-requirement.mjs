import test from 'node:test';
import assert from 'node:assert/strict';
import { tillAction, isTillExempt } from '../shared/tillRequirement.mjs';
const now = new Date('2026-11-11T00:30:00+03:00');
test('untagged users have no requirement', () => assert.equal(tillAction(false, null, now), null));
test('tagged users must open a till', () => assert.equal(tillAction(true, null, now), 'open'));
test('same Nairobi day across UTC midnight is accepted', () => assert.equal(tillAction(true, { status: 'open', openedAt: '2026-11-10T21:01:00Z' }, now), null));
test('previous Nairobi day must close first', () => assert.equal(tillAction(true, { status: 'open', openedAt: '2026-11-10T20:59:00Z' }, now), 'close'));
test('closed till requires opening a new till', () => assert.equal(tillAction(true, { status: 'closed', openedAt: now }, now), 'open'));
test('future dated till must also close', () => assert.equal(tillAction(true, { status: 'open', openedAt: '2026-11-12T00:00:00+03:00' }, now), 'close'));

test('subworker logins are exempt', () => {
  assert.equal(isTillExempt({ role: 'dispatch-worker' }), true);
  assert.equal(isTillExempt({ role: 'assembler', workerLogin: true }), true);
  assert.equal(isTillExempt({ role: 'packer', delegationId: 'worker-grant' }), true);
});
test('normal user accounts remain subject to their till setting', () => {
  for (const role of ['admin', 'shop', 'shop-admin', 'sales-admin', 'assembler']) assert.equal(isTillExempt({ role }), false);
});
