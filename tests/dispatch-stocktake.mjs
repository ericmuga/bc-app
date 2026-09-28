import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCount,assertCanCount} from '../server/src/services/dispatchStocktake.js';

test('piece counts are integral, allow explicit zero and normalise batch codes',()=>{
  assert.deepEqual(validateCount({itemNo:' abc ',uom:'pc',quantity:0,batchNo:'a123'}),{itemNo:'ABC',uom:'PC',quantity:0,pieces:0,batchNo:'A123',revision:0});
  assert.throws(()=>validateCount({itemNo:'ABC',uom:'PC',quantity:1.5}),/whole/);
});
test('weight counts retain pieces and reject missing, negative and nonfinite quantities',()=>{
  assert.equal(validateCount({itemNo:'A',uom:'KG',quantity:1.2345,pieces:2}).pieces,2);
  for(const quantity of [null,undefined,'',true,-1,Infinity,'oops',1.23456])assert.throws(()=>validateCount({itemNo:'A',uom:'KG',quantity}));
  for(const batchNo of ['12','123456','AB!D'])assert.throws(()=>validateCount({itemNo:'A',uom:'KG',quantity:1,batchNo}));
  assert.throws(()=>validateCount({itemNo:'A',uom:'KG',quantity:1,pieces:2.5}));
});
test('another attendant cannot modify a count and completed sessions cannot be changed by supervisors',()=>{
  const session={UserId:'one',CompletedAt:null};
  assertCanCount(session,{userId:'one',role:'chiller-attendant'});
  assertCanCount(session,{userId:'two',role:'dispatch-supervisor'});
  assert.throws(()=>assertCanCount(session,{userId:'two',role:'chiller-attendant'}),/Only/);
  assert.throws(()=>assertCanCount({...session,CompletedAt:new Date()},{userId:'one',role:'admin'}),/read-only/);
});
