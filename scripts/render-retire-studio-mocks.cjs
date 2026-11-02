// Retire only a wholly synthetic Embellished Studios Twilio graph. No provider calls.
// Defaults to read-only inspection; apply requires MAIA_RETIRE_STUDIO_MOCKS=1.
const {Pool}=require('pg');
const {verifyTarget}=require('./render-consent-migrate.cjs');
const artistId='eff8597a-1aed-4394-af2b-842f63e323b8';
function validateMockGraph(accounts,services,numbers){
 const ids=new Set(accounts.map(row=>row.id));
 if(accounts.some(row=>!/^ACMOCK/.test(row.account_sid)))throw Error('Non-mock account present');
 if(services.some(row=>!/^MGMOCK/.test(row.service_sid)||!ids.has(row.twilio_account_id)))throw Error('Non-mock or unowned service present');
 if(numbers.some(row=>!/^PNMOCK/.test(row.twilio_phone_number_sid||'')||!/^MGMOCK/.test(row.twilio_messaging_service_sid||'')||row.compliance_status!=='MOCK_APPROVED'||!ids.has(row.twilio_account_id)))throw Error('Non-mock or unowned number present');
}
async function retireStudioMocks(client,apply=false){
 await client.query('BEGIN');
 try{
 const target=(await client.query(`SELECT a.organization_id,o.name FROM artists a JOIN organizations o ON o.id=a.organization_id WHERE a.id=$1 FOR UPDATE OF a,o`,[artistId])).rows[0];
 if(!target||!/^embellished studios(?:\s*,?\s*llc)?$/i.test(target.name.trim()))throw Error('Studio identity mismatch');
 const org=target.organization_id;
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`legal-customer:${org}`]);
 // Explicit columns exclude all credentials from the archive and output.
 const accounts=(await client.query('SELECT id,organization_id,artist_id,account_sid,status,created_at,updated_at FROM twilio_accounts WHERE organization_id=$1 FOR UPDATE',[org])).rows;
 const services=(await client.query('SELECT id,organization_id,artist_id,twilio_account_id,service_sid,status,created_at,updated_at FROM twilio_messaging_services WHERE organization_id=$1 FOR UPDATE',[org])).rows;
 const numbers=(await client.query('SELECT id,organization_id,artist_id,phone_number,provider,twilio_account_id,twilio_phone_number_sid,twilio_messaging_service_sid,compliance_status,lifecycle_role,is_primary,retire_after,active,created_at,updated_at FROM phone_numbers WHERE organization_id=$1 FOR UPDATE',[org])).rows;
 validateMockGraph(accounts,services,numbers);
 for(const table of ['legal_customer_accounts','a2p_campaigns','phone_number_port_requests','twilio_account_creation_intents','twilio_provision_operations']){
  if((await client.query(`SELECT 1 FROM ${table} WHERE organization_id=$1 LIMIT 1`,[org])).rows.length)throw Error('Registration, ownership, port or operation history requires separate review');
 }
 const cascades=await client.query("SELECT 1 FROM pg_constraint WHERE contype='f' AND confdeltype='c' AND confrelid IN ('twilio_accounts'::regclass,'twilio_messaging_services'::regclass,'phone_numbers'::regclass) LIMIT 1");
 if(cascades.rows.length)throw Error('Cascading references require separate review');
 const counts={accounts:accounts.length,services:services.length,numbers:numbers.length};
 if(!apply||!accounts.length){await client.query('ROLLBACK');return {applied:false,counts};}
 // Audit and removals are atomic. Unknown FK references cause rollback, never cascade.
 await client.query(`INSERT INTO studio_activation_events(organization_id,artist_id,action,status,details) VALUES($1,$2,'ARCHIVE_STUDIO_MOCK_TWILIO','SUCCESS',$3::jsonb)`,[org,artistId,JSON.stringify({version:1,reason:'User-approved retirement of synthetic SMS setup graph',providerAction:false,accounts,services,numbers,credentialsExcluded:true})]);
 for(const [table,rows] of [['phone_numbers',numbers],['twilio_messaging_services',services],['twilio_accounts',accounts]]){
  const result=await client.query(`DELETE FROM ${table} WHERE organization_id=$1 AND id=ANY($2::uuid[]) RETURNING id`,[org,rows.map(row=>row.id)]);
  if(result.rowCount!==rows.length)throw Error('Resource graph changed during retirement');
 }
 await client.query('COMMIT');return {applied:true,counts};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
async function main(){verifyTarget();const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});let client;try{client=await pool.connect();console.log(JSON.stringify(await retireStudioMocks(client,process.env.MAIA_RETIRE_STUDIO_MOCKS==='1')));}finally{client?.release();await pool.end();}}
if(require.main===module)main().catch(()=>{console.error('Mock graph retirement refused or failed; transaction rolled back. No credentials logged.');process.exitCode=1;});
module.exports={validateMockGraph,retireStudioMocks};
