import {test} from 'node:test';
import assert from 'node:assert/strict';
import {offlineStore} from '../shared/dispatchOffline.mjs';
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}};
test('offline work survives reopening, isolates workers, and clears only its own bundle',()=>{
 const storage=memory(),a=offlineStore('a',storage),b=offlineStore('b',storage);
 const packet={queue:[{requestId:'stable-retry-id',synced:false}],downloadedAt:1};
 a.write(packet);assert.deepEqual(offlineStore('a',storage).read(),packet);assert.equal(b.read(),null);
 b.write({queue:[]});a.clear();assert.equal(a.read(),null);assert.deepEqual(b.read(),{queue:[]});
});
test('oversized or failed writes do not destroy existing work and errors are visible',()=>{
 const storage=memory(),store=offlineStore('a',storage);store.write({queue:[1]});
 assert.throws(()=>store.write({data:'x'.repeat(1500001)}),/too large/);
 assert.deepEqual(store.read(),{queue:[1]});
 const blocked=offlineStore('a',{...storage,setItem(){throw Error('Quota exceeded')}});
 assert.throws(()=>blocked.write({queue:[2]}),/Quota/);assert.deepEqual(store.read(),{queue:[1]});
});
test('corrupt persisted work is reported rather than silently overwritten',()=>{
 const storage=memory();storage.setItem('dispatch-offline-assembly-v1:a','invalid');
 assert.throws(()=>offlineStore('a',storage).read());
});
