import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sessionMetrics,sessionAverage} from '../shared/dispatchSessionMetrics.mjs';
test('session totals sum KG entries and convert time to minutes and weight to tonnes',()=>{
  const row=sessionMetrics({DurationSeconds:120},[{WeightKg:1000},{WeightKg:500},{WeightKg:null}]);
  assert.equal(row.WeightKg,1500);assert.equal(row.Tonnes,1.5);assert.equal(row.KgPerMinute,750);assert.equal(row.MissingKg,1);
});
test('zero-duration and missing-weight sessions have no invented productivity',()=>{
  assert.equal(sessionMetrics({DurationSeconds:0},[{WeightKg:10}]).KgPerMinute,null);
  assert.equal(sessionMetrics({DurationSeconds:60},[{WeightKg:null}]).KgPerMinute,null);
});
test('overall rate uses total time while the session average weights each session equally',()=>{
 const a=sessionMetrics({DurationSeconds:60},[{WeightKg:60}]);
 const b=sessionMetrics({DurationSeconds:180},[{WeightKg:60}]);
 const result=sessionAverage([a,b]);assert.equal(result.weighted,30);assert.equal(result.mean,40);
});
