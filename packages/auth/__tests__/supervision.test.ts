import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '../../db/src';
import { protectedRoute } from '../server';

test('supervised artists cannot bypass approval through other mutation endpoints', async t => {
  let role = 'ARTIST', supervised = true, invoked = 0;
  const org='11111111-1111-4111-8111-111111111111';
  t.mock.method(pool,'query',async(sql:string)=>sql.includes('FROM auth_sessions')?{rows:[{id:org,organization_id:org,role}],rowCount:1}:sql.includes('requires_supervisor_approval')?{rows:supervised?[{requires_supervisor_approval:true}]:[],rowCount:supervised?1:0}:{rows:[],rowCount:0});
  const route=protectedRoute(async()=>{invoked++;return NextResponse.json({ok:true});});
  const origin=new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost').origin;
  function request(path:string, method='POST') {return new NextRequest(origin+path,{method,headers:{cookie:`inkflow_session=${'a'.repeat(64)}`,origin,'content-type':'application/json'},...(method==='GET'?{}:{body:'{}'})});}
  for(const path of ['/api/booking/hold','/api/booking/confirm','/api/payments/checkout','/api/twilio/send','/api/inbox/'+org+'/messages','/api/inbox/'+org+'/quote','/api/future-write']) assert.equal((await route(request(path),undefined)).status,403,path);
  assert.equal(invoked,0);
  assert.equal((await route(request('/api/inbox/'+org+'/draft','PATCH'),undefined)).status,200);
  assert.equal((await route(request('/api/ai/chat'),undefined)).status,200);
  assert.equal((await route(request('/api/dashboard','GET'),undefined)).status,200);
  role='OWNER';assert.equal((await route(request('/api/payments/checkout'),undefined)).status,200);
  role='ARTIST';supervised=false;assert.equal((await route(request('/api/booking/hold'),undefined)).status,200);
});
