import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemblyValues,isWeightUnit } from '../shared/dispatchAssembly.mjs';

test('piece lines use integer pieces and a normalized 4/5-character batch',()=>{
  assert.deepEqual(assemblyValues({Uom:'PC',OrderQty:12},{pieces:12,batchNo:'a12b'}),
    {qty:12,weight:0,pieces:12,batch:'A12B',reason:null,reasonName:null});
  for(const batch of ['ABC','ABCDEF','AB-1','AB 1']) assert.throws(()=>assemblyValues({Uom:'PC',OrderQty:1},{pieces:1,batchNo:batch}),/Batch/);
  for(const pieces of [null,-1,1.5,'bad',Infinity]) assert.throws(()=>assemblyValues({Uom:'PC',OrderQty:1},{pieces,batchNo:'AB12'}),/pieces/);
});
test('weighted lines require both weight and pieces and compare weight to ordered qty',()=>{
  const line={Uom:'KG',OrderQty:10};
  assert.equal(isWeightUnit('kg'),true);
  assert.equal(assemblyValues(line,{pieces:3,assembledWeight:9.5,batchNo:'A1234'}).reason,'SHORT_SUPPLY');
  assert.equal(assemblyValues(line,{pieces:3,assembledWeight:10.5,batchNo:'A1234'}).reason,'WEIGHT_DIFFERENCE');
  assert.throws(()=>assemblyValues(line,{pieces:3,batchNo:'A1234'}),/weight/);
  assert.throws(()=>assemblyValues(line,{pieces:0,assembledWeight:10,batchNo:'A1234'}),/Pieces/);
});
test('zero supply can be completed with a reason and tolerance avoids floating point discrepancies',()=>{
  assert.equal(assemblyValues({Uom:'PC',OrderQty:3},{pieces:0,batchNo:'AB12'}).reason,'SHORT_SUPPLY');
  assert.equal(assemblyValues({Uom:'KG',OrderQty:0.3},{pieces:1,assembledWeight:0.1+0.2,batchNo:'AB12'}).reason,null);
  assert.equal(assemblyValues({Uom:'KG',OrderQty:10},{pieces:1,assembledWeight:9,batchNo:'AB12',returnReasonCode:'WEIGHT_DIFFERENCE'}).reason,'WEIGHT_DIFFERENCE');
});
test('weight stays in order units for quantity and kilograms for packing',()=>{
  const v=assemblyValues({Uom:'G',OrderQty:500},{pieces:2,assembledWeight:500,batchNo:'AB12'});
  assert.equal(v.qty,500);assert.equal(v.weight,0.5);assert.equal(v.reason,null);
});
