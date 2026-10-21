// One small cache envelope per browser, with account-scoped keys and expiry.
const KEY='dispatch-mobile-v1', MAX_CHARS=120000;
export function readDispatchCache(scope,key,storage=globalThis.localStorage){
 try{const data=JSON.parse(storage.getItem(KEY)||'{}');const entry=data[`${scope}:${key}`];return entry?.expires>Date.now()?entry:null}catch{return null}
}
export function writeDispatchCache(scope,key,value,ttl=86400000,storage=globalThis.localStorage){
 try{
  const now=Date.now(),data=JSON.parse(storage.getItem(KEY)||'{}');
  for(const k of Object.keys(data))if(data[k].expires<=now)delete data[k];
  const id=`${scope}:${key}`;delete data[id];
  const entry={value,savedAt:now,expires:now+ttl};
  if(JSON.stringify(entry).length>MAX_CHARS/2)return false;
  data[id]=entry;
  while(JSON.stringify(data).length>MAX_CHARS){const oldest=Object.keys(data).find(k=>k!==id);if(!oldest)return false;delete data[oldest]}
  storage.setItem(KEY,JSON.stringify(data));return true;
 }catch{return false}
}
