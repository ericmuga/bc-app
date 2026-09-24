import logger from './logger.js';
import {claimDueSchedule} from '../models/DispatchScheduleModel.js';
let timer,initialTimer,running=false,started=false,nextRunAt=null;
export function dispatchPullSchedule(){return {enabled:started,running,nextRunAt};}
export function startDispatchPullScheduler(){
 if(started)return;started=true;
 const tick=async()=>{
  nextRunAt=new Date(Date.now()+10000).toISOString();if(running)return;running=true;
  try{
   // Due times are claimed atomically in SQL so API instances share the schedule.
   for(let i=0;i<8&&started;i++){
    const job=await claimDueSchedule();if(!job)break;
    try{
     if(job.Kind==='pull'){const {importFromBc}=await import('../models/DispatchModel.js');await importFromBc({companies:[job.Company],trigger:'scheduled'});}
     else{const {pushPackedOrders}=await import('../models/DispatchPackedExportModel.js');await pushPackedOrders(job.Company,{userId:'dispatch-scheduler'},'scheduled');}
    }catch(e){logger.warn('Scheduled dispatch sync failed',{company:job.Company,kind:job.Kind,error:e.message});}
   }
  }catch(e){logger.warn('Dispatch scheduler failed',{error:e.message});}
  finally{running=false;}
 };
 nextRunAt=new Date(Date.now()+5000).toISOString();
 initialTimer=setTimeout(()=>{tick();timer=setInterval(tick,10000);timer.unref?.();},5000);initialTimer.unref?.();
}
export function stopDispatchPullScheduler(){clearTimeout(initialTimer);clearInterval(timer);started=false;nextRunAt=null;}
