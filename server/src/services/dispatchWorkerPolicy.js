export const workerStages={assembly:'assembler',packing:'packer',loading:'loader'};
const mainRoles={assembly:['admin','dispatch-supervisor','assembler','packer'],packing:['admin','dispatch-supervisor','packer','checker'],loading:['admin','dispatch-supervisor','loader']};
export function assertDelegateStage(user,stage){if(!mainRoles[stage]?.includes(user.role)||user.delegationId)throw new Error('Your main account cannot delegate this stage');}
export function workerInput(body){
 const code=String(body.code||'').trim().toUpperCase(),name=String(body.name||'').trim();
 if(!/^[A-Z0-9_-]{1,30}$/.test(code)||!name||name.length>150)throw new Error('Worker code (letters/numbers) and name are required');
 if(body.passcode && !/^\d{6,12}$/.test(String(body.passcode)))throw new Error('Use a passcode of 6–12 digits');
 const stages=Object.keys(workerStages).filter(s=>body[s]===true);
 if(!stages.length)throw new Error('Select at least one work stage');
 return {code,name,stages};
}
