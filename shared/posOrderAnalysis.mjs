export function decodeAmounts(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
}
export function reportOrderRows(rows) {
  return rows.map(row=>({...row,
    CreatedDate: row.CreatedAt ? new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(row.CreatedAt)) : '',
    Companies: decodeAmounts(row.CompanyAmounts).map(x=>x.company).join(', ')
  }));
}
// Allocate the order's sales value, not cash receipts, across each selected axis.
// This avoids counting a split-tender/mirror order's full total multiple times.
export function groupOrderSales(rows, fields) {
  const groups=new Map();
  const shares=(values,key)=>{
    const total=values.reduce((n,x)=>n+Math.max(0,Number(x.amount)||0),0);
    return total>0?values.filter(x=>Number(x.amount)>0).map(x=>({label:x[key]||'Unspecified',share:Number(x.amount)/total})):[{label:'Unspecified',share:1}];
  };
  for(const row of rows){
    let combinations=[{labels:[],share:1}];
    for(const field of fields){
      const values=field==='PaymentMethods'?shares(decodeAmounts(row.PaymentAmounts),'code'):
        field==='Companies'?shares(decodeAmounts(row.CompanyAmounts),'company'):[{label:row[field]||'Unspecified',share:1}];
      combinations=combinations.flatMap(c=>values.map(v=>({labels:[...c.labels,v.label],share:c.share*v.share})));
    }
    for(const c of combinations){
      const key=JSON.stringify(c.labels);
      if(!groups.has(key))groups.set(key,{...Object.fromEntries(fields.map((f,i)=>[f,c.labels[i]])),Orders:0,SalesAmount:0,PaidAmount:0,UnpaidAmount:0,ids:new Set()});
      const g=groups.get(key),amount=(Number(row.TotalAmount)||0)*c.share;
      g.ids.add(row.OrderId);g.Orders=g.ids.size;g.SalesAmount+=amount;
      if(row.Status==='paid')g.PaidAmount+=amount;
      else if(['open','saved','checkout'].includes(row.Status))g.UnpaidAmount+=amount;
    }
  }
  return [...groups.values()].map(({ids,...row})=>row);
}
