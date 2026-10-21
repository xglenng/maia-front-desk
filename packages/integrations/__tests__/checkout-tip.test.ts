import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutTip} from '../checkout-tip';
test('tip presets round to cents against the remaining balance',()=>{
 assert.deepEqual(checkoutTip(1001,15,''),{tipCents:150,valid:true,totalCents:1151});
 assert.equal(checkoutTip(999,20,'').tipCents,200);
 assert.equal(checkoutTip(1000,25,'').totalCents,1250);
 assert.equal(checkoutTip(1000,0,'bad').totalCents,1000);
});
test('custom tips accept cents and reject invalid or excessive input',()=>{
 assert.equal(checkoutTip(1000,'custom','1.25').totalCents,1125);
 for(const value of ['', '-1','1.234','1e2','Infinity','1000.01'])assert.equal(checkoutTip(1000,'custom',value).valid,false);
 assert.equal(checkoutTip(-1,15,'').valid,false);
});
