import {test} from 'node:test';
import assert from 'node:assert/strict';
import {updatePriceDigits} from '../../checkout/price-entry';
test('keypad enters cents, handles double zero, and deletes digits',()=>{
 let digits='';for(const key of ['1','2','3'])digits=updatePriceDigits(digits,key);
 assert.equal(Number(digits),123);
 assert.equal(updatePriceDigits('5','00'),'500');
 assert.equal(updatePriceDigits('500','Backspace'),'50');
 assert.equal(updatePriceDigits('','Backspace'),'');
 assert.equal(updatePriceDigits('','00'),'');
});
test('keypad ignores non-digits and amounts beyond checkout limits',()=>{
 assert.equal(updatePriceDigits('12','.'),'12');
 assert.equal(updatePriceDigits('12','-'),'12');
 assert.equal(updatePriceDigits('10000000','0'),'100000000');
 assert.equal(updatePriceDigits('100000000','1'),'100000000');
 assert.equal(updatePriceDigits('99999999','9'),'99999999');
});
