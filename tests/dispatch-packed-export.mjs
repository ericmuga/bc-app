import {test} from 'node:test';
import assert from 'node:assert/strict';
import {packedPayload,packedHash,compareStaging} from '../server/src/services/dispatchPackedPayload.js';
import {bindImportedPayload,newImportedAssembly} from '../server/src/models/DispatchPackedExportModel.js';
const row={OrderNo:'SO123',BcLineNo:20000,ItemNo:'ITEM1',PackedQty:12,PackedUser:'packer1',Uom:'PC',WeightKg:6};
test('new imported assemblies explicitly initialise the AL pending state and undefined execution date',()=>{
 const payload=packedPayload(row),insert=newImportedAssembly(payload);
 assert.equal(insert.Status,0);assert.equal(insert.Executed,false);assert.equal(insert['Error Message'],'');
 assert.equal(insert['Executed At'].toISOString(),'1753-01-01T00:00:00.000Z');
 assert.ok(!('Status' in payload),'export identity/hash must not include BC execution state');
 for(const Type of ['datetime','datetime2']){
  const values=[];
  bindImportedPayload({input(name,type,value){values.push(value)}},{Status:insert.Status,'Executed At':insert['Executed At']},[{Name:'Status',Type:'int'},{Name:'Executed At',Type,Scale:3}]);
  assert.equal(values[0],0);assert.equal(values[1].toISOString(),'1753-01-01T00:00:00.000Z');
 }
});
test('PC export retains pieces as quantity; KG is not substituted',()=>{const p=packedPayload(row);assert.equal(p.Quantity,12);assert.equal(p['Line No_'],20000);assert.equal(p['Return Reason Code'],'');assert.ok(!('WeightKg' in p));assert.equal(packedHash(p),packedHash(packedPayload({...row,WeightKg:99})));});
test('weighted lines export packed quantity in their source UOM',()=>{assert.equal(packedPayload({...row,Uom:'KG',PackedQty:6.25}).Quantity,6.25);});
test('retries skip identical executed rows, but never overwrite executed differences',()=>{const p=packedPayload(row);assert.equal(compareStaging({...p,Executed:true},p,true),'unchanged');assert.throws(()=>compareStaging({...p,Quantity:1,Executed:true},p,true),/executed/);assert.throws(()=>compareStaging(null,p,true),/no longer/);assert.throws(()=>compareStaging({...p,Quantity:1,Executed:false},p,false),/different row/);assert.equal(compareStaging({...p,Quantity:1,Executed:false},p,true),'update');});
test('invalid source identifiers and BC-length overflow are rejected',()=>{assert.throws(()=>packedPayload({...row,BcLineNo:0}),/line number/);assert.throws(()=>packedPayload({...row,PackedQty:-1}),/non-negative/);assert.throws(()=>bindImportedPayload({input(){}},{'User ID':'long-user'},[{Name:'User ID',Type:'nvarchar',MaxLength:4}]),/exceeds/);});
