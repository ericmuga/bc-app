import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRmkShops, RMK_SHOP_CUSTOMER_TYPE } from '../server/src/services/rmkShopPlan.js';
import { groupRmkLocations } from '../server/src/services/rmkShopRefresh.js';

test('shared locations refresh once, retain the existing watermark owner and skip unmapped shops', () => {
  const plan = groupRmkLocations([
    { Code: 'A', LocationCode: 'str002', LastEntryNo: null },
    { Code: 'B', LocationCode: 'STR002', LastEntryNo: 123 },
    { Code: 'C', LocationCode: 'STR002', LastEntryNo: null },
    { Code: 'D', LocationCode: '' },
  ]);
  assert.equal(plan.locations.length, 1);
  assert.equal(plan.locations[0].owner, 'B');
  assert.deepEqual(plan.locations[0].shops, ['A', 'B', 'C']);
  assert.equal(plan.skipped[0].shopCode, 'D');
});

test('RMK SHOP is the verified BC option and uses customer identity, not salesperson', () => {
  assert.equal(RMK_SHOP_CUSTOMER_TYPE, 3);
  const result = planRmkShops([{ No: 'C1', Name: 'Shop 1', SalespersonCode: '000' },
    { No: 'C2', Name: 'Shop 2', SalespersonCode: '000' }], []);
  assert.deepEqual(result.map(s => s.Code), ['RMK-C1', 'RMK-C2']);
});
test('reruns reuse customer mappings and can add RMK to one existing named shop', () => {
  const existing = [{ Code: 'FCL1', Name: 'Shop 1', RmkCustomerNo: null },
    { Code: 'OLD', Name: 'Old name', RmkCustomerNo: 'C2' }];
  const result = planRmkShops([{ No: 'C1', Name: 'shop 1' }, { No: 'C2', Name: 'Renamed' }], existing);
  assert.deepEqual(result.map(s => s.Code), ['FCL1', 'OLD']);
  assert.ok(result.every(s => s.action === 'update'));
  assert.equal(existing[0].RmkCustomerNo, null);
});
test('conflicting identities fail instead of overwriting another shop', () => {
  assert.throws(() => planRmkShops([{ No: 'C1', Name: 'New' }], [{ Code: 'RMK-C1', Name: 'Other', RmkCustomerNo: 'OTHER' }]), /another customer/);
  assert.throws(() => planRmkShops([{ No: 'C1', Name: 'Shop' }], [{ Code: 'A', Name: 'Shop' }, { Code: 'B', Name: 'SHOP' }]), /Ambiguous/);
  assert.throws(() => planRmkShops([{ No: 'C1', Name: 'Shop' }], [{ Code: 'A', RmkCustomerNo: 'C1' }, { Code: 'B', RmkCustomerNo: 'C1' }]), /multiple shops/);
});
