import * as Workers from '../models/DispatchWorkerModel.js';
const action=fn=>async(req,res)=>{try{res.json(await fn(req))}catch(e){res.status(400).json({error:e.message})}};
export const list=action(()=>Workers.workers());
export const save=action(r=>Workers.saveWorker(r.body,r.user));
export const start=action(r=>Workers.delegate(r.body,r.user));
export const end=action(r=>Workers.endDelegation(r.body.token,r.user));
export const history=action(()=>Workers.history());
