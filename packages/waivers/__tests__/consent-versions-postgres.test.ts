import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
import {NextRequest} from 'next/server';
import {pool} from '@/packages/db/src';
const container=process.env.MAIA_REQUEST_TEST_CONTAINER;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const removeConsentVersionSchema=`DROP TRIGGER consent_assignment_version_retention ON external_waiver_assignments; DROP TRIGGER published_consent_template_retention ON waiver_templates; DROP TABLE consent_form_drafts; ALTER TABLE external_waiver_assignments DROP COLUMN native_version_id; DROP TABLE consent_form_versions; DROP FUNCTION protect_consent_assignment_version(),protect_published_consent_template(),protect_published_consent_version();`;

test('consent versions preserve issued links and signed evidence with scoped drafts, previews, concurrent publication and legacy migration',{skip:!container},async t=>{
 assert.match(container!,/^[a-f0-9]{64}$/);assert.equal(execFileSync('docker',['inspect','--format','{{index .Config.Labels "maia-purpose"}}',container!],{encoding:'utf8'}).trim(),'request-integration');
 const mapping=execFileSync('docker',['port',container!,'5432/tcp'],{encoding:'utf8'}).trim();assert.match(mapping,/^127\.0\.0\.1:\d+$/);
 const schema='consent_versions_'+randomUUID().replaceAll('-',''),journal=schema+'_journal';
 const local=new Pool({host:'127.0.0.1',port:Number(mapping.split(':')[1]),database:'maia_request_test',user:'postgres',password:'synthetic-local-only',options:`-c search_path=${schema}`,max:8});
 const folder=mkdtempSync(join(tmpdir(),'maia-consent-migration-'));
 try{
  assert.equal((await local.query('SHOW data_directory')).rows[0].data_directory,'/var/lib/postgresql/data');
  await local.query(`CREATE SCHEMA ${schema}`);await local.query(readFileSync('packages/db/staging/schema.sql','utf8').replaceAll('"public".',`"${schema}".`));
  await local.query(removeConsentVersionSchema);
  t.mock.method(pool,'query',local.query.bind(local));t.mock.method(pool,'connect',local.connect.bind(local));
  const org=randomUUID(),other=randomUUID(),owner=randomUUID(),user=randomUUID(),peerUser=randomUUID(),foreignUser=randomUUID(),artist=randomUUID(),peer=randomUUID(),foreignArtist=randomUUID(),client=randomUUID(),appointment=randomUUID();
  await local.query("INSERT INTO organizations(id,name,slug) VALUES($1::uuid,'Consent Studio',$1::text),($2::uuid,'Other Studio',$2::text)",[org,other]);
  for(const [id,organizationId,role,cookie] of [[owner,org,'OWNER','a'],[user,org,'ARTIST','b'],[peerUser,org,'ARTIST','c'],[foreignUser,other,'OWNER','d']]){
   await local.query("INSERT INTO users(id,organization_id,name,email,role) VALUES($1,$2,'Synthetic',$3,$4)",[id,organizationId,`${cookie}@example.test`,role]);
   await local.query("INSERT INTO auth_credentials(user_id,password_hash) VALUES($1,'synthetic')",[id]);
   await local.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[digest(cookie.repeat(64)),id]);
  }
  for(const [id,organizationId,userId] of [[artist,org,user],[peer,org,peerUser],[foreignArtist,other,foreignUser]])await local.query("INSERT INTO artists(id,organization_id,user_id,display_name) VALUES($1,$2,$3,'Synthetic Artist')",[id,organizationId,userId]);
  await local.query("INSERT INTO clients(id,organization_id,first_name) VALUES($1,$2,'Synthetic Client')",[client,org]);
  await local.query("INSERT INTO appointments(id,organization_id,artist_id,client_id,starts_at,ends_at,status,price_cents,deposit_cents,deposit_status,scheduling_provider) VALUES($1,$2,$3,$4,'2035-01-01 12:00:00','2035-01-01 13:00:00','CONFIRMED',100,0,'NOT_REQUIRED','INTERNAL')",[appointment,org,artist,client]);
  const definition={body:'Original consent wording',fields:[{id:'agree',type:'ACKNOWLEDGMENT',label:'I understand',required:true}]};
  const legacyForm=randomUUID(),legacyTemplate=randomUUID(),legacyToken='a'.repeat(48),legacyAssignment=randomUUID();
  await local.query("INSERT INTO waiver_templates(id,organization_id,name,body,active) VALUES($1,$2,'Legacy consent',$3,false)",[legacyTemplate,org,definition.body]);
  await local.query("INSERT INTO external_waiver_forms(id,organization_id,artist_id,provider,name,form_url,audience,completion_mode,metadata) VALUES($1,$2,$3,'MAIA','Legacy consent','/waiver','ADULT','HOSTED',$4)",[legacyForm,org,artist,JSON.stringify({templateId:legacyTemplate,definition})]);
  await local.query("INSERT INTO external_waiver_assignments(id,organization_id,waiver_form_id,appointment_id,client_id,tracking_token_hash) VALUES($1,$2,$3,$4,$5,$6)",[legacyAssignment,org,legacyForm,appointment,client,digest(legacyToken)]);
  // Apply the actual pending Drizzle migration to a populated 0037-equivalent baseline.
  const all=JSON.parse(readFileSync('packages/db/drizzle/meta/_journal.json','utf8')),entry=all.entries.find((v:any)=>v.tag==='0038_consent_versions');mkdirSync(join(folder,'meta'));writeFileSync(join(folder,'meta/_journal.json'),JSON.stringify({...all,entries:[entry]}));writeFileSync(join(folder,entry.tag+'.sql'),readFileSync('packages/db/drizzle/'+entry.tag+'.sql','utf8').replaceAll('"public".',`"${schema}".`));
  await migrate(drizzle(local),{migrationsFolder:folder,migrationsSchema:journal});await migrate(drizzle(local),{migrationsFolder:folder,migrationsSchema:journal});
  assert.equal((await local.query('SELECT native_version_id FROM external_waiver_assignments WHERE id=$1',[legacyAssignment])).rows[0].native_version_id,null);
  assert.equal((await local.query('SELECT count(*)::int AS n FROM consent_form_versions')).rows[0].n,0);
  const {POST:createForm}=await import('../../../app/api/waiver-integrations/route');
  const {GET:edit,POST:mutate}=await import('../../../app/api/consent-versions/route');
  const {GET:preview}=await import('../../../app/api/consent-versions/preview/route');
  const {POST:assign}=await import('../../../app/api/waiver-assignments/route');
  const {GET:read,POST:sign}=await import('../../../app/api/public/waivers/native/route');
  function request(path:string,cookie='b',body?:object){return new NextRequest('http://localhost'+path,{method:body?'POST':'GET',headers:{origin:'http://localhost','content-type':'application/json',cookie:`inkflow_session=${cookie.repeat(64)}`},...(body?{body:JSON.stringify(body)}:{})});}
  async function editor(formId:string,cookie='b'){const response=await edit(request('/api/consent-versions?formId='+formId,cookie),undefined);assert.equal(response.status,200,await response.clone().text());return response.json();}
  async function action(body:object,cookie='b'){return mutate(request('/api/consent-versions',cookie,body),undefined);}
  async function publicForm(token:string){const response=await read(request('/api/public/waivers/native?token='+token));assert.equal(response.status,200,await response.clone().text());return response.json();}
  async function link(formId:string){const response=await assign(request('/api/waiver-assignments','b',{action:'CREATE_LINK',appointmentId:appointment,externalWaiverFormId:formId}),undefined);assert.equal(response.status,201,await response.clone().text());return response.json();}
  async function save(formId:string,name:string,body:string,audience='ADULT'){
   const state=await editor(formId);const response=await action({action:'SAVE_DRAFT',formId,draftId:state.draft?.id||null,revision:state.draft?.revision||0,baseVersion:state.draft?.baseVersion??state.publishedVersion,name,audience,definition:{...definition,body}});assert.equal(response.status,200,await response.clone().text());return (await response.json()).draft;
  }
  const publish=(formId:string,draft:any)=>action({action:'PUBLISH',formId,draftId:draft.id,revision:draft.revision});
  const legacyBefore=await publicForm(legacyToken),legacyState=await editor(legacyForm);assert.equal(legacyState.legacyReview.unsigned,1);
  const legacyDraft=await save(legacyForm,'Updated legacy','Updated legacy wording');assert.equal((await publish(legacyForm,legacyDraft)).status,409);assert.deepEqual(await publicForm(legacyToken),legacyBefore);
  // Issuing a new link for an existing form adopts the current configuration,
  // while leaving historical links untouched and keeping saved drafts usable.
  const adopted=await link(legacyForm);
  assert.ok(adopted.assignment.nativeVersionId);
  assert.equal((await publicForm(new URL(adopted.url).searchParams.get('waiverToken')!)).definition.body,definition.body);
  const adoptedState=await editor(legacyForm);
  assert.equal(adoptedState.publishedVersion,1);
  assert.equal(adoptedState.draft.baseVersion,1);
  assert.equal(adoptedState.draft.definition.body,'Updated legacy wording');
  assert.equal((await publish(legacyForm,legacyDraft)).status,409);
  const refreshedLegacyDraft=adoptedState.draft;
  const response=await createForm(request('/api/waiver-integrations','b',{action:'ADD_NATIVE_FORM',artistId:artist,name:'Consent v1',audience:'ADULT',definition}),undefined);assert.equal(response.status,201,await response.clone().text());const form=(await response.json()).form;
  const v1State=await editor(form.id);assert.equal(v1State.publishedVersion,1);
  assert.equal((await edit(request('/api/consent-versions?formId='+form.id,'c'),undefined)).status,404);assert.equal((await edit(request('/api/consent-versions?formId='+form.id,'d'),undefined)).status,404);
  assert.equal((await edit(new NextRequest('http://localhost/api/consent-versions?formId='+form.id),undefined)).status,401);
  assert.equal((await preview(request('/api/consent-versions/preview?formId='+form.id,'d'),undefined)).status,404);
  const v1=await link(form.id),token1=new URL(v1.url).searchParams.get('waiverToken')!;assert.ok(v1.assignment.nativeVersionId);const before=await publicForm(token1);
  const draft=await save(form.id,'Consent v2','Second wording','MINOR');assert.deepEqual(await publicForm(token1),before);
  const counts=async()=>(await local.query('SELECT (SELECT count(*) FROM external_waiver_assignments) AS assignments,(SELECT count(*) FROM waiver_submissions) AS submissions,(SELECT count(*) FROM external_waiver_events) AS events,(SELECT count(*) FROM automation_jobs) AS jobs')).rows[0];
  const beforePreview=await counts();
  const previewResponse=await preview(request('/api/consent-versions/preview?formId='+form.id+'&source=draft'),undefined);assert.equal(previewResponse.status,200);const draftPreview=await previewResponse.json();assert.equal(draftPreview.preview,true);assert.equal(draftPreview.definition.body,'Second wording');assert.equal(draftPreview.audience,'MINOR');assert.ok(!('token' in draftPreview));assert.deepEqual(await counts(),beforePreview);
  assert.equal((await sign(request('/api/public/waivers/native','b',{token:'preview',signedName:'Synthetic',agreed:true,answers:{agree:true},signature:{strokes:[[{x:0.1,y:0.1},{x:0.8,y:0.8}]]}}))).status,400);assert.deepEqual(await counts(),beforePreview);
  const simultaneous=await Promise.all([publish(form.id,draft),publish(form.id,draft)]);assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);assert.deepEqual(await publicForm(token1),before);
  assert.equal((await local.query('SELECT count(*)::int AS n FROM consent_form_versions WHERE form_id=$1',[form.id])).rows[0].n,2);
  const newLink=await link(form.id),token2=new URL(newLink.url).searchParams.get('waiverToken')!;const newView=await publicForm(token2);assert.equal(newView.definition.body,'Second wording');assert.equal(newView.audience,'MINOR');assert.notEqual(newLink.assignment.nativeVersionId,v1.assignment.nativeVersionId);
  const signed=await sign(request('/api/public/waivers/native','b',{token:token1,signedName:'Synthetic Client',agreed:true,answers:{agree:true},signature:{strokes:[[{x:0.1,y:0.1},{x:0.8,y:0.8}]]}}));assert.equal(signed.status,200,await signed.clone().text());
  const signedRows=await local.query('SELECT * FROM waiver_submissions ORDER BY id');assert.equal(signedRows.rows.length,1);
  const evidence=JSON.parse(signedRows.rows[0].signature_data);assert.equal(evidence.definition.body,definition.body);assert.equal(evidence.audience,'ADULT');
  const v3draft=await save(form.id,'Consent v3','Third wording');assert.equal((await publish(form.id,v3draft)).status,200);assert.deepEqual((await local.query('SELECT * FROM waiver_submissions ORDER BY id')).rows,signedRows.rows);assert.equal((await publicForm(token1)).definition.body,definition.body);assert.equal((await publicForm(token2)).definition.body,'Second wording');
  const current=await editor(form.id);const stale={action:'SAVE_DRAFT',formId:form.id,draftId:null,revision:0,baseVersion:current.publishedVersion,name:'Draft one',audience:'ADULT',definition};
  const saves=await Promise.all([action(stale),action({...stale,name:'Draft two'})]);assert.deepEqual(saves.map(r=>r.status).sort(),[200,409]);
  assert.equal((await action({...stale,formId:legacyForm},'d')).status,404);
  const historical=await preview(request('/api/consent-versions/preview?formId='+form.id+'&versionId='+v1.assignment.nativeVersionId),undefined);assert.equal(historical.status,200);assert.equal((await historical.json()).definition.body,definition.body);
  await assert.rejects(local.query("UPDATE consent_form_versions SET name='Changed' WHERE form_id=$1",[form.id]),/cannot be changed/);
  await assert.rejects(local.query('DELETE FROM consent_form_versions WHERE form_id=$1',[form.id]),/cannot be changed/);
  await assert.rejects(local.query("UPDATE waiver_templates SET body='Changed' WHERE id=(SELECT template_id FROM consent_form_versions WHERE id=$1)",[v1.assignment.nativeVersionId]),/cannot be changed/);
  await assert.rejects(local.query('UPDATE external_waiver_assignments SET native_version_id=$1 WHERE id=$2',[newLink.assignment.nativeVersionId,v1.assignment.id]),/cannot be changed/);
  await assert.rejects(local.query("INSERT INTO external_waiver_assignments(organization_id,waiver_form_id,appointment_id,client_id,tracking_token_hash,native_version_id) VALUES($1,$2,$3,$4,$5,$6)",[org,legacyForm,appointment,client,digest('other'),v1.assignment.nativeVersionId]),/foreign key/);
  // A snapshot-less legacy signed record remains unchanged and blocks publication.
  await local.query("UPDATE external_waiver_assignments SET status='COMPLETED' WHERE id=$1",[legacyAssignment]);
  assert.equal((await editor(legacyForm)).legacyReview.signedWithoutSnapshot,1);assert.equal((await publish(legacyForm,legacyDraft)).status,409);
  // A verified signature snapshot is sufficient; no historical fields are invented.
  const legacySignature=JSON.stringify({audience:'ADULT',definition,answers:{agree:true}}),signedId=randomUUID();
  await local.query("INSERT INTO waiver_submissions(id,organization_id,appointment_id,client_id,waiver_template_id,signed_name,signature_data,document_hash) VALUES($1,$2,$3,$4,$5,'Legacy signed',$6,'preserved-hash')",[signedId,org,appointment,client,legacyTemplate,legacySignature]);
  await local.query('UPDATE external_waiver_assignments SET provider_metadata=$1 WHERE id=$2',[JSON.stringify({submissionId:signedId}),legacyAssignment]);
  const signedLegacyBefore=await publicForm(legacyToken);assert.equal((await publish(legacyForm,refreshedLegacyDraft)).status,200);assert.deepEqual(await publicForm(legacyToken),signedLegacyBefore);
  assert.equal((await local.query('SELECT signature_data,document_hash FROM waiver_submissions WHERE id=$1',[signedId])).rows[0].signature_data,legacySignature);
  // Publishing for future clients retains an unversioned form instead of
  // retroactively inventing its issuance snapshot or invalidating its link.
  const retainedForm=randomUUID(),retainedAssignment=randomUUID(),retainedToken='c'.repeat(48);
  await local.query("INSERT INTO external_waiver_forms(id,organization_id,artist_id,provider,name,form_url,audience,completion_mode,metadata) VALUES($1,$2,$3,'MAIA','Retained form','/waiver','ADULT','HOSTED',$4)",[retainedForm,org,artist,JSON.stringify({templateId:legacyTemplate,definition})]);
  await local.query("INSERT INTO external_waiver_assignments(id,organization_id,waiver_form_id,appointment_id,client_id,tracking_token_hash) VALUES($1,$2,$3,$4,$5,$6)",[retainedAssignment,org,retainedForm,appointment,client,digest(retainedToken)]);
  const retainedBefore=await publicForm(retainedToken);
  const retainedRecord=(await local.query('SELECT * FROM external_waiver_assignments WHERE id=$1',[retainedAssignment])).rows[0];
  const futureDraft=await save(retainedForm,'Updated future form','New future wording','MINOR');
  const futureAction={action:'PUBLISH_FUTURE',formId:retainedForm,draftId:futureDraft.id,revision:futureDraft.revision};
  assert.equal((await action(futureAction,'c')).status,404);
  assert.equal((await action(futureAction,'d')).status,404);
  const futureResults=await Promise.all([action(futureAction),action(futureAction)]);
  assert.deepEqual(futureResults.map(r=>r.status).sort(),[200,404]);
  const futureResult=await futureResults.find(r=>r.status===200)!.json();
  assert.notEqual(futureResult.formId,retainedForm);
  assert.equal(futureResult.preservedExistingLinks,true);
  assert.deepEqual(await publicForm(retainedToken),retainedBefore);
  assert.deepEqual((await local.query('SELECT * FROM external_waiver_assignments WHERE id=$1',[retainedAssignment])).rows[0],retainedRecord);
  const oldForm=(await local.query('SELECT * FROM external_waiver_forms WHERE id=$1',[retainedForm])).rows[0];
  assert.equal(oldForm.active,false);assert.equal(oldForm.metadata.archived,true);
  assert.equal(oldForm.audience,'ADULT');assert.deepEqual(oldForm.metadata.definition,definition);
  assert.equal(oldForm.metadata.templateId,legacyTemplate);
  assert.equal((await edit(request('/api/consent-versions?formId='+retainedForm),undefined)).status,404);
  const futureState=await editor(futureResult.formId);
  assert.equal(futureState.form.definition.body,'New future wording');assert.equal(futureState.form.audience,'MINOR');
  const futureLink=await link(futureResult.formId);
  assert.ok(futureLink.assignment.nativeVersionId);
  assert.equal((await publicForm(new URL(futureLink.url).searchParams.get('waiverToken')!)).definition.body,'New future wording');
  const oldSigned=await sign(request('/api/public/waivers/native','b',{token:retainedToken,signedName:'Synthetic Client',agreed:true,answers:{agree:true},signature:{strokes:[[{x:0.1,y:0.1},{x:0.8,y:0.8}]]}}));
  assert.equal(oldSigned.status,200,await oldSigned.clone().text());
  const retainedSignedView=await publicForm(retainedToken);assert.equal(retainedSignedView.definition.body,definition.body);assert.equal(retainedSignedView.audience,'ADULT');

 }finally{
  await local.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await local.query(`DROP SCHEMA IF EXISTS ${journal} CASCADE`);await local.end();await pool.end();rmSync(folder,{recursive:true,force:true});
 }
});
