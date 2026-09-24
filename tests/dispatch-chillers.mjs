import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateAssemblyWrite } from '../server/src/services/dispatchAssemblyRules.js';
import { DISPATCH_ROLES, DISPATCH_ASSEMBLE_ROLES, DISPATCH_SUPERVISOR_ROLES } from '../server/src/services/access.js';

const user = { role: 'assembler', userId: 'alice' };
const line = { Active: true, Confirmed: true, Status: 'confirmed', OrderQty: 10, Chiller: 'CHILLER U', AssignedToUserId: 'alice' };
const body = { assembledQty: 10, chiller: 'CHILLER U' };
test('bypass allows an unassigned assembler only for the mapped chiller', () => {
  assert.doesNotThrow(() => validateAssemblyWrite({ ...line, AssignedToUserId: null }, body, user, true));
  assert.throws(() => validateAssemblyWrite(line, { ...body, chiller: 'CHILLER H' }, user, true), /mapped chiller/);
  assert.throws(() => validateAssemblyWrite({ ...line, Chiller: null }, body, user, true), /mapped chiller/);
});
test('assignment mode enforces ownership and completed lines are immutable', () => {
  assert.throws(() => validateAssemblyWrite({ ...line, AssignedToUserId: 'bob' }, body, user, false), /another assembler/);
  assert.throws(() => validateAssemblyWrite({ ...line, Completed: true }, body, user, true), /completed/);
  assert.throws(() => validateAssemblyWrite({ ...line, Confirmed: false }, body, user, true), /not available/);
  assert.throws(() => validateAssemblyWrite({ ...line, Status: 'packed' }, body, user, true), /not available/);
});
test('quantities, weight and discrepancy reasons are required', () => {
  for (const qty of [null, -1, Infinity, 'bad']) assert.throws(() => validateAssemblyWrite(line, { ...body, assembledQty: qty }, user, true));
  assert.throws(() => validateAssemblyWrite(line, { ...body, assembledQty: 5 }, user, true), /Return reason/);
  assert.doesNotThrow(() => validateAssemblyWrite(line, { ...body, assembledQty: 0, returnReasonCode: 'SHORT' }, user, true));
  assert.throws(() => validateAssemblyWrite({ ...line, IsWeighted: true }, body, user, true), /weight/);
});
test('attendants have dispatch access but cannot assemble or configure', () => {
  assert.ok(DISPATCH_ROLES.includes('chiller-attendant'));
  assert.ok(!DISPATCH_ASSEMBLE_ROLES.includes('chiller-attendant'));
  assert.ok(!DISPATCH_SUPERVISOR_ROLES.includes('chiller-attendant'));
  assert.throws(() => validateAssemblyWrite(line, body, { role: 'chiller-attendant' }, true), /permission/);
});
test('sheet seed contains both item columns, including freezer W, without duplicate items', () => {
  const rows = JSON.parse(readFileSync(new URL('../server/src/data/dispatch-chillers.json', import.meta.url)));
  assert.equal(rows.length, 166);
  assert.equal(new Set(rows.map(r => r.itemNo)).size, rows.length);
  assert.deepEqual([...new Set(rows.map(r => r.chiller))].sort(), ['CHILLER G', 'CHILLER H', 'CHILLER U', 'CHILLER V', 'FREEZER W']);
  assert.equal(rows.find(r => r.itemNo === 'J31090110').chiller, 'FREEZER W');
  assert.equal(rows.find(r => r.itemNo === 'J31031706').chiller, 'CHILLER V');
});
