import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertDelegateStage,workerInput} from '../server/src/services/dispatchWorkerPolicy.js';
test('main accounts can delegate only stages they are allowed to perform',()=>{
 assertDelegateStage({role:'assembler'},'assembly');assertDelegateStage({role:'loader'},'loading');
 for(const stage of ['assembly','packing','loading'])assertDelegateStage({role:'dispatch-supervisor'},stage);
 assert.throws(()=>assertDelegateStage({role:'assembler'},'loading'));
 assert.throws(()=>assertDelegateStage({role:'shop'},'assembly'));
 assert.throws(()=>assertDelegateStage({role:'admin',delegationId:'already-delegated'},'assembly'));
});
test('workers require identifiable codes, names, stages and suitable passcodes',()=>{
 assert.equal(workerInput({code:'cas-01',name:'Worker One',assembly:true,passcode:'123456'}).code,'CAS-01');
 for(const passcode of ['1234','abc123','1234567890123'])assert.throws(()=>workerInput({code:'A',name:'Worker',assembly:true,passcode}));
 assert.throws(()=>workerInput({code:'A',name:'Worker',assembly:false}));
});
