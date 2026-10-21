export function reportDate(value){
 if(value==null||value==='')return null;
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
 const d=value instanceof Date?value:new Date(value);
 if(!Number.isFinite(d.getTime()))throw new Error('Invalid report date');
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function localReportDate(value){
 if(!value)return null;
 const [year,month,day]=String(value).slice(0,10).split('-').map(Number);
 return new Date(year,month-1,day);
}
