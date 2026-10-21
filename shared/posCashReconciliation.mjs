export function paymentReconciliation(rows){
 const groups=new Map();
 for(const row of rows){
  const key=JSON.stringify([row.shopCode,row.paymentTypeCode]);
  if(!groups.has(key))groups.set(key,{shopCode:row.shopCode,paymentTypeCode:row.paymentTypeCode,paymentTypeName:row.paymentTypeName,opening:0,sales:0,cashIn:0,cashOut:0,expected:0,declared:0,variance:0,undeclaredSessions:0});
  const total=groups.get(key);
  for(const field of ['opening','sales','cashIn','cashOut','expected'])total[field]+=Number(row[field]||0);
  if(row.declared==null)total.undeclaredSessions++;
  else {total.declared+=Number(row.declared);total.variance+=Number(row.variance||0)}
 }
 return [...groups.values()].map(row=>row.undeclaredSessions?{...row,declared:null,variance:null}:row);
}
