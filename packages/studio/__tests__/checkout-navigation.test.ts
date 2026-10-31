import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkoutVisibleStep,type CheckoutStep} from '../../checkout/navigation';
test('pending card recovery stays visible after catalog initialization or back navigation',()=>{
 for(const step of ['LIBRARY','REVIEW','PAYMENT'] as CheckoutStep[])assert.equal(checkoutVisibleStep(step,true),'PAYMENT');
});
test('resolved payments restore normal checkout navigation',()=>{
 for(const step of ['LIBRARY','REVIEW','PAYMENT'] as CheckoutStep[])assert.equal(checkoutVisibleStep(step,false),step);
});
