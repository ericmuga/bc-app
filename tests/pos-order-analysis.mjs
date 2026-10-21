import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupOrderSales,reportOrderRows} from '../shared/posOrderAnalysis.mjs';
const row={OrderId:'a',Status:'paid',TotalAmount:100,CashierName:'Ann',CreatedAt:'2026-10-02T22:00:00Z',CompanyAmounts:JSON.stringify([{company:'FCL',amount:60},{company:'CM',amount:40}]),PaymentAmounts:JSON.stringify([{code:'CASH',amount:25},{code:'MPESA',amount:75}])};
test('split tenders and company mirrors preserve totals when grouped together',()=>{
 const groups=groupOrderSales(reportOrderRows([row]),['Companies','PaymentMethods']);
 assert.equal(groups.length,4);assert.equal(groups.reduce((n,r)=>n+r.SalesAmount,0),100);
 assert.equal(groups.find(r=>r.Companies==='FCL'&&r.PaymentMethods==='CASH').SalesAmount,15);
 assert.ok(groups.every(r=>r.Orders===1));
});
test('date groups use Nairobi dates and count each order once',()=>{
 const rows=reportOrderRows([row,{...row,OrderId:'b'}]);
 const groups=groupOrderSales(rows,['CreatedDate','CashierName']);
 assert.equal(groups[0].CreatedDate,'2026-10-03');assert.equal(groups[0].Orders,2);assert.equal(groups[0].PaidAmount,200);
});
test('unpaid orders without payments retain their sales in an unspecified group',()=>{
 const groups=groupOrderSales([{...row,Status:'open',PaymentAmounts:'[]'}],['PaymentMethods']);
 assert.equal(groups[0].PaymentMethods,'Unspecified');assert.equal(groups[0].UnpaidAmount,100);assert.equal(groups[0].PaidAmount,0);
});
