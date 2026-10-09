import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import assert from 'node:assert/strict';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000, query_timeout: 15000 });
async function main() {
  assert.equal(process.env.MAIA_STAGING_ISOLATED, '1');
  assert.equal((await pool.query('SELECT purpose FROM maia_staging_meta.bootstrap LIMIT 1')).rows[0]?.purpose, 'synthetic-testing');
  const org = randomUUID(), artist = randomUUID(), form = randomUUID();
  const slug = `pr1-consent-${randomUUID().slice(0,8)}`;
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    await conn.query("INSERT INTO organizations(id,name,slug) VALUES($1,'PR-1 Synthetic Consent Test',$2)", [org,slug]);
    await conn.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Synthetic Test Artist')", [artist,org]);
    await conn.query("INSERT INTO artist_consent_forms(id,organization_id,artist_id,slug,disclosure_text) VALUES($1,$2,$3,$4,'Synthetic testing only. Optional appointment SMS. Message frequency varies. Reply STOP to opt out. No messages will be sent in this isolated environment.')", [form,org,artist,slug]);
    await conn.query("INSERT INTO legal_documents(organization_id,type,title,content,effective_date,status) VALUES($1,'PRIVACY','Synthetic Privacy','Synthetic fixtures only; not a real studio policy.','2026-10-08','PUBLISHED'),($1,'TERMS','Synthetic Terms','Synthetic fixtures only; no booking or payment commitment.','2026-10-08','PUBLISHED')", [org]);
    await conn.query("INSERT INTO clients(organization_id,first_name,email,phone,sms_opt_in,sms_consent_status) VALUES($1,'Original Synthetic','original@example.test','+15555550188',false,'OPTED_OUT')", [org]);
    await conn.query('COMMIT');
  } catch (error) { await conn.query('ROLLBACK'); throw error; } finally { conn.release(); }
  const request = async (phone: string, consent: boolean) => {
    const response = await fetch('http://127.0.0.1:3100/api/public/booking-inquiries', {
      method: 'POST', headers: { origin: 'http://127.0.0.1:3100', 'content-type':'application/json' },
      body: JSON.stringify({ organizationSlug:slug,formSlug:slug,firstName:'Claimed Synthetic',email:'claimed@example.test',phone,inquiry:'Synthetic appointment request only',smsConsent:consent })
    });
    assert.equal(response.status,200,'Unexpected synthetic intake response');
    return response.json();
  };
  const stopped = await request('+15555550188',true);
  assert.equal(stopped.smsConsent,false); assert.equal(stopped.verificationRequired,true);
  const row = (await pool.query('SELECT first_name,email,sms_opt_in,sms_consent_status FROM clients WHERE organization_id=$1 AND phone=$2',[org,'+15555550188'])).rows[0];
  assert.deepEqual(row,{first_name:'Original Synthetic',email:'original@example.test',sms_opt_in:false,sms_consent_status:'OPTED_OUT'});
  const unchecked = await request('+15555550189',false); assert.equal(unchecked.smsConsent,false);
  const evidence = await pool.query('SELECT consented,metadata FROM sms_consent_evidence WHERE organization_id=$1 ORDER BY submitted_at',[org]);
  assert.equal(evidence.rows.length,2); assert.ok(evidence.rows.every(row=>row.consented===false));
  assert.ok(evidence.rows[0].metadata.inquiryId);
  console.log('PASS: isolated staging HTTP STOP/identity and unchecked inquiry checks. Synthetic fixtures retained.');
  console.log(`Browser test URL: http://127.0.0.1:3100/book/${slug}/${slug}`);
}
main().catch(error=>{console.error('Synthetic consent verification failed; no credentials or customer data printed.',{errorType:error?.name,code:error?.code});process.exitCode=1;}).finally(()=>pool.end());
