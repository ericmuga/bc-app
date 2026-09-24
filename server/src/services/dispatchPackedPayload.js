import {createHash} from 'node:crypto';
export function packedPayload(row){
 const lineNo=Number(row.BcLineNo),quantity=Number(row.PackedQty);
 if(!Number.isInteger(lineNo)||lineNo<=0)throw new Error('Original BC line number is missing');
 if(!Number.isFinite(quantity)||quantity<0)throw new Error('Packed quantity must be non-negative');
 if(!row.OrderNo||!row.ItemNo||!row.PackedUser)throw new Error('Order, item and packing user are required');
 return {'Document No_':String(row.OrderNo).trim(),'Line No_':lineNo,'Item No_':String(row.ItemNo).trim(),Quantity:quantity,'User ID':String(row.PackedUser).trim(),'Return Reason Code':String(row.ReturnReasonCode||'').trim()};
}
export const packedHash=payload=>createHash('sha256').update(JSON.stringify(payload)).digest('hex');
export function compareStaging(existing,payload,previouslySynced){
 if(!existing){if(previouslySynced)throw new Error('Previously exported row is no longer in BC staging. Check whether BC processed it before exporting a correction');return 'insert';}
 const equal=Object.entries(payload).every(([key,value])=>typeof value==='number'?Math.abs(Number(existing[key])-value)<0.00005:String(existing[key]??'').trim()===value);
 if(equal)return 'unchanged';
 if(existing.Executed)throw new Error('BC has executed this row; resolve the correction in BC');
 if(!previouslySynced)throw new Error('A different row already exists in BC staging; review it before overwriting');
 if(String(existing['Error Message']||'').trim())throw new Error('BC reported an error on this row; resolve it before exporting a correction');
 return 'update';
}
