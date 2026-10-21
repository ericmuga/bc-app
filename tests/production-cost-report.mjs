import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCostFilters,productionShare,PRODUCTION_COST_LIVE_SERVER} from '../server/src/models/ProductionCostReport.js';
test('requires FG and a real bounded date range',()=>{
 const valid={fg:'BJ*|JF*',dateFrom:'2026-10-01',dateTo:'2026-10-07',levels:2};
 assert.equal(validateCostFilters(valid).levels,2);
 for(const change of [{fg:''},{dateFrom:'2026-02-30'},{dateTo:'2026-09-30'},{dateFrom:'2025-01-01'},{levels:6},{levels:1.5}])assert.throws(()=>validateCostFilters({...valid,...change}));
});

test('partial output and nested ingredients allocate proportionally without duplicating production',()=>{
 const root=productionShare([{ItemNo:'FG',Quantity:100}],'FG',25);
 assert.equal(60*root,15);
 const child=root*productionShare([{ItemNo:'MIX',Quantity:120}],'MIX',60);
 assert.equal(240*child,30);
 assert.equal(productionShare([{ItemNo:'FG',Quantity:100}],'FG',-25),-0.25);
});
test('mixed FG and non-positive production cannot be allocated silently',()=>{
 for(const outputs of [[],[{ItemNo:'FG',Quantity:0}],[{ItemNo:'FG',Quantity:-1}],[{ItemNo:'OTHER',Quantity:10}],[{ItemNo:'FG',Quantity:10},{ItemNo:'CO',Quantity:5}]])assert.equal(productionShare(outputs,'FG',5),null);
});

test('company selection is normalized, deduplicated and restricted to live mirrors',()=>{
 const base={fg:'JF*',dateFrom:'2026-10-01',dateTo:'2026-10-07'};
 assert.equal(PRODUCTION_COST_LIVE_SERVER,'172.16.10.8');
 assert.deepEqual(validateCostFilters({...base,companies:'cm,FCL,cm'}).companies,['CM','FCL']);
 assert.equal(validateCostFilters(base).companies.length,4);
 for(const companies of ['',[],['OTHER'],'FCL,OTHER'])assert.throws(()=>validateCostFilters({...base,companies}));
});
