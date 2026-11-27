import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import type {NextRequest} from 'next/server';
export async function runTollFreeChecks({local,request,org,other,owner,artist}:{local:Pool;request:(path:string,who?:string,body?:object)=>NextRequest;org:string;other:string;owner:string;artist:string}){
 const keys=['TWILIO_WEBHOOK_BASE_URL','TWILIO_ENCRYPTION_KEY','TWILIO_PROVISION_MODE','TWILIO_COMPLIANCE_MODE'];const prior=keys.map(key=>process.env[key]);
 process.env.TWILIO_WEBHOOK_BASE_URL='https://example.com';
 process.env.TWILIO_ENCRYPTION_KEY=Buffer.alloc(32,9).toString('base64');process.env.TWILIO_PROVISION_MODE='live';process.env.TWILIO_COMPLIANCE_MODE='live';
 const {encryptSecret}=await import('../../integrations/twilio');
 const account=randomUUID(),tfArtist=randomUUID(),legal=randomUUID(),service=randomUUID(),number=randomUUID();
 const accountSid='AC'+'a'.repeat(32),serviceSid='MG'+'b'.repeat(32),numberSid='PN'+'c'.repeat(32),verificationSid='HH'+'d'.repeat(32);
 await local.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Toll-free artist')",[tfArtist,org]);
 // Account is business-owned; its historical artist differs from this new artist.
 await local.query("INSERT INTO twilio_accounts(id,organization_id,artist_id,account_sid,auth_token_encrypted,status) VALUES($1,$2,$3,$4,$5,'ACTIVE')",[account,org,artist,accountSid,encryptSecret('synthetic-toll-free-token')]);
 await local.query("INSERT INTO legal_customers(id,organization_id,customer_type,legal_name) VALUES($1,$2,'STUDIO','Synthetic Studio LLC')",[legal,org]);
 await local.query("INSERT INTO legal_customer_accounts(organization_id,legal_customer_id,twilio_account_id,verified_by_user_id,verified_at,verification_reference) VALUES($1,$2,$3,$4,now(),'synthetic reviewed binding')",[org,legal,account,owner]);
 await local.query("INSERT INTO twilio_messaging_services(id,organization_id,artist_id,twilio_account_id,service_sid) VALUES($1,$2,$3,$4,$5)",[service,org,tfArtist,account,serviceSid]);
 await local.query("INSERT INTO phone_numbers(id,organization_id,artist_id,twilio_account_id,twilio_phone_number_sid,twilio_messaging_service_sid,phone_number,provider,active,compliance_status) VALUES($1,$2,$3,$4,$5,$6,'+18885550123','twilio',false,'TOLL_FREE_NOT_SUBMITTED')",[number,org,tfArtist,account,numberSid,serviceSid]);
 const previousFetch=globalThis.fetch;let creates=0,foreignResponse=false;let verification:{sid:string;account_sid:string;tollfree_phone_number_sid:string;status:string}|undefined;
 globalThis.fetch=async(input,init)=>{
  const url=String(input);
  if(url.includes('/IncomingPhoneNumbers/'))return Response.json({sid:numberSid,account_sid:foreignResponse?'AC'+'e'.repeat(32):accountSid,phone_number:'+18885550123'});
  if(url.endsWith(`/Services/${serviceSid}/PhoneNumbers?PageSize=100`))return Response.json({phone_numbers:[{sid:numberSid}]});
  if(url.includes('/Tollfree/Verifications?'))return Response.json({verifications:verification?[verification]:[],meta:{next_page_url:null}});
  if(url.endsWith('/Tollfree/Verifications')&&init?.method==='POST'){
   creates++;const body=new URLSearchParams(String(init.body));assert.equal(body.get('BusinessName'),'Synthetic Studio LLC');assert.equal(body.get('TollfreePhoneNumberSid'),numberSid);assert.equal(body.get('ExternalReferenceId'),number);
   verification={sid:verificationSid,account_sid:accountSid,tollfree_phone_number_sid:numberSid,status:'PENDING_REVIEW'};return Response.json(verification,{status:201});
  }
  throw Error('Unexpected provider request '+url);
 };
 try{
  const {POST}=await import('../../../app/api/twilio/toll-free/route');
  const payload={organizationId:org,artistId:tfArtist,action:'SYNC'};
  assert.equal((await POST(request('/api/twilio/toll-free','a',payload),undefined)).status,200);
  assert.equal((await POST(request('/api/twilio/toll-free','d',{...payload,organizationId:other}),undefined)).status,404);
  const details={BusinessName:'Synthetic Studio LLC',BusinessWebsite:'https://studio.example.com',NotificationEmail:'notify@example.test',BusinessStreetAddress:'123 Test Street',BusinessCity:'Denver',BusinessStateProvinceRegion:'CO',BusinessPostalCode:'80201',BusinessCountry:'US',BusinessContactFirstName:'Test',BusinessContactLastName:'Owner',BusinessContactEmail:'test@example.test',BusinessContactPhone:'+13035550123',BusinessRegistrationNumber:'123456789',BusinessRegistrationAuthority:'EIN',BusinessRegistrationCountry:'US',BusinessType:'PRIVATE_PROFIT',UseCaseCategories:['CUSTOMER_CARE'],UseCaseSummary:'This studio responds to opted-in customer appointment questions.',ProductionMessageSample:'Synthetic Studio: Your appointment is confirmed. Reply STOP to opt out.',OptInImageUrls:['https://studio.example.com/consent.jpg'],OptInType:'WEB_FORM',MessageVolume:'1000',PrivacyPolicyUrl:'https://studio.example.com/privacy',TermsAndConditionsUrl:'https://studio.example.com/terms'};
  const submit={...payload,action:'SUBMIT',details,confirmed:true};
  assert.equal((await POST(request('/api/twilio/toll-free','a',{...submit,confirmed:false}),undefined)).status,400);
  const responses=await Promise.all([POST(request('/api/twilio/toll-free','a',submit),undefined),POST(request('/api/twilio/toll-free','a',submit),undefined)]);
  for(const response of responses)assert.equal(response.status,200,response.status!==200?await response.clone().text():'');assert.equal(creates,1,'Concurrent submission must not create duplicates');
  let row=(await local.query('SELECT active,compliance_status FROM phone_numbers WHERE id=$1',[number])).rows[0];assert.equal(row.active,false);
  verification!.status='TWILIO_APPROVED';
  const synced=await POST(request('/api/twilio/toll-free','a',payload),undefined);assert.equal(synced.status,200);assert.equal((await synced.json()).active,true);
  const {assertStudioSmsReady}=await import('../../integrations/studio-sms');
  await assert.rejects(assertStudioSmsReady({organizationId:org,artistId:tfArtist,clientId:randomUUID(),phone:'+13035550123'}),/consent|opted in/,'Verified toll-free must still require client consent, while accepting the reviewed shared business account');
  const tfClient=randomUUID(),tfForm=randomUUID();
  await local.query("INSERT INTO clients(id,organization_id,first_name,phone) VALUES($1,$2,'Consenting synthetic client','+13035550999')",[tfClient,org]);
  await local.query("INSERT INTO artist_consent_forms(id,organization_id,artist_id,slug,disclosure_text) VALUES($1,$2,$3,$4,'Synthetic test consent')",[tfForm,org,tfArtist,'tf-'+tfForm]);
  const {grantVerifiedInboundConsent}=await import('../../consent/server');
  await grantVerifiedInboundConsent({organizationId:org,artistId:tfArtist,clientId:tfClient,consentFormId:tfForm,phone:'+13035550999',consented:true,source:'INBOUND_SMS_CONFIRMATION',sourceUrl:'https://example.com/consent',disclosureText:'Synthetic',disclosureVersion:1,privacyPolicyUrl:'https://example.com/privacy',termsUrl:'https://example.com/terms',externalSubmissionId:'SM_tf_synthetic'});
  await assertStudioSmsReady({organizationId:org,artistId:tfArtist,clientId:tfClient,phone:'+13035550999'});
  const {GET:phoneStatus}=await import('../../../app/api/twilio/status/route');
  const info=await phoneStatus(request('/api/twilio/status?artistId='+tfArtist,'a'),undefined);assert.equal(info.status,200);assert.equal((await info.json()).artists[0].provisioned,true);
  verification!.status='TWILIO_REJECTED';await POST(request('/api/twilio/toll-free','a',payload),undefined);
  row=(await local.query('SELECT active,compliance_status FROM phone_numbers WHERE id=$1',[number])).rows[0];assert.deepEqual(row,{active:false,compliance_status:'TOLL_FREE_REJECTED'});
  foreignResponse=true;assert.equal((await POST(request('/api/twilio/toll-free','a',payload),undefined)).status,409);foreignResponse=false;
  const {syncLiveRegistration}=await import('../../compliance/live-registration');
  await assert.rejects(syncLiveRegistration({organizationId:org} as Parameters<typeof syncLiveRegistration>[0]),/Toll-free numbers use toll-free verification/);
  verification=undefined;const retry=await POST(request('/api/twilio/toll-free','a',submit),undefined);assert.equal(retry.status,409);assert.equal(creates,1,'An uncertain prior intent must require reconciliation');
  const newArtist=randomUUID(),newServiceSid='MG'+'e'.repeat(32),newNumberSid='PN'+'f'.repeat(32);
  await local.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'New toll-free signup')",[newArtist,org]);
  let purchases=0;const requests:string[]=[];
  globalThis.fetch=async(input,init)=>{
   const url=String(input);requests.push(url);assert.doesNotMatch(url,/AvailablePhoneNumbers\/US\/Local/);
   if(url==='https://messaging.twilio.com/v1/Services')return Response.json({sid:newServiceSid});
   if(url.includes('/AvailablePhoneNumbers/US/TollFree.json?'))return Response.json({available_phone_numbers:[{phone_number:'+18885550124'}]});
   if(url.endsWith('/IncomingPhoneNumbers.json')){purchases++;assert.equal(new URLSearchParams(String(init?.body)).get('PhoneNumber'),'+18885550124');return Response.json({sid:newNumberSid,phone_number:'+18885550124'});}
   if(url.endsWith(`/Services/${newServiceSid}/PhoneNumbers`))return Response.json({phone_number_sid:newNumberSid});
   throw Error('Unexpected provisioning request');
  };
  const {POST:provision}=await import('../../../app/api/twilio/provision/route');
  const provisionInput={organizationId:org,artistId:newArtist};
  const newNumber=await provision(request('/api/twilio/provision','a',provisionInput),undefined);assert.equal(newNumber.status,200,newNumber.status!==200?await newNumber.clone().text():'');
  assert.equal((await newNumber.json()).numberType,'TOLL_FREE');assert.equal(purchases,1);
  assert.deepEqual((await local.query('SELECT phone_number,active,compliance_status FROM phone_numbers WHERE artist_id=$1',[newArtist])).rows[0],{phone_number:'+18885550124',active:false,compliance_status:'TOLL_FREE_NOT_SUBMITTED'});
  const callCount=requests.length;assert.equal((await provision(request('/api/twilio/provision','a',provisionInput),undefined)).status,200);assert.equal(requests.length,callCount);assert.equal(purchases,1);
  assert.equal((await provision(request('/api/twilio/provision','a',{...provisionInput,areaCode:'303'}),undefined)).status,400);
 }finally{globalThis.fetch=previousFetch;keys.forEach((key,i)=>{if(prior[i]===undefined)delete process.env[key];else process.env[key]=prior[i];});}
}
