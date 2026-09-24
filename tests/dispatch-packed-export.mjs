import {test} from 'node:test';
import assert from 'node:assert/strict';
import {packedPayload,packedHash,compareStaging} from '../server/src/services/dispatchPackedPayload.js';
import {bindImportedPayload} from '../server/src/models/DispatchPackedExportModel.js';
const row={OrderNo:'SO123',BcLineNo:20000,ItemNo:'ITEM1',PackedQty:12,PackedUser:'packer1',Uom:'PC',WeightKg:6};
test('PC export retains pieces as quantity; KG is not substituted',()=>{const p=packedPayload(row);assert.equal(p.Quantity,12);assert.equal(p['Line No_'],20000);assert.equal(p['Return Reason Code'],'');assert.ok(!('WeightKg' in p));assert.equal(packedHash(p),packedHash(packedPayload({...row,WeightKg:99})));});
test('weighted lines export packed quantity in their source UOM',()=>{assert.equal(packedPayload({...row,Uom:'KG',PackedQty:6.25}).Quantity,6.25);});
test('retries skip identical executed rows, but never overwrite executed differences',()=>{const p=packedPayload(row);assert.equal(compareStaging({...p,Executed:true},p,true),'unchanged');assert.throws(()=>compareStaging({...p,Quantity:1,Executed:true},p,true),/executed/);assert.throws(()=>compareStaging(null,p,true),/no longer/);assert.throws(()=>compareStaging({...p,Quantity:1,Executed:false},p,false),/different row/);assert.equal(compareStaging({...p,Quantity:1,Executed:false},p,true),'update');});
test('invalid source identifiers and BC-length overflow are rejected',()=>{assert.throws(()=>packedPayload({...row,BcLineNo:0}),/line number/);assert.throws(()=>packedPayload({...row,PackedQty:-1}),/non-negative/);assert.throws(()=>bindImportedPayload({input(){}},{'User ID':'long-user'},[{Name:'User ID',Type:'nvarchar',MaxLength:4}]),/exceeds/);});
