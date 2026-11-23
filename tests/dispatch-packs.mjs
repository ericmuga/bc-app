import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packBreakdown, packSize, validatePrepacks, groupByChiller } from '../shared/dispatchPacks.mjs';
import { dplRows, buildDplPdf, buildPrepackLabelsPdf } from '../server/src/services/dispatchPackPdf.js';

const sausage = { MainPackSize: 20, MiniPackSize: 10, AllowLoose: false };
const nyamabite = { MainPackSize: 5, MiniPackSize: 0, AllowLoose: false };

test('breakdown is largest pack first, rest loose (same as BC Order Pack Mgt.)', () => {
  assert.deepEqual(packBreakdown(sausage, 50), { mainPacks: 2, miniPacks: 1, loose: 0, text: '2 x 20 + 1 x 10' });
  assert.deepEqual(packBreakdown(sausage, 37), { mainPacks: 1, miniPacks: 1, loose: 7, text: '1 x 20 + 1 x 10 + 7 loose' });
  assert.equal(packBreakdown({ MainPackSize: 24, MiniPackSize: 12 }, 36).text, '1 x 24 + 1 x 12');
  assert.equal(packBreakdown(nyamabite, 15).text, '3 x 5');
  assert.equal(packBreakdown(nyamabite, 7).text, '1 x 5 + 2 loose');
  assert.equal(packBreakdown({ MainPackSize: 0 }, 9).text, '', 'not a pack item');
  assert.equal(packBreakdown(sausage, 0).text, '');
});

test('pack size by type', () => {
  assert.equal(packSize(sausage, 'main'), 20);
  assert.equal(packSize(sausage, 'mini'), 10);
  assert.equal(packSize(nyamabite, 'mini'), 0);
});

test('prepacks must match the line, be unused and fit the pieces', () => {
  const line = { LineId: 'L1', ItemNo: 'J31015501', Company: 'FCL' };
  const pp = (no, extra = {}) => ({ PrepackNo: no, ItemNo: 'J31015501', Company: 'FCL', PackSize: 20, Status: 'available', ...extra });
  assert.equal(validatePrepacks(line, [pp('PP1'), pp('PP2', { PackSize: 10 })], 37), 30);
  assert.equal(validatePrepacks(line, [pp('PP1', { Status: 'used', LineId: 'l1' })], 20), 20, 'already on this line (correction)');
  assert.throws(() => validatePrepacks(line, [pp('PP1'), pp('PP1')], 99), /twice/);
  assert.throws(() => validatePrepacks(line, [pp('PP1', { ItemNo: 'X' })], 99), /for item X/);
  assert.throws(() => validatePrepacks(line, [pp('PP1', { Company: 'CM' })], 99), /company CM/);
  assert.throws(() => validatePrepacks(line, [pp('PP1', { Status: 'void' })], 99), /void/);
  assert.throws(() => validatePrepacks(line, [pp('PP1', { Status: 'used', LineId: 'L2', OrderNo: 'SO9' })], 99), /already used on order SO9/);
  assert.throws(() => validatePrepacks(line, [pp('PP1'), pp('PP2')], 30), /more than the 30 pieces/);
});

const order = {
  DispatchNo: 'DSP-1', OrderNo: 'SO-TEST', Company: 'FCL', CustomerNo: 'C1', CustomerName: 'Test', ShipmentDate: '2026-11-24',
  lines: [
    { LineId: 'a', Part: 'A', SortOrder: 2, ItemNo: 'J31015501', Description: 'Beef Sausage Catering 1Kg', Uom: 'PC', OrderQty: 50, Chiller: 'CHILLER V', ...sausage,
      Completed: true, Pieces: 50, BatchNo: 'B123', Prepacks: [{ PrepackNo: 'PP0000001', PackSize: 20 }, { PrepackNo: 'PP0000002', PackSize: 20 }] },
    { LineId: 'b', Part: 'A', SortOrder: 1, ItemNo: 'J31070102', Description: 'Nyamabite, 125gms', Uom: 'PC', OrderQty: 15, Chiller: 'CHILLER U', ...nyamabite },
    { LineId: 'c', Part: 'B', SortOrder: 3, ItemNo: 'X1', Description: 'Unmapped item', Uom: 'KG', OrderQty: 3.5, Chiller: null, MainPackSize: 0 },
  ],
};

test('DPL groups by chiller (UNMAPPED last) and shows packs, assembled pieces and prepacks', () => {
  assert.deepEqual(groupByChiller(order.lines).map(g => g.chiller), ['CHILLER U', 'CHILLER V', 'UNMAPPED']);
  const rows = dplRows(groupByChiller(order.lines)[1].lines);
  assert.deepEqual(rows[0], ['A', 'J31015501', 'Beef Sausage Catering 1Kg', 'PC', '50', '2 x 20 + 1 x 10', '50 pcs', 'PP0000001 (20), PP0000002 (20)', 'B123']);
  assert.equal(dplRows([order.lines[2]])[0][5], '', 'no packs for a non-pack item');
});

test('DPL and label PDFs are produced', async () => {
  const all = buildDplPdf(order);
  assert.equal(all.subarray(0, 5).toString(), '%PDF-');
  const one = buildDplPdf(order, { chiller: 'CHILLER U' });
  assert.ok(one.length > 1000 && one.length < all.length);
  assert.throws(() => buildDplPdf(order, { chiller: 'CHILLER Z' }), /no lines for CHILLER Z/);
  const labels = await buildPrepackLabelsPdf([{ PrepackNo: 'PP0000001', PackType: 'main', PackSize: 20, ItemNo: 'J31015501', Description: 'Beef Sausage Catering 1Kg', Company: 'FCL', CreatedAt: new Date() }]);
  assert.equal(labels.subarray(0, 5).toString(), '%PDF-');
});
