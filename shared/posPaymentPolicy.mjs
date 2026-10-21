const normalize=value=>String(value??'').trim().toUpperCase();
export const defaultPaymentCodes=['MPESA','CARD','DEPOSIT'];
export function paymentClassForCode(code,fallback){return {MPESA:'Mobile',CARD:'Card',DEPOSIT:'BankDeposit'}[normalize(code)]||fallback}
export function blockedPaymentMethod(method){return !normalize(method.Code)}
export function requirePaymentMethod(methods,code){
 const selected=normalize(code);
 if(!selected)throw new Error('Select a payment method before checkout');
 const method=methods.find(m=>normalize(m.Code)===selected);
 if(!method||!method.IsActive||blockedPaymentMethod(method))throw new Error('Select an active payment method assigned to this shop.');
 return method;
}
