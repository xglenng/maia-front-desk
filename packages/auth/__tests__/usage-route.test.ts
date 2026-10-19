import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { pool } from '../../db/src';
import { GET } from '../../../app/api/usage/route';

test('usage API denies anonymous and nonplatform owners; scopes artists and ignores supplied tenant',async t=>{
  let user: any = null;
  const queries: {sql:string; args:any[]}[] = [];
  t.mock.method(pool,'query',async (sql:string,args:any[])=>{
    if(sql.includes('FROM auth_sessions'))return {rows:user?[user]:[]};
    queries.push({sql,args});return {rows:[]};
  });
  const request=(query='')=>new NextRequest(`http://localhost/api/usage${query}`,{headers:{cookie:`inkflow_session=${'a'.repeat(64)}`}});
  assert.equal((await GET(request())).status,401);
  user={id:'artist-user',organization_id:'own-studio',role:'OWNER'};
  const prior=process.env.PLATFORM_ADMIN_USER_IDS;
  process.env.PLATFORM_ADMIN_USER_IDS='';
  try {
    assert.equal((await GET(request('?scope=platform'))).status,403);
    assert.equal(queries.length,0);
    user.role='ARTIST';
    assert.equal((await GET(request('?organizationId=other&month=2026-10'))).status,200);
    assert.equal(queries.length,3);
    for(const query of queries){ assert.equal(query.args[0],'own-studio');assert.equal(query.args[1],'artist-user');assert.match(query.sql,/a.user_id=\$2/); }
    assert.equal((await GET(request('?month=bad'))).status,400);
    process.env.PLATFORM_ADMIN_USER_IDS='artist-user';
    queries.length=0;
    assert.equal((await GET(request('?scope=platform'))).status,200);
    assert.equal(queries[0].args[0],null);
  } finally { if(prior===undefined)delete process.env.PLATFORM_ADMIN_USER_IDS;else process.env.PLATFORM_ADMIN_USER_IDS=prior; }
});
