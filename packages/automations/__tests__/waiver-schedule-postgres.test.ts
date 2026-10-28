import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {db,pool} from '@/packages/db/src';
const socket=process.env.MAIA_WAIVER_SCHEDULE_TEST_SOCKET;
test('consent scheduling and AI links preserve scope and avoid duplicate jobs',{skip:!socket},async t=>{
 assert.match(socket!,/^\/private\/tmp\/maia-forms-[A-Za-z0-9]+$/);
 const local=new Pool({host:socket,port:55449,database:'maia_forms_test',user:process.env.USER});
 try{
  assert.equal((await local.query('SHOW data_directory')).rows[0].data_directory,`${socket}/data`);
  await local.query(readFileSync('packages/db/staging/schema.sql','utf8'));
  t.mock.method(pool,'query',local.query.bind(local));t.mock.method(pool,'connect',local.connect.bind(local));
  t.mock.method(globalThis,'fetch',async()=>{throw Error('No provider requests permitted');});
  const {syncArtistWaiverJobs}=await import('../waiver-schedule.server');
  const {processAppointmentAutomationJob}=await import('../appointment-processor.server');
  const {automationJobs}=await import('@/packages/db/src/schema');
  const {eq}=await import('drizzle-orm');
  const {getWaiverLink}=await import('@/packages/ai/src/tools');
  const org=randomUUID(),other=randomUUID(),artist=randomUUID(),peer=randomUUID(),client=randomUUID(),appt=randomUUID();
  await local.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic','schedule-test'),($2,'Other','schedule-other')",[org,other]);
  await local.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Artist'),($3,$2,'Peer')",[artist,org,peer]);
  await local.query("INSERT INTO clients(id,organization_id,first_name,phone,sms_opt_in) VALUES($1,$2,'Synthetic','+12025550123',true)",[client,org]);
  await local.query("INSERT INTO appointments(id,organization_id,artist_id,client_id,starts_at,ends_at,status,price_cents,deposit_cents,deposit_status,scheduling_provider) VALUES($1,$2,$3,$4,'2035-01-08T21:00:00Z','2035-01-08T22:00:00Z','CONFIRMED',0,0,'NOT_REQUIRED','INTERNAL')",[appt,org,artist,client]);
  // Recreate the old constraint/default to verify the forward migration preserves existing settings.
  await local.query('UPDATE artists SET appointment_waiver_send_minutes=360; ALTER TABLE artists DROP CONSTRAINT artists_appointment_waiver_send_minutes_check; ALTER TABLE artists ADD CONSTRAINT artists_appointment_waiver_send_minutes_check CHECK(appointment_waiver_send_minutes IN (120,240,360,720)); ALTER TABLE artists ALTER COLUMN appointment_waiver_send_minutes SET DEFAULT 360');
  await local.query('UPDATE artists SET appointment_waiver_send_minutes=360');
  await local.query(readFileSync('packages/db/drizzle/0021_one_hour_consent_send.sql','utf8'));
  assert.equal((await local.query('SELECT appointment_waiver_send_minutes n FROM artists WHERE id=$1',[artist])).rows[0].n,360);
  await local.query('UPDATE artists SET appointment_waiver_send_minutes=60 WHERE id=$1',[artist]);
  await assert.rejects(local.query('UPDATE artists SET appointment_waiver_send_minutes=61 WHERE id=$1',[artist]));
  const now=new Date('2035-01-08T16:00:00Z');
  const sync=(enabled=true,leadMinutes=60,organizationId=org,artistId=artist)=>db.transaction(tx=>syncArtistWaiverJobs(tx,{organizationId,artistId,enabled,leadMinutes},now));
  const jobs=async()=>(await local.query('SELECT * FROM automation_jobs WHERE appointment_id=$1',[appt])).rows;
  await sync();await sync();let rows=await jobs();assert.equal(rows.length,1);assert.equal(rows[0].run_at.toISOString(),'2035-01-08T20:00:00.000Z');
  await sync(true,120);assert.equal((await jobs())[0].run_at.toISOString(),'2035-01-08T19:00:00.000Z');
  await sync(false,60,other);await sync(false,60,org,peer);assert.equal((await jobs())[0].status,'PENDING');
  await sync(false);assert.equal((await jobs())[0].status,'CANCELLED');await sync();assert.equal((await jobs())[0].status,'PENDING');
  await assert.rejects(db.transaction(async tx => {
   await syncArtistWaiverJobs(tx,{organizationId:org,artistId:artist,enabled:true,leadMinutes:120},now);
   throw Error('Synthetic rollback');
  }),/Synthetic rollback/);
  assert.equal((await jobs())[0].run_at.toISOString(),'2035-01-08T20:00:00.000Z');
  await local.query("UPDATE automation_jobs SET status='SENDING' WHERE appointment_id=$1",[appt]);
  await sync(false);assert.equal((await jobs())[0].status,'SENDING');
  await local.query("UPDATE automation_jobs SET status='COMPLETED' WHERE appointment_id=$1",[appt]);await sync(true,120);assert.equal((await jobs())[0].status,'COMPLETED');
  await local.query('UPDATE artists SET appointment_waiver_send_enabled=true WHERE id=$1',[artist]);
  const lock=randomUUID();
  await local.query("UPDATE automation_jobs SET status='PROCESSING',lock_token=$2 WHERE appointment_id=$1",[appt,lock]);
  let [claimed]=await db.select().from(automationJobs).where(eq(automationJobs.appointmentId,appt));
  assert.equal((await processAppointmentAutomationJob(claimed)).status,'RETRY');
  assert.equal((await jobs())[0].last_error_code,'WAIVER_TIMING_CHANGED');
  await local.query("INSERT INTO conversations(organization_id,artist_id,client_id,channel,status,ai_enabled) VALUES($1,$2,$3,'SMS','HUMAN_TAKEOVER',false)",[org,artist,client]);
  await local.query("UPDATE automation_jobs SET status='PROCESSING',lock_token=$2 WHERE appointment_id=$1",[appt,lock]);
  [claimed]=await db.select().from(automationJobs).where(eq(automationJobs.appointmentId,appt));
  assert.equal((await processAppointmentAutomationJob(claimed)).status,'CANCELLED');
  assert.equal((await jobs())[0].last_error_code,'HUMAN_TAKEOVER');
  const form=randomUUID();await local.query("INSERT INTO external_waiver_forms(id,organization_id,artist_id,provider,name,form_url,active) VALUES($1,$2,$3,'MAIA','Consent','/waiver',true)",[form,org,artist]);
  const ctx={organizationId:org,artistId:artist,clientId:client,conversationId:randomUUID(),channel:'SMS'};
  const before=process.env.NEXT_PUBLIC_APP_URL;
  try{
   process.env.NEXT_PUBLIC_APP_URL='https://maia.example.test';
   const link=await getWaiverLink(ctx,appt);const url=new URL(link.waiverUrl);assert.equal(url.pathname,'/waiver');assert.match(url.searchParams.get('waiverToken')!,/^[a-f0-9]{48}$/);assert.equal(url.searchParams.has('clientId'),false);
   await assert.rejects(getWaiverLink({...ctx,organizationId:other},appt),/Appointment not found/);
   await assert.rejects(getWaiverLink({...ctx,artistId:peer},appt),/Appointment not found/);
   await assert.rejects(getWaiverLink({...ctx,clientId:randomUUID()},appt),/Appointment not found/);
   delete process.env.NEXT_PUBLIC_APP_URL;
   await assert.rejects(getWaiverLink(ctx,appt),/Public form URL/);
   assert.equal((await local.query('SELECT count(*)::int n FROM external_waiver_assignments WHERE appointment_id=$1',[appt])).rows[0].n,1);
  }finally{if(before===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=before;}
 }finally{await local.end();}
});
