import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest,NextResponse} from 'next/server';
import {pool} from '../../db/src';
import {protectedRoute} from '../server';
const org='11111111-1111-4111-8111-111111111111',own='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const artistUser={id:'44444444-4444-4444-8444-444444444444',organization_id:org,role:'ARTIST',name:'Artist A',email:'a@example.test'};
const headers={cookie:`inkflow_session=${'a'.repeat(64)}`,origin:'http://localhost','content-type':'application/json'};
test('shared guard rejects another artist before handlers run for reads and mutations',async(t)=>{
  let calls=0;
  const handler=async()=>{calls++;return NextResponse.json({ok:true});};
  const route=protectedRoute(handler);
  t.mock.method(pool,'query',async(sql:string,params:unknown[])=>{
    if(sql.includes('FROM auth_sessions'))return {rows:[artistUser],rowCount:1};
    const assigned=sql.includes('user_id=$3');
    const allowed=!assigned || params[0]===own;
    return {rows:allowed?[{id:params[0]}]:[],rowCount:allowed?1:0};
  });
  for(const path of ['/api/appointments','/api/availability','/api/integrations/status','/api/twilio/status']) {
    assert.equal((await route(new NextRequest(`http://localhost${path}?artistId=${other}`,{headers}),undefined)).status,404,path);
    assert.equal((await route(new NextRequest(`http://localhost${path}?artistId=${own}`,{headers}),undefined)).status,200,path);
  }
  for(const path of ['/api/booking/hold','/api/twilio/send']) {
    assert.equal((await route(new NextRequest(`http://localhost${path}`,{method:'POST',headers,body:JSON.stringify({artistId:other})}),undefined)).status,404,path);
  }
  for(const method of ['GET','POST','DELETE','PATCH']) {
    const before=calls;
    assert.equal((await route(new NextRequest(`http://localhost/api/appointments/${other}`,{method,headers,...(['POST','PATCH'].includes(method)?{body:'{}'}:{})}),undefined)).status,404,method);
    assert.equal(calls,before);
  }
  for(const key of ['appointmentId','conversationId','serviceId']) {
    assert.equal((await route(new NextRequest(`http://localhost/api/booking/hold`,{method:'POST',headers,body:JSON.stringify({artistId:own,[key]:other})}),undefined)).status,404,key);
  }
});
test('owners retain organization access while foreign-tenant references are rejected',async(t)=>{
  t.mock.method(pool,'query',async(sql:string,params:unknown[])=>sql.includes('FROM auth_sessions')?{rows:[{...artistUser,role:'OWNER'}],rowCount:1}:{rows:params[0]===own?[{id:own}]:[],rowCount:params[0]===own?1:0});
  const route=protectedRoute(async()=>NextResponse.json({ok:true}));
  assert.equal((await route(new NextRequest(`http://localhost/api/appointments?artistId=${own}`,{headers}),undefined)).status,200);
  assert.equal((await route(new NextRequest(`http://localhost/api/appointments?artistId=${other}`,{headers}),undefined)).status,404);
  assert.equal((await route(new NextRequest(`http://localhost/api/appointments?organizationId=${other}`,{headers}),undefined)).status,403);
});

import {db} from '../../db/src';
import {GET as listAppointments} from '../../../app/api/appointments/route';
import {POST as sendSms} from '../../../app/api/twilio/send/route';
import {POST as hold} from '../../../app/api/booking/hold/route';
test('actual appointment, hold, and direct SMS endpoints deny peer artists before data or provider actions',async(t)=>{
  t.mock.method(pool,'query',async(sql:string)=>sql.includes('FROM auth_sessions')?{rows:[artistUser],rowCount:1}:sql.includes('user_id=$3')?{rows:[],rowCount:0}:{rows:[{id:other}],rowCount:1});
  t.mock.method(db,'select',(()=>{throw new Error('Unauthorized handler must not query tenant records');}) as never);
  t.mock.method(db,'insert',(()=>{throw new Error('Unauthorized handler must not mutate tenant records');}) as never);
  t.mock.method(globalThis,'fetch',async()=>{throw new Error('Unauthorized handler must not contact providers');});
  assert.equal((await listAppointments(new NextRequest(`http://localhost/api/appointments?artistId=${other}&from=2026-10-08&to=2026-10-09`,{headers}),undefined)).status,404);
  for(const [route,path] of [[hold,'/api/booking/hold'],[sendSms,'/api/twilio/send']] as const) {
    assert.equal((await route(new NextRequest(`http://localhost${path}`,{method:'POST',headers,body:JSON.stringify({artistId:other,clientId:own,body:'Synthetic'})}),undefined)).status,404,path);
  }
});
