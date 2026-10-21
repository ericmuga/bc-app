import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workerLanding,workerRoutes} from '../shared/dispatchWorkerRoutes.mjs';

test('subworkers land directly on their assigned dispatch function without an AD role',()=>{
  for(const [stage,path] of Object.entries({assembly:'assembly',packing:'packing',loading:'loading',stocktake:'stocktakes'})){
    assert.equal(workerLanding({role:'dispatch-worker',workerStages:[stage]}),'/dispatch/'+path);
  }
  assert.deepEqual(workerRoutes({workerStages:['packing','stocktake']}),['/dispatch/packing','/dispatch/stocktakes']);
});
test('missing or unknown assignments cannot route subworkers into normal account pages',()=>{
  assert.equal(workerLanding({workerStages:[]}),'/no-access');
  assert.equal(workerLanding({workerStages:['admin']}),'/no-access');
});
