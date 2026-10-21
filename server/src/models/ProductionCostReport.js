import {getLegacyPool,legacySql as sql} from '../db/legacyPool.js';
import {getSource} from '../services/legacyReports.js';
import {bcTable,ALL_COMPANIES} from '../services/bcTables.js';
import {compileBcTextFilter} from '../services/bcTextFilter.js';
export const PRODUCTION_COST_LIVE_SERVER='172.16.10.8';

export function validateCostFilters(input){
 const {dateFrom,dateTo}=input,fg=String(input.fg||'').trim(),levels=Number(input.levels||1);
 for(const d of [dateFrom,dateTo])if(!/^\d{4}-\d{2}-\d{2}$/.test(d||'')||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)throw new Error('Enter valid from/to dates');
 const days=(Date.parse(dateTo)-Date.parse(dateFrom))/86400000;
 if(days<0||days>92)throw new Error('Select a period of up to 93 days');
 if(!fg)throw new Error('Enter a finished-good item filter');
 if(!Number.isInteger(levels)||levels<1||levels>5)throw new Error('Select 1–5 ingredient levels');
 const requested=input.companies==null?ALL_COMPANIES:Array.isArray(input.companies)?input.companies:String(input.companies).split(',');
 const companies=[...new Set(requested.map(c=>String(c).trim().toUpperCase()))];
 if(!companies.length||companies.some(c=>!ALL_COMPANIES.includes(c)))throw new Error('Select valid companies: FCL, CM, FLM or RMK');
 return {dateFrom,dateTo,fg,levels,companies};
}
export function productionShare(outputs,itemNo,quantity){
 if(outputs.length!==1||outputs[0].ItemNo!==itemNo||Number(outputs[0].Quantity)<=0)return null;
 return Number(quantity)/Number(outputs[0].Quantity);
}
export async function productionCostReport(input){
 const filters=validateCostFilters(input),rows=[],warnings=[];let queries=0;
 for(const company of filters.companies){
  const source=getSource(`${company}-CUR`),pool=await getLegacyPool(source.database,PRODUCTION_COST_LIVE_SERVER);
  const ile=bcTable(company,'Item Ledger Entry'),ve=bcTable(company,'Value Entry'),item=bcTable(company,'Item'),app=bcTable(company,'Item Application Entry');
  const rq=()=>{if(++queries>600)throw new Error('Report is too large. Narrow the FG filter or period, or reduce levels');return pool.request()};
  const costs=`OUTER APPLY(SELECT SUM(v.[Cost Amount (Actual)]) ActualCost,SUM(v.[Cost Amount (Expected)]) ExpectedCost FROM ${ve} v WHERE v.[Item Ledger Entry No_]=l.[Entry No_]) c`;
  const fields=`l.[Entry No_] EntryNo,l.[Item No_] ItemNo,i.Description,i.[Base Unit of Measure] Uom,l.[Quantity] Quantity,COALESCE(c.ActualCost,0) ActualCost,COALESCE(c.ExpectedCost,0) ExpectedCost,l.[Order No_] OrderNo,l.[Order Line No_] OrderLineNo,l.[Order Type] OrderType,l.[Entry Type] EntryType,l.[Document No_] DocumentNo,l.[Posting Date] PostingDate`;
  const request=rq().input('from',sql.Date,filters.dateFrom).input('to',sql.Date,filters.dateTo);let n=0;
  const predicate=compileBcTextFilter('l.[Item No_]',filters.fg,value=>{const key=`fg${n++}`;request.input(key,sql.NVarChar(1000),value);return '@'+key});
  const roots=(await request.query(`SELECT TOP(5001) ${fields} FROM ${ile} l LEFT JOIN ${item} i ON i.[No_]=l.[Item No_] ${costs}
   WHERE l.[Posting Date]>=@from AND l.[Posting Date]<DATEADD(day,1,@to) AND l.[Entry Type] IN(2,6) AND ${predicate} ORDER BY l.[Item No_],l.[Entry No_]`)).recordset;
  if(roots.length>5000)throw new Error('More than 5,000 FG entries in a mirror. Narrow the filters');
  const cache=new Map();
  async function production(orderNo,lineNo){
   const key=JSON.stringify([orderNo,lineNo]);if(cache.has(key))return cache.get(key);
   const r=await rq().input('order',sql.NVarChar(20),orderNo).input('line',sql.Int,lineNo).query(`
    SELECT l.[Item No_] ItemNo,SUM(l.Quantity) Quantity FROM ${ile} l WHERE l.[Order Type]=1 AND l.[Order No_]=@order AND l.[Order Line No_]=@line AND l.[Entry Type]=6 GROUP BY l.[Item No_];
    SELECT TOP(5001) ${fields} FROM ${ile} l LEFT JOIN ${item} i ON i.[No_]=l.[Item No_] ${costs}
     WHERE l.[Order Type]=1 AND l.[Order No_]=@order AND l.[Order Line No_]=@line AND l.[Entry Type]=5 ORDER BY l.[Entry No_];`);
   if(r.recordsets[1].length>5000)throw new Error('Production order has too many ingredient entries; narrow filters');
   const result={outputs:r.recordsets[0],ingredients:r.recordsets[1]};cache.set(key,result);return result;
  }
  function add(root,entry,level,factor,parent,status=''){
   if(rows.length>=20000)throw new Error('Report exceeds 20,000 rows. Narrow filters or reduce levels');
   rows.push({Company:company,FG:root.ItemNo,FGDescription:root.Description,FGEntryNo:root.EntryNo,Level:level,ParentItem:parent,ItemNo:entry.ItemNo,Description:entry.Description,Uom:entry.Uom,EntryType:level?'Consumption':entry.EntryType===2?'Positive adjustment':'Output',Quantity:Number(entry.Quantity)*factor*(level?-1:1),ActualCost:Number(entry.ActualCost)*factor*(level?-1:1),ExpectedCost:Number(entry.ExpectedCost)*factor*(level?-1:1),ProductionOrder:entry.OrderNo,ProductionLine:entry.OrderLineNo,EntryNo:entry.EntryNo,PostingDate:entry.PostingDate,DocumentNo:entry.DocumentNo,TraceStatus:status});return rows[rows.length-1];
  }
  const applicationCache=new Map();
  async function expand(root,ingredient,level,factor,parent,path){
   const row=add(root,ingredient,level,factor,parent,'');
   if(level>=filters.levels){row.TraceStatus='Selected level limit';return}
   if(!applicationCache.has(ingredient.EntryNo)){
    const links=(await rq().input('entry',sql.Int,ingredient.EntryNo).query(`
     SELECT inbound.[Entry No_] EntryNo,inbound.[Item No_] ItemNo,inbound.[Entry Type] EntryType,inbound.[Order Type] OrderType,
      inbound.[Order No_] OrderNo,inbound.[Order Line No_] OrderLineNo,ABS(SUM(a.Quantity)) AppliedQuantity
     FROM ${app} a JOIN ${ile} inbound ON inbound.[Entry No_]=a.[Inbound Item Entry No_]
     WHERE a.[Outbound Item Entry No_]=@entry AND a.[Inbound Item Entry No_]<>0
     GROUP BY inbound.[Entry No_],inbound.[Item No_],inbound.[Entry Type],inbound.[Order Type],inbound.[Order No_],inbound.[Order Line No_]
     HAVING ABS(SUM(a.Quantity))>0`)).recordset;
    applicationCache.set(ingredient.EntryNo,links);
   }
   const links=applicationCache.get(ingredient.EntryNo),qty=Math.abs(Number(ingredient.Quantity));
   const applied=links.reduce((sum,l)=>sum+Number(l.AppliedQuantity),0);
   if(applied>qty+0.0001){row.TraceStatus='Application quantity exceeds consumption; trace stopped';return}
   const manufactured=links.filter(l=>l.EntryType===6&&l.OrderType===1&&l.OrderNo&&l.ItemNo===ingredient.ItemNo);
   if(!manufactured.length){row.TraceStatus=links.length?'Purchased/adjusted input — no production application':'No item application link';return}
   row.TraceStatus=applied<qty-0.0001?'Partially applied — only linked quantities expanded':'Production applications traced';
   for(const link of manufactured){
    const key=JSON.stringify([link.OrderNo,link.OrderLineNo]);
    if(path.includes(key)){row.TraceStatus='Production cycle detected; trace stopped';continue}
    const productionData=await production(link.OrderNo,link.OrderLineNo);
    if(productionShare(productionData.outputs,ingredient.ItemNo,link.AppliedQuantity)==null){row.TraceStatus='Ambiguous manufactured input output; trace stopped';continue}
    const childFactor=factor*Math.sign(-Number(ingredient.Quantity))*productionShare(productionData.outputs,ingredient.ItemNo,link.AppliedQuantity);
    for(const child of productionData.ingredients)await expand(root,child,level+1,childFactor,ingredient.ItemNo,[...path,key]);
   }
  }
  for(const root of roots){
   const result=add(root,root,0,1,'');
   if(root.EntryType===2){result.TraceStatus='Positive adjustment — no ingredient allocation';continue}
   if(root.OrderType!==1||!root.OrderNo){result.TraceStatus='No production-order link';continue}
   const p=await production(root.OrderNo,root.OrderLineNo);
   if(productionShare(p.outputs,root.ItemNo,root.Quantity)==null){result.TraceStatus='Ambiguous or non-positive production output; ingredients not allocated';continue}
   const factor=productionShare(p.outputs,root.ItemNo,root.Quantity);
   for(const ingredient of p.ingredients)await expand(root,ingredient,1,factor,root.ItemNo,[JSON.stringify([root.OrderNo,root.OrderLineNo])]);
   if(!p.ingredients.length)result.TraceStatus='No posted consumption on production line';
  }
 }
 return {rows,warnings,filters,generatedAt:new Date().toISOString(),source:`Live ERP ${PRODUCTION_COST_LIVE_SERVER} — ${filters.companies.join(', ')}`};
}
