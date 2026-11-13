import test from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {pool} from '../../db/src';
import {GET} from '../../../app/api/auth/session/route';

test('session returns only the authenticated studio business email',async t=>{
  const token='a'.repeat(64);
  const studio='11111111-1111-4111-8111-111111111111';
  const requested:string[]=[];
  t.mock.method(pool,'query',async (sql:string,params?:unknown[])=>{
    if(sql.includes('FROM auth_sessions')){
      return {rows:[{id:'user',organization_id:studio,role:'ARTIST',name:'Artist',email:'personal@example.test'}],rowCount:1};
    }
    assert.match(sql,/SELECT public_email FROM organizations WHERE id=\$1/);
    requested.push(String(params?.[0]));
    return {rows:[{public_email:'studio@example.test'}],rowCount:1};
  });
  const response=await GET(new NextRequest('http://localhost/api/auth/session?organizationId=22222222-2222-4222-8222-222222222222',{headers:{cookie:`inkflow_session=${token}`}}));
  assert.equal(response.status,200);
  assert.deepEqual(requested,[studio]);
  const body=await response.json();
  assert.equal(body.user.studioEmail,'studio@example.test');
  assert.equal(body.user.email,'personal@example.test');
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('session does not read studio data without authentication',async t=>{
  t.mock.method(pool,'query',async()=>{throw Error('Database should not be queried');});
  const response=await GET(new NextRequest('http://localhost/api/auth/session'));
  assert.equal(response.status,401);
  assert.deepEqual(await response.json(),{user:null});
});
