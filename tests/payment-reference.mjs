import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinePaymentReferences, paymentReference } from '../shared/paymentReference.mjs';

test('manual references are kept for all payment classes', () => {
  for (const method of ['Cash','Mobile','Card','BankDeposit','BankTransfer','Credit','Coupon']) {
    assert.equal(paymentReference(` ${method}-123 `), `${method}-123`);
  }
  assert.equal(paymentReference(null), null);
});
test('manual M-Pesa references append to matched codes without duplicating them', () => {
  assert.equal(combinePaymentReferences('AAA, BBB', 'CCC'), 'AAA, BBB, CCC');
  assert.equal(combinePaymentReferences('AAA, BBB', 'BBB'), 'AAA, BBB');
  assert.equal(combinePaymentReferences('', 'MANUAL123'), 'MANUAL123');
});
test('coupon codes and payment references are both preserved and length checked', () => {
  assert.equal(paymentReference(combinePaymentReferences('COUPON123','Slip 42')), 'COUPON123, Slip 42');
  assert.equal(paymentReference('A'.repeat(100)).length,100);
  assert.throws(() => paymentReference('A'.repeat(101)), /at most 100/);
});
