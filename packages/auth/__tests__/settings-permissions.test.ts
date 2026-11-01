import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest,NextResponse} from 'next/server';
import {pool} from '../../db/src';
import {protectedRoute,protectedSettingsRoute,settingsArtistReference} from '../server';
import {ownerSettingsPage,sharedStudioSettingsPath} from '../settings-policy';
const org='11111111-1111-4111-8111-111111111111',peer='22222222-2222-4222-8222-222222222222',foreign='33333333-3333-4333-8333-333333333333';
test('staff settings access is shared within a studio, including supervised apprentices, without financial or invitation permissions',async t=>{
 let role='ARTIST',supervised=true,calls=0;
 const user=()=>({id:peer,organization_id:org,role,name:'Synthetic',email:'staff@example.test'});
 t.mock.method(pool,'query',async(sql:string,params:unknown[])=>{
  if(sql.includes('FROM auth_sessions'))return {rows:[user()],rowCount:1};
  if(sql.includes('requires_supervisor_approval'))return {rows:supervised?[{requires_supervisor_approval:true}]:[],rowCount:supervised?1:0};
  if(sql.includes('user_id=$3'))return {rows:[],rowCount:0};
  return {rows:params[0]===peer?[{id:peer}]:[],rowCount:params[0]===peer?1:0};
 });
 const handler=async()=>{calls++;return NextResponse.json({ok:true});};
 const shared=protectedSettingsRoute(handler),strict=protectedRoute(handler,true),normal=protectedRoute(handler);
 function request(path:string,body:object={},origin='http://localhost'){return new NextRequest('http://localhost'+path,{method:'POST',headers:{origin,cookie:`inkflow_session=${'a'.repeat(64)}`,'content-type':'application/json'},body:JSON.stringify(body)});}
 for(supervised of [true,false]){
  for(const path of ['/api/studio/config','/api/scheduling','/api/consent-forms','/api/services','/api/twilio/provision'])assert.equal((await shared(request(path,{artistId:peer}),undefined)).status,200,path);
  assert.equal((await shared(request('/api/studio/config',{artistId:foreign}),undefined)).status,404);
  assert.equal((await shared(request('/api/studio/config',{organizationId:foreign}),undefined)).status,403);
  for(const path of ['/api/banking','/api/payments/connect','/api/payments/report','/api/studio/invitations']){
   assert.equal((await strict(request(path),undefined)).status,403,path);
   assert.equal((await shared(request(path),undefined)).status,403,path);
  }
 }
 supervised=true;
 for(const path of ['/api/booking/hold','/api/twilio/send','/api/payments/checkout'])assert.equal((await normal(request(path),undefined)).status,403,path);
 const before=calls;assert.equal((await shared(request('/api/studio/config',{},'https://untrusted.test'),undefined)).status,403);assert.equal(calls,before);
 assert.equal(await settingsArtistReference(user(),'artistId',foreign),false);
 role='UNKNOWN';assert.equal((await shared(request('/api/studio/config'),undefined)).status,403);
 role='OWNER';assert.equal((await strict(request('/api/studio/invitations'),undefined)).status,200);
});
test('page policy reserves banking, payment setup and invitations; shared settings paths exclude real sends and payments',()=>{
 for(const path of ['/banking','/settings/payments','/settings/payments/report','/settings/team'])assert.equal(ownerSettingsPage(path),true);
 for(const path of ['/settings/studio','/settings/scheduling','/compliance','/twilio'])assert.equal(ownerSettingsPage(path),false);
 for(const path of ['/api/banking','/api/payments/connect','/api/studio/invitations','/api/twilio/send','/api/booking/confirm','/api/automations/run'])assert.equal(sharedStudioSettingsPath(path),false);
});
