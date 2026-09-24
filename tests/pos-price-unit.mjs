import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesPriceUnit } from '../server/src/services/posPriceUnit.js';

test('CM piece prices use BC sales unit, not eTIMS unit or base weight', () => {
  const item = { SalesUnitOfMeasure:'PC', BaseUnitOfMeasure:'KG', UnitOfMeasure:'U' };
  assert.equal(matchesPriceUnit('PC', item), true);
  assert.equal(matchesPriceUnit('KG', item), false);
  assert.equal(matchesPriceUnit('U', item), false);
});
test('blank sales unit falls back to BC base unit before eTIMS', () => {
  const item = { SalesUnitOfMeasure:' ', BaseUnitOfMeasure:'KG', UnitOfMeasure:'U' };
  assert.equal(matchesPriceUnit(' kg ', item), true);
  assert.equal(matchesPriceUnit('U', item), false);
});
test('legacy items and unspecified price units remain supported', () => {
  assert.equal(matchesPriceUnit('PC', {UnitOfMeasure:'PC'}), true);
  assert.equal(matchesPriceUnit('', {SalesUnitOfMeasure:'PC'}), true);
  assert.equal(matchesPriceUnit('BOX', {SalesUnitOfMeasure:'PC'}), false);
});
