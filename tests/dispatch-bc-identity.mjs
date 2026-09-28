import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bcOrderIdentity} from '../server/src/services/dispatchBcIdentity.js';
import {packedPayload} from '../server/src/services/dispatchPackedPayload.js';

test('BC identifiers survive import and quantity export including gaps and repeated items',()=>{
  const source=bcOrderIdentity('SL10102',[{LineNo:10000,ItemNo:'SAME'},{LineNo:35000,ItemNo:'SAME'}]);
  assert.deepEqual(source,{documentNo:'SL10102',lineNumbers:[10000,35000]});
  for(const line of source.lineNumbers){
    const payload=packedPayload({OrderNo:source.documentNo,BcLineNo:line,DispatchNo:'DSP-20260924-1001',ItemNo:'SAME',PackedQty:4,PackedUser:'packer'});
    assert.equal(payload['Document No_'],'SL10102');assert.equal(payload['Line No_'],line);
  }
});
test('missing, duplicate and invalid BC source identifiers cannot be replaced with local numbering',()=>{
  for(const LineNo of [undefined,null,0,-1,1.5,2147483648,'invalid'])assert.throws(()=>bcOrderIdentity('SL10102',[{LineNo}]),/line number/);
  assert.throws(()=>bcOrderIdentity('SL10102',[{LineNo:10000},{LineNo:10000}]),/Duplicate/);
  assert.throws(()=>bcOrderIdentity('',[{LineNo:10000}]),/order number/);
});
