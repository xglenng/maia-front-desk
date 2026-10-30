import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {NextRequest} from 'next/server';
import {pool} from '@/packages/db/src';
const socket=process.env.MAIA_CATALOG_TEST_SOCKET;
test('service-only Square OAuth and import isolate tenants and never change scheduling',{skip:!socket},async t=>{
 assert.match(socket!,/^\/private\/tmp\/maia-forms-[A-Za-z0-9]+$/);
 const local=new Pool({host:socket,port:55449,database:'maia_forms_test',user:process.env.USER,max:8});
 const previous={key:process.env.COMPLIANCE_ENCRYPTION_KEY,id:process.env.SQUARE_APPLICATION_ID,secret:process.env.SQUARE_APPLICATION_SECRET,isolated:process.env.MAIA_STAGING_ISOLATED};
 process.env.COMPLIANCE_ENCRYPTION_KEY=randomBytes(32).toString('base64');process.env.SQUARE_APPLICATION_ID='synthetic-app';process.env.SQUARE_APPLICATION_SECRET='synthetic-secret';process.env.MAIA_STAGING_ISOLATED='0';
 try{
  assert.equal((await local.query('SHOW data_directory')).rows[0].data_directory,`${socket}/data`);await local.query(readFileSync('packages/db/staging/schema.sql','utf8'));
  t.mock.method(pool,'query',local.query.bind(local));t.mock.method(pool,'connect',local.connect.bind(local));
  const {GET:connect}=await import('@/app/api/services/square/connect/route');const {GET:callback}=await import('@/app/api/integrations/square/callback/route');const {GET:catalog,POST:disconnect}=await import('@/app/api/services/square/route');const {POST:importCsv}=await import('@/app/api/services/import/route');
  const org=randomUUID(),other=randomUUID(),owner=randomUUID(),artistUser=randomUUID(),peerUser=randomUUID(),foreignUser=randomUUID(),artist=randomUUID(),peer=randomUUID(),foreignArtist=randomUUID();
  const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
  await local.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic A','cat-a'),($2,'Synthetic B','cat-b')",[org,other]);
  for(const [id,orgId,role,key] of [[owner,org,'OWNER','a'],[artistUser,org,'ARTIST','b'],[peerUser,org,'ARTIST','c'],[foreignUser,other,'OWNER','d']]){
   await local.query('INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,$3,$4,$5)',[id,orgId,`${key}@example.test`,'Synthetic',role]);await local.query("INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,'synthetic')",[id]);await local.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[hash(String(key).repeat(64)),id]);
  }
  for(const [id,orgId,user] of [[artist,org,artistUser],[peer,org,peerUser],[foreignArtist,other,foreignUser]])await local.query("INSERT INTO artists(id,organization_id,user_id,display_name) VALUES($1,$2,$3,'Synthetic')",[id,orgId,user]);
  await local.query("INSERT INTO scheduling_connections(organization_id,artist_id,provider,external_account_id,access_token_encrypted,status) VALUES($1,$2,'SQUARE','existing-scheduling-account','untouched-scheduling-token','CONNECTED')",[org,artist]);
  const schedulingBefore=(await local.query('SELECT * FROM scheduling_connections')).rows;
  let exchangeCalls=0,catalogCalls=0,failToken=false;
  t.mock.method(globalThis,'fetch',async(input:any,init:any)=>{const url=String(input);if(url.endsWith('/oauth2/token')){exchangeCalls++;if(failToken)return new Response('{}',{status:401});assert.ok(['authorization_code','refresh_token'].includes(JSON.parse(init.body).grant_type));return new Response(JSON.stringify({access_token:'synthetic-access',refresh_token:'synthetic-refresh',token_type:'bearer',merchant_id:'catalog-merchant',expires_at:'2035-01-01T00:00:00Z'}),{status:200});}if(url.endsWith('/v2/catalog/search')){catalogCalls++;assert.equal(init.headers.Authorization,'Bearer synthetic-access');return new Response(JSON.stringify({objects:[{id:'item',type:'ITEM',item_data:{name:'Tattoo',product_type:'APPOINTMENTS_SERVICE',variations:[{id:'variation'}]}},{id:'variation',type:'ITEM_VARIATION',version:1,item_variation_data:{item_id:'item',name:'Small',service_duration:1800000,pricing_type:'FIXED_PRICING',price_money:{amount:12000,currency:'USD'}}}]}),{status:200});}throw Error('Unexpected provider operation');});
  const request=(path:string,who?:string,body?:unknown)=>new NextRequest(`http://localhost${path}`,{method:body?'POST':'GET',headers:{...(who?{cookie:`inkflow_session=${who.repeat(64)}`} :{}),...(body?{origin:'http://localhost','content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const start=(who='b',id=artist)=>connect(request(`/api/services/square/connect?artistId=${id}`,who),undefined);
  assert.equal((await connect(request(`/api/services/square/connect?artistId=${artist}`),undefined)).status,401);
  assert.equal((await start('c')).status,404);assert.equal((await start('d')).status,404);assert.equal((await start('b',foreignArtist)).status,404);
  const auth=await start();assert.equal(auth.status,307);const authorization=new URL(auth.headers.get('location')!);assert.equal(authorization.searchParams.get('scope'),'ITEMS_READ');const state=authorization.searchParams.get('state')!;assert.equal((await local.query('SELECT token_hash FROM square_catalog_oauth_states')).rows[0].token_hash,hash(state));
  assert.equal((await callback(request(`/api/integrations/square/callback?state=${state}&code=fake`,'c'),undefined)).status,403);assert.equal(exchangeCalls,0);
  const done=await callback(request(`/api/integrations/square/callback?state=${state}&code=fake`,'b'),undefined);assert.equal(done.status,303);assert.match(done.headers.get('location')!,/squareCatalog=connected/);assert.equal(exchangeCalls,1);
  await callback(request(`/api/integrations/square/callback?state=${state}&code=fake`,'b'),undefined);assert.equal(exchangeCalls,1);
  const stored=(await local.query('SELECT * FROM square_catalog_connections')).rows[0];assert.notEqual(stored.access_token_encrypted,'synthetic-access');assert.notEqual(stored.refresh_token_encrypted,'synthetic-refresh');
  const list=await catalog(request(`/api/services/square?artistId=${artist}`,'b'),undefined);const status=await list.json();assert.equal(status.connected,true);assert.equal(JSON.stringify(status).includes('synthetic-access'),false);assert.equal((await catalog(request(`/api/services/square?artistId=${artist}`,'c'),undefined)).status,404);assert.equal((await catalog(request(`/api/services/square?artistId=${artist}`,'d'),undefined)).status,404);
  const preview=await catalog(request(`/api/services/square?artistId=${artist}&preview=1`,'b'),undefined);assert.equal(preview.status,200);const result=await preview.json();assert.equal(result.count,1);assert.equal(catalogCalls,1);
  const importRequest=()=>importCsv(request('/api/services/import','b',{artistId:artist,csv:result.csv,action:'IMPORT'}),undefined);
  assert.equal((await importRequest()).status,200);assert.deepEqual(await (await importRequest()).json(),{imported:0,skipped:1});const service=(await local.query('SELECT * FROM services')).rows[0];assert.equal(service.base_price_cents,12000);assert.equal(service.duration_minutes,30);assert.equal(service.deposit_type,'NONE');
  await local.query("UPDATE square_catalog_connections SET expires_at=now()-interval '1 minute'");assert.equal((await catalog(request(`/api/services/square?artistId=${artist}&preview=1`,'b'),undefined)).status,200);assert.equal(exchangeCalls,2);
  await local.query("UPDATE square_catalog_connections SET expires_at=now()-interval '1 minute'");
  const encryptedBefore=(await local.query('SELECT access_token_encrypted FROM square_catalog_connections')).rows[0].access_token_encrypted;
  failToken=true;assert.equal((await catalog(request(`/api/services/square?artistId=${artist}&preview=1`,'b'),undefined)).status,502);failToken=false;assert.equal((await local.query('SELECT access_token_encrypted FROM square_catalog_connections')).rows[0].access_token_encrypted,encryptedBefore);
  const expiredAuth=new URL((await start()).headers.get('location')!);await local.query("UPDATE square_catalog_oauth_states SET expires_at=now()-interval '1 minute'");const beforeExpired=exchangeCalls;await callback(request(`/api/integrations/square/callback?state=${expiredAuth.searchParams.get('state')}&code=fake`,'b'),undefined);assert.equal(exchangeCalls,beforeExpired);
  const deniedAuth=new URL((await start()).headers.get('location')!);const denied=await callback(request(`/api/integrations/square/callback?state=${deniedAuth.searchParams.get('state')}&error=access_denied`,'b'),undefined);assert.match(denied.headers.get('location')!,/squareCatalog=denied/);assert.equal(exchangeCalls,3);
  assert.equal((await disconnect(request('/api/services/square','c',{artistId:artist,action:'DISCONNECT'}),undefined)).status,404);assert.equal((await disconnect(request('/api/services/square','b',{artistId:artist,action:'DISCONNECT'}),undefined)).status,200);assert.equal((await local.query('SELECT access_token_encrypted FROM square_catalog_connections')).rows[0].access_token_encrypted,'');assert.equal((await catalog(request(`/api/services/square?artistId=${artist}&preview=1`,'b'),undefined)).status,409);
  await assert.rejects(local.query("INSERT INTO square_catalog_connections(organization_id,artist_id,merchant_id,access_token_encrypted,refresh_token_encrypted,expires_at) VALUES($1,$2,'x','x','x',now())",[other,artist]),error=>(error as {code:string}).code==='23503');
  assert.deepEqual((await local.query('SELECT * FROM scheduling_connections')).rows,schedulingBefore);assert.equal((await local.query('SELECT count(*)::int n FROM service_provider_mappings')).rows[0].n,0);
  // The registered callback continues to handle the independent legacy scheduling flow for owners.
  const legacy='f'.repeat(64);await local.query("INSERT INTO auth_oauth_states(token_hash,user_id,organization_id,artist_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')",[hash(legacy),owner,org,artist]);
  const legacyResult=await callback(request(`/api/integrations/square/callback?state=${legacy}&code=fake`,'a'),undefined);assert.match(legacyResult.headers.get('location')!,/settings\/scheduling\?square=connected/);

 }finally{await local.end();for(const [key,value] of Object.entries({COMPLIANCE_ENCRYPTION_KEY:previous.key,SQUARE_APPLICATION_ID:previous.id,SQUARE_APPLICATION_SECRET:previous.secret,MAIA_STAGING_ISOLATED:previous.isolated})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
