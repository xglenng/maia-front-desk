import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {NextRequest} from 'next/server';
import {pool} from '@/packages/db/src';
import {suggestedStarters} from '@/packages/waivers/starter-catalog';
import type {IndustrySettingsValue} from '@/packages/onboarding/industry';

const container=process.env.MAIA_STUDIO_SETTINGS_TEST_CONTAINER;
test('studio configuration and specialties save atomically with owner and tenant isolation',{skip:!container},async t=>{
 assert.match(container!,/^[a-f0-9]{64}$/);
 assert.equal(execFileSync('docker',['inspect','--format','{{index .Config.Labels "maia-purpose"}}',container!],{encoding:'utf8'}).trim(),'studio-settings-integration');
 const mapping=execFileSync('docker',['port',container!,'5432/tcp'],{encoding:'utf8'}).trim();
 assert.match(mapping,/^127\.0\.0\.1:\d+$/);
 const schema='settings_'+randomUUID().replaceAll('-','');
 const local=new Pool({host:'127.0.0.1',port:Number(mapping.split(':')[1]),user:'postgres',password:'synthetic-local-only',database:'maia_settings_test',options:`-c search_path=${schema}`,max:8});
 let created=false;
 try{
  assert.equal((await local.query('SELECT current_database() name')).rows[0].name,'maia_settings_test');
  await local.query(`CREATE SCHEMA ${schema}`);created=true;
  await local.query(readFileSync('packages/db/staging/schema.sql','utf8').replaceAll('"public".',`"${schema}".`));
  t.mock.method(pool,'query',local.query.bind(local));t.mock.method(pool,'connect',local.connect.bind(local));
  t.mock.method(globalThis,'fetch',async()=>{throw Error('External requests are forbidden.');});
  const org=randomUUID(),other=randomUUID(),owner=randomUUID(),artistUser=randomUUID(),otherOwner=randomUUID(),artist=randomUUID();
  await local.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic Studio','settings-synthetic'),($2,'Other Studio','settings-other')",[org,other]);
  for(const [id,tenant,role,cookie] of [[owner,org,'OWNER','a'],[artistUser,org,'ARTIST','b'],[otherOwner,other,'OWNER','c']]){
   await local.query('INSERT INTO users(id,organization_id,name,email,role) VALUES($1,$2,$3,$4,$5)',[id,tenant,'Synthetic',`${cookie}@example.test`,role]);
   await local.query("INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,'synthetic')",[id]);
   await local.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[createHash('sha256').update(cookie.repeat(64)).digest('hex'),id]);
  }
  await local.query("INSERT INTO artists(id,organization_id,user_id,display_name) VALUES($1,$2,$3,'Synthetic Artist')",[artist,org,artistUser]);
  const {GET,PUT}=await import('../../../app/api/studio/config/route');
  const {GET:industryGet,PUT:industryPut}=await import('../../../app/api/studio/industry/route');
  const {publicStudioSite}=await import('../public-site.server');
  function request(path:string,cookie:string,body?:object){
   return new NextRequest(`http://localhost${path}`,{method:body?'PUT':'GET',headers:{origin:'http://localhost',cookie:`inkflow_session=${cookie.repeat(64)}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  }
  const get=async(cookie:string)=>(await (await GET(request('/api/studio/config',cookie),undefined)).json());
  const save=(cookie:string,body:object)=>PUT(request('/api/studio/config',cookie,body),undefined);
  const loaded=await get('a');
  const base={organizationId:org,profile:loaded.profile,rules:[],faqs:[],aftercare:[],artists:[]};
  assert.equal((await save('a',{...base,profile:{...base.profile,publicName:'Legacy studio'}})).status,200);
  assert.deepEqual((await (await industryGet(request('/api/studio/industry','a'),undefined)).json()).settings.industries,[]);
  const industry:IndustrySettingsValue={industries:['NAILS'],staffTerm:'nail technician',consentFormsEnabled:false,requestFormsEnabled:true};
  const profile={...base.profile,publicName:'New Studio',publicPhone:'3035550111',publicEmail:'studio@example.test',website:'https://example.test'};
  const faq={locationId:null,category:null,question:'Can I book?',answer:'Ask us.',active:true,sortOrder:0};
  const result=await save('a',{...base,profile,industry,faqs:[faq]});
  assert.equal(result.status,200,await result.clone().text());
  const saved=await result.json();assert.equal(saved.created.faqs.length,1);
  assert.deepEqual((await get('a')).profile,profile);
  assert.deepEqual((await (await industryGet(request('/api/studio/industry','a'),undefined)).json()).settings,industry);
  const site=await publicStudioSite('settings-synthetic');
  assert.equal(site?.name,'New Studio');assert.equal(site?.phone,'3035550111');assert.equal(site?.email,'studio@example.test');
  assert.equal(site?.industryContent.headline[0],'Your next set.');
  assert.deepEqual(suggestedStarters(industry,'ANY').requests.map(item=>item.kind),['NAILS_REQUEST']);
  assert.equal((await save('a',{...base,profile,industry,faqs:[{...faq,id:saved.created.faqs[0]}]})).status,200);
  assert.equal((await local.query('SELECT count(*)::int n FROM studio_faqs WHERE organization_id=$1',[org])).rows[0].n,1);
  const invalid=await save('a',{...base,profile:{...profile,publicName:'Not saved'},industry:{...industry,industries:['UNKNOWN']}});
  assert.equal(invalid.status,400);
  const invalidBody=await invalid.json();assert.match(invalidBody.message,/industry\.industries/);assert.ok(invalidBody.error.fieldErrors);
  assert.equal((await get('a')).profile.publicName,'New Studio');
  assert.equal((await save('a',{...base,profile:{...profile,publicEmail:'invalid'},industry:{...industry,staffTerm:'Not saved'}})).status,400);
  assert.equal((await (await industryGet(request('/api/studio/industry','a'),undefined)).json()).settings.staffTerm,'nail technician');
  await local.query("CREATE FUNCTION fail_faq() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER fail_faq BEFORE INSERT ON studio_faqs FOR EACH ROW EXECUTE FUNCTION fail_faq()");
  assert.equal((await save('a',{...base,profile:{...profile,publicName:'Rolled back'},industry:{...industry,staffTerm:'Rolled back'},faqs:[faq]})).status,500);
  await local.query('DROP TRIGGER fail_faq ON studio_faqs; DROP FUNCTION fail_faq()');
  assert.equal((await get('a')).profile.publicName,'New Studio');
  assert.equal((await (await industryGet(request('/api/studio/industry','a'),undefined)).json()).settings.staffTerm,'nail technician');
  assert.equal((await save('b',{...base,profile:{...profile,publicName:'Artist save'}})).status,200);
  assert.equal((await save('b',{...base,profile:{...profile,publicName:'Unauthorized'},industry})).status,403);
  assert.equal((await get('a')).profile.publicName,'Artist save');
  assert.equal((await save('a',{...base,organizationId:other,industry})).status,403);
  assert.equal((await GET(request(`/api/studio/config?organizationId=${other}`,'a'),undefined)).status,403);
  assert.deepEqual((await (await industryGet(request('/api/studio/industry','c'),undefined)).json()).settings.industries,[]);
  const wizardSettings={industries:['HAIR'],staffTerm:'stylist',consentFormsEnabled:true,requestFormsEnabled:false};
  assert.equal((await industryPut(request('/api/studio/industry','b',wizardSettings),undefined)).status,403);
  assert.equal((await industryPut(request('/api/studio/industry','a',wizardSettings),undefined)).status,200);
  assert.deepEqual((await (await industryGet(request('/api/studio/industry','a'),undefined)).json()).settings,wizardSettings);
 }finally{
  if(created)await local.query(`DROP SCHEMA ${schema} CASCADE`);
  await local.end();
 }
});
