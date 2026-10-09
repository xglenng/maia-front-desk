import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {NextRequest,NextResponse} from 'next/server';
import {pool} from '../../db/src';
import {protectedRoute} from '../server';
const socket=process.env.MAIA_ARTIST_TEST_SOCKET;
test('artist authorization joins enforce assigned user and tenant in real PostgreSQL',{skip:!socket},async(t)=>{
  assert.match(socket!,/^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/);
  const local=new Pool({host:socket,port:55439,database:'maia_artist_test',user:process.env.USER});
  const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
  try {
    assert.equal((await local.query('SHOW data_directory')).rows[0].data_directory,`${socket}/data`);
    await local.query('CREATE TABLE artists(id uuid PRIMARY KEY,organization_id uuid,user_id uuid); CREATE TABLE appointments(id uuid PRIMARY KEY,organization_id uuid,artist_id uuid); CREATE TABLE conversations(LIKE appointments INCLUDING ALL); CREATE TABLE services(LIKE appointments INCLUDING ALL);');
    await local.query('INSERT INTO artists VALUES($1,$1,$1),($2,$1,$2),($3,$3,$1),($4,$1,NULL)',ids);
    for(const table of ['appointments','conversations','services'])await local.query(`INSERT INTO ${table} VALUES($1,$1,$1),($2,$1,$2),($3,$3,$3),($4,$1,$3)`,ids);
    let role='ARTIST',calls=0;
    t.mock.method(pool,'query',async(sql:string,args:unknown[])=>sql.includes('FROM auth_sessions')?{rows:[{id:ids[0],organization_id:ids[0],role}],rowCount:1}:local.query(sql,args));
    const route=protectedRoute(async()=>{calls++;return NextResponse.json({ok:true});});
    const headers={cookie:`inkflow_session=${'a'.repeat(64)}`};
    for(const key of ['artistId','appointmentId','conversationId','serviceId']) {
      assert.equal((await route(new NextRequest(`http://localhost/api/check?${key}=${ids[0]}`,{headers}),undefined)).status,200,key);
      for(const id of ids.slice(1))assert.equal((await route(new NextRequest(`http://localhost/api/check?${key}=${id}`,{headers}),undefined)).status,404,`${key}:${id}`);
    }
    role='OWNER';
    assert.equal((await route(new NextRequest(`http://localhost/api/check?artistId=${ids[1]}`,{headers}),undefined)).status,200);
    assert.equal((await route(new NextRequest(`http://localhost/api/check?artistId=${ids[2]}`,{headers}),undefined)).status,404);
    assert.equal(calls,5);
  } finally {await local.end();}
});
