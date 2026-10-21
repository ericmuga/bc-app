import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paymentReconciliation} from '../shared/posCashReconciliation.mjs';
import {reportShopCode} from '../server/src/services/reportShopScope.js';
test('reconciliation separates shops/methods and leaves incomplete declarations unknown',()=>{
 const base={shopCode:'A',paymentTypeCode:'CASH',paymentTypeName:'Cash',opening:10,sales:20,cashIn:5,cashOut:2,expected:33,declared:34,variance:1};
 const rows=paymentReconciliation([base,{...base,declared:null,variance:null},{...base,paymentTypeCode:'MPESA'},{...base,shopCode:'B'}]);
 assert.equal(rows.length,3);assert.equal(rows[0].expected,66);assert.equal(rows[0].declared,null);assert.equal(rows[0].variance,null);assert.equal(rows[0].undeclaredSessions,1);assert.equal(rows[1].variance,1);
});
test('explicit reporting shop ignores terminal but respects assigned shops',async()=>{
 const req={user:{role:'shop',userId:'one'},headers:{'x-shop-code':'TERMINAL'},query:{shopCode:'OTHER'}};
 assert.equal(await reportShopCode(req,async()=>'HOME',async()=>['OTHER']),'OTHER');
 await assert.rejects(()=>reportShopCode(req,async()=>'HOME',async()=>[]),/not assigned/);
 assert.equal(await reportShopCode({...req,user:{role:'admin'}},async()=>'HOME'),'OTHER');
});
