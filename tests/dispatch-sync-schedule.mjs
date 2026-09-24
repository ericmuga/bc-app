import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSchedule} from '../server/src/models/DispatchScheduleModel.js';
test('pull and push accept independent valid minute intervals',()=>{for(const kind of ['pull','push'])for(const intervalMinutes of [1,2,60,1440])assert.doesNotThrow(()=>validateSchedule('FCL',{kind,enabled:true,intervalMinutes}));assert.doesNotThrow(()=>validateSchedule('RMK',{kind:'push',enabled:false,intervalMinutes:15}));});
test('invalid company, kind, flags and intervals are rejected',()=>{const base={kind:'pull',enabled:true,intervalMinutes:2};assert.throws(()=>validateSchedule('BAD',base));for(const intervalMinutes of [0,-1,1.5,1441,null,'2'])assert.throws(()=>validateSchedule('CM',{...base,intervalMinutes}));assert.throws(()=>validateSchedule('CM',{...base,enabled:'false'}));assert.throws(()=>validateSchedule('CM',{...base,kind:'anything'}));});
