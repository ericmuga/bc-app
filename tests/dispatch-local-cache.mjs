import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readDispatchCache,writeDispatchCache} from '../shared/dispatchLocalCache.mjs';
function memory(){let value=null;return {getItem:()=>value,setItem:(k,v)=>{value=v}}}
test('dispatch cache isolates workers, expires entries and preserves sync timestamps',()=>{
 const storage=memory();writeDispatchCache('worker1','sync',{status:'pending'},1000,storage);
 assert.equal(readDispatchCache('worker2','sync',storage),null);
 const saved=readDispatchCache('worker1','sync',storage);assert.equal(saved.value.status,'pending');assert.ok(saved.savedAt);
 writeDispatchCache('worker1','sync',{},-1,storage);assert.equal(readDispatchCache('worker1','sync',storage),null);
});
test('dispatch cache bounds storage and tolerates unavailable or corrupt storage',()=>{
 const storage=memory();for(let n=0;n<10;n++)writeDispatchCache('one',String(n),'x'.repeat(20000),10000,storage);
 assert.ok(storage.getItem().length<=120000);
 assert.equal(writeDispatchCache('one','large','x'.repeat(120001),1000,storage),false);
 const unavailable={getItem(){throw Error('blocked')}};
 assert.equal(readDispatchCache('one','x',unavailable),null);
 assert.equal(writeDispatchCache('one','x',{},1000,unavailable),false);
});
