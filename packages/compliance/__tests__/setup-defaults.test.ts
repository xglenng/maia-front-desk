import test from 'node:test';
import assert from 'node:assert/strict';
import { complianceSetupDefaults } from '../setup-defaults';
const org={name:'Studio display name',slug:'studio'};
test('first setup reuses one confirmed legal business and the Maia-hosted website',()=>{
 const result=complianceSetupDefaults(org,null,[{legalName:'Saved Legal LLC'}],'https://maia.example.com/');
 assert.equal(result.businessName,'Saved Legal LLC');assert.equal(result.websiteUrl,'https://maia.example.com/a/studio');
 assert.equal(result.hasWebsite,false);assert.equal(result.businessAddress,'');assert.equal(result.contactEmail,'');
});
test('saved compliance values and external websites are preserved',()=>{
 const profile={businessName:'Confirmed name',businessAddress:'Saved address',contactEmail:'saved@example.test',websiteUrl:'https://studio.example.com/a/custom',smsEnabled:false};
 const result=complianceSetupDefaults(org,profile,[{legalName:'Other name'}],'https://maia.example.com');
 assert.equal(result.businessName,profile.businessName);assert.equal(result.websiteUrl,profile.websiteUrl);assert.equal(result.hasWebsite,true);assert.equal(result.smsEnabled,false);assert.equal(result.contactEmail,profile.contactEmail);
});
test('ambiguous legal customers use the studio name and hosted URLs compare exactly',()=>{
 for(const customers of [[],[{legalName:'One'},{legalName:'Two'}]])assert.equal(complianceSetupDefaults(org,null,customers,'https://maia.example.com').businessName,org.name);
 const profile={businessName:'Saved',businessAddress:'',contactEmail:'',websiteUrl:'https://maia.example.com/a/studio/',smsEnabled:true};
 assert.equal(complianceSetupDefaults(org,profile,[],'https://maia.example.com').hasWebsite,false);
});

test('initial compliance GET returns defaults without a profile and rejects another tenant',async t=>{
 const {GET}=await import('../../../app/api/compliance/documents/route');
 const {db,pool}=await import('@db');
 const {organizations,legalCustomers}=await import('@db/schema');
 const {NextRequest}=await import('next/server');
 const tenant='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
 const previous=process.env.NEXT_PUBLIC_APP_URL;process.env.NEXT_PUBLIC_APP_URL='https://maia.example.com';
 t.after(()=>{if(previous===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=previous;});
 let reads=0;
 t.mock.method(pool,'query',async()=>({rows:[{id:tenant,organization_id:tenant,role:'OWNER'}],rowCount:1}));
 t.mock.method(db,'select',(()=>({from:(table:unknown)=>({where:()=>{
  reads++;const rows=table===organizations?[{id:tenant,...org}]:table===legalCustomers?[{legalName:'Saved Legal LLC'}]:[];
  return {then:(resolve:(rows:unknown[])=>unknown)=>Promise.resolve(rows).then(resolve),orderBy:async()=>rows};
 }})})) as never);
 const req=(organizationId:string)=>new NextRequest(`http://localhost/api/compliance/documents?organizationId=${organizationId}`,{headers:{cookie:`inkflow_session=${'a'.repeat(64)}`}});
 const response=await GET(req(tenant),undefined);assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.profile,null);assert.deepEqual(data.documents,[]);assert.equal(data.defaults.businessName,'Saved Legal LLC');assert.equal(data.defaults.hasWebsite,false);
 const previousReads=reads;assert.equal((await GET(req(foreign),undefined)).status,403);assert.equal(reads,previousReads);
});
