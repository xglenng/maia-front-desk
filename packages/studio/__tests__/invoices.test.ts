import {test} from 'node:test';
import assert from 'node:assert/strict';
import {invoiceInput} from '../../invoices/input';
const base={artistId:'11111111-1111-4111-8111-111111111111',requestId:'22222222-2222-4222-8222-222222222222',clientName:'Test Client',clientEmail:'client@example.test',lines:[{name:'Tattoo',quantity:1,unitCents:1000}]};
test('invoice input validates client, amounts, limits, and due dates',()=>{
 assert.equal(invoiceInput.safeParse(base).success,true);
 for(const change of [{clientEmail:'bad'},{dueDays:0},{dueDays:91},{lines:[]},{lines:[{name:'x',quantity:2,unitCents:100000000}]},{lines:[{name:'x',quantity:1,unitCents:-1}]}])assert.equal(invoiceInput.safeParse({...base,...change}).success,false);
});
