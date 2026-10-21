// POS sales settle in whole Kenyan shillings; retain unit prices and line precision.
export function roundShillings(value){
 const amount=Number(value);
 if(!Number.isFinite(amount))throw new Error('Invalid sale amount');
 return Math.round(Math.round(amount*10000)/10000);
}
