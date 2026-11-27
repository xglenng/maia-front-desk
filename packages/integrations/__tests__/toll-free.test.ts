import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isUsTollFreeNumber,tollFreeApproval} from '../phone-number-type';
import {findAvailableTollFreeNumber} from '../twilio';
import {createTollFreeVerification,listTollFreeVerifications} from '../twilio-compliance';
import {maySendStudioSms} from '../studio-sms-policy';
test('only US toll-free prefixes select the toll-free path',()=>{
 for(const prefix of ['800','833','844','855','866','877','888'])assert.equal(isUsTollFreeNumber('+1'+prefix+'5550123'),true);
 for(const phone of ['+13035550123','+180055501','+448005550123','18005550123'])assert.equal(isUsTollFreeNumber(phone),false);
});
test('only provider toll-free approval enables sending',()=>{
 for(const status of [undefined,'APPROVED','PENDING_REVIEW','IN_REVIEW','TWILIO_REJECTED','UNKNOWN']){
  const state=tollFreeApproval(status);assert.equal(state.active,false);assert.equal(maySendStudioSms(state.complianceStatus,'production'),false);
 }
 assert.deepEqual(tollFreeApproval('TWILIO_APPROVED'),{active:true,complianceStatus:'APPROVED'});
});
test('new inventory uses TollFree and cannot fall back to a local number',async t=>{
 let requests=0;
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL)=>{requests++;assert.match(String(input),/AvailablePhoneNumbers\/US\/TollFree.json\?/);assert.doesNotMatch(String(input),/AreaCode/);return Response.json({available_phone_numbers:[{phone_number:requests===1?'+18885550123':'+13035550123'}]});});
 assert.equal(await findAvailableTollFreeNumber('AC_synthetic','synthetic'),'+18885550123');
 await assert.rejects(findAvailableTollFreeNumber('AC_synthetic','synthetic'),/did not return/);
});
test('verification requests use repeated array fields and only the assigned number',async t=>{
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(init?.method==='POST'){
   assert.equal(url,'https://messaging.twilio.com/v1/Tollfree/Verifications');
   const body=new URLSearchParams(String(init.body));assert.deepEqual(body.getAll('OptInImageUrls'),['https://example.test/one.jpg','https://example.test/two.jpg']);assert.equal(body.get('TollfreePhoneNumberSid'),'PN_synthetic');
   return Response.json({sid:'HH_synthetic'});
  }
  assert.match(url,/TollfreePhoneNumberSid=PN_synthetic/);return Response.json({verifications:[]});
 });
 const credentials={accountSid:'AC_synthetic',authToken:'synthetic'};
 await createTollFreeVerification(credentials,{TollfreePhoneNumberSid:'PN_synthetic',OptInImageUrls:['https://example.test/one.jpg','https://example.test/two.jpg']});
 assert.deepEqual((await listTollFreeVerifications(credentials,'PN_synthetic')).verifications,[]);
});
