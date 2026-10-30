import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {NextRequest} from 'next/server';
import {pool} from '@/packages/db/src';
const socket=process.env.MAIA_CATALOG_TEST_SOCKET;
test('artist settings isolate social, SMS consent, and automation configuration',{skip:!socket},async t=>{
 assert.match(socket!,/^\/private\/tmp\/maia-forms-[A-Za-z0-9]+$/);
 const local=new Pool({host:socket,port:55449,database:'maia_forms_test',user:process.env.USER,max:8});
 const previous={key:process.env.COMPLIANCE_ENCRYPTION_KEY,id:process.env.SQUARE_APPLICATION_ID,secret:process.env.SQUARE_APPLICATION_SECRET,isolated:process.env.MAIA_STAGING_ISOLATED};
 process.env.COMPLIANCE_ENCRYPTION_KEY=randomBytes(32).toString('base64');process.env.SQUARE_APPLICATION_ID='synthetic-app';process.env.SQUARE_APPLICATION_SECRET='synthetic-secret';process.env.MAIA_STAGING_ISOLATED='0';
 try{
  assert.equal((await local.query('SHOW data_directory')).rows[0].data_directory,`${socket}/data`);await local.query(readFileSync('packages/db/staging/schema.sql','utf8'));
  t.mock.method(pool,'query',local.query.bind(local));t.mock.method(pool,'connect',local.connect.bind(local));
  const org=randomUUID(),other=randomUUID(),owner=randomUUID(),artistUser=randomUUID(),peerUser=randomUUID(),foreignUser=randomUUID(),artist=randomUUID(),peer=randomUUID(),foreignArtist=randomUUID();
  const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
  await local.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic A','cat-a'),($2,'Synthetic B','cat-b')",[org,other]);
  for(const [id,orgId,role,key] of [[owner,org,'OWNER','a'],[artistUser,org,'ARTIST','b'],[peerUser,org,'ARTIST','c'],[foreignUser,other,'OWNER','d']]){
   await local.query('INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,$3,$4,$5)',[id,orgId,`${key}@example.test`,'Synthetic',role]);await local.query("INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,'synthetic')",[id]);await local.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[hash(String(key).repeat(64)),id]);
  }
  for(const [id,orgId,user] of [[artist,org,artistUser],[peer,org,peerUser],[foreignArtist,other,foreignUser]])await local.query("INSERT INTO artists(id,organization_id,user_id,display_name) VALUES($1,$2,$3,'Synthetic')",[id,orgId,user]);

  const {GET:channels,POST:changeChannel}=await import('@/app/api/channels/route');
  const {GET:consent,PUT:saveConsent}=await import('@/app/api/consent-forms/route');
  const {GET:timing}=await import('@/app/api/automations/settings/route');
  const request=(path:string,who='b',body?:unknown,method=body?'POST':'GET')=>new NextRequest(`http://localhost${path}`,{method,headers:{cookie:`inkflow_session=${who.repeat(64)}`,origin:'http://localhost','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  for(const id of [artist,peer,foreignArtist]) await local.query("INSERT INTO channel_connections(organization_id,artist_id,provider,external_account_id,display_name,status) VALUES($1,$2::uuid,'FACEBOOK',$2::text,'Synthetic','ACTIVE')",[id===foreignArtist?other:org,id]);
  const ownList=await (await channels(request('/api/channels'),undefined)).json();
  assert.deepEqual(ownList.artists.map((a:any)=>a.id),[artist]);assert.deepEqual(ownList.connections.map((a:any)=>a.artistId),[artist]);
  const peers=(await local.query('SELECT id FROM channel_connections WHERE artist_id=$1',[peer])).rows[0].id;
  assert.equal((await changeChannel(request('/api/channels','b',{action:'DISCONNECT',connectionId:peers}),undefined)).status,404);
  assert.equal((await changeChannel(request('/api/channels','d',{action:'DISCONNECT',connectionId:peers}),undefined)).status,404);
  const own=ownList.connections[0].id;
  assert.equal((await changeChannel(request('/api/channels','b',{action:'DISCONNECT',connectionId:own}),undefined)).status,200);
  const consentList=await (await consent(request('/api/consent-forms'),undefined)).json();assert.deepEqual(consentList.artists.map((a:any)=>a.id),[artist]);
  assert.equal((await saveConsent(request('/api/consent-forms','b',{artistId:peer,mode:'HOSTED'},'PUT'),undefined)).status,404);
  assert.equal((await saveConsent(request('/api/consent-forms','b',{artistId:artist,mode:'HOSTED'},'PUT'),undefined)).status,200);
  const settings=await (await timing(request('/api/automations/settings'),undefined)).json();assert.deepEqual(settings.artists.map((a:any)=>a.id),[artist]);
  const ownerList=await (await channels(request('/api/channels','a'),undefined)).json();assert.equal(ownerList.artists.length,2);
 } finally {t.mock.restoreAll();await local.end();for(const [key,value] of Object.entries({COMPLIANCE_ENCRYPTION_KEY:previous.key,SQUARE_APPLICATION_ID:previous.id,SQUARE_APPLICATION_SECRET:previous.secret,MAIA_STAGING_ISOLATED:previous.isolated})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
