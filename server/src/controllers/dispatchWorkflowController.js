import {schedules,saveSchedule} from '../models/DispatchScheduleModel.js';
import {packedExportPreview,pushPackedOrders} from '../models/DispatchPackedExportModel.js';
import {syncStatus} from '../models/DispatchSyncModel.js';
import * as Packing from '../models/DispatchPackingModel.js';
import * as Claims from '../models/DispatchClaimModel.js';
import * as Admin from '../models/DispatchAdminModel.js';
import {refreshUoms} from '../models/DispatchUomModel.js';
import {report,reportLookups} from '../models/DispatchReportModel.js';
const action=fn=>async(req,res)=>{try{res.json(await fn(req));}catch(e){res.status(400).json({error:e.message});}};
export const currentRun=action(r=>Packing.currentRun(r.user));
export const startRun=action(r=>Packing.startRun(r.user,r.body.checkerUserId));
export const endRun=action(r=>Packing.endRun(r.user,r.params.runId));
export const claim=action(r=>Claims.claim(r.user,r.params.id,r.body.stage,r.body.sessionId));
export const release=action(r=>Claims.release(r.user,r.params.id));
export const list=action(r=>Packing.worklist(r.user,r.query.status));
export const detail=action(r=>Packing.detail(r.params.id,r.user));
export const openBox=action(r=>Packing.openBox(r.params.id,r.body,r.user));
export const addLine=action(r=>Packing.addLine(r.params.boxId,r.body,r.user));
export const removeLine=action(r=>Packing.removeLine(r.params.boxLineId,r.user));
export const closeBox=action(r=>Packing.closeBox(r.params.boxId,r.body,r.user));
export const label=action(r=>Packing.label(r.params.boxId));
export const complete=action(r=>Packing.complete(r.params.id,r.user));
const attempts=new Map();
export const unpack=action(async r=>{
  const key=String(r.user.userId),now=Date.now(),entry=attempts.get(key);
  if(entry&&entry.until>now&&entry.count>=5)throw new Error('Too many supervisor verification attempts. Try again in 15 minutes');
  let approver;
  try{approver=await Admin.verifySupervisor(r.body.username,r.body.password);attempts.delete(key);}
  catch(e){attempts.set(key,{count:entry&&entry.until>now?entry.count+1:1,until:entry&&entry.until>now?entry.until:now+900000});throw e;}
  return Packing.unpack(r.params.boxId,r.body.reason,r.user,approver);
});
export const staff=action(()=>Admin.staff());
export const assignRole=action(r=>Admin.assignRole(r.params.userId,r.body.role,r.user));
export const barcode=action(r=>Admin.correctBarcode(r.body,r.user));
export const units=action(()=>refreshUoms());
export const reports=action(r=>report(r.query));

export const lookups=action(()=>reportLookups());
export const syncs=action(r=>syncStatus(r.query.kind||null,r.query.company||null));

export const packedExport=action(r=>packedExportPreview(r.query.company));

export const pushPacked=action(r=>pushPackedOrders(r.body.company,r.user));

export const getSchedules=action(r=>schedules(r.query.company||null));
export const setSchedule=action(r=>saveSchedule(r.params.company,r.body,r.user));
