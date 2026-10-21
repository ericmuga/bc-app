import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requirePaymentMethod,defaultPaymentCodes} from '../shared/posPaymentPolicy.mjs';
test('checkout requires an explicitly selected, configured and active method',()=>{
 const methods=[{Code:'MPESA',IsActive:true},{Code:'CARD',IsActive:false}];
 for(const code of ['',null,'UNKNOWN','CARD'])assert.throws(()=>requirePaymentMethod(methods,code));
 assert.equal(requirePaymentMethod(methods,' mpesa ').Code,'MPESA');
});
test('admin-enabled custom methods are allowed and disabled methods remain blocked',()=>{
 const method={Code:'MPESA-NOTFOUND',PaymentClass:'Mobile',IsActive:true};
 assert.equal(requirePaymentMethod([method],'MPESA-NOTFOUND'),method);
 assert.throws(()=>requirePaymentMethod([{...method,IsActive:false}],'MPESA-NOTFOUND'));
 assert.throws(()=>requirePaymentMethod([],'MPESA-NOTFOUND'));
});
test('the initial sync defaults remain separate from admin activation decisions',()=>{
 assert.deepEqual(defaultPaymentCodes,['MPESA','CARD','DEPOSIT']);
 assert.equal(requirePaymentMethod([{Code:'CHEQUE',IsActive:true}],'CHEQUE').Code,'CHEQUE');
});
