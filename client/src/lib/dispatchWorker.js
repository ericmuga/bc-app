import {reactive} from 'vue'
let stored={}
try{stored=JSON.parse(sessionStorage.getItem('dispatch-workers')||'{}')}catch{}
export const dispatchWorkers=reactive(stored)
export function workerFor(stage,parentId){const value=dispatchWorkers[stage];return value&&value.parentId===String(parentId)?value:null}
export function setWorker(stage,value,parentId){if(value)dispatchWorkers[stage]={...value,parentId:String(parentId)};else delete dispatchWorkers[stage];sessionStorage.setItem('dispatch-workers',JSON.stringify(dispatchWorkers))}
export function currentWorkerStage(){return /^\/dispatch\/(assembly|packing|loading)(?:\/|$)/.exec(window.location.pathname)?.[1]}
