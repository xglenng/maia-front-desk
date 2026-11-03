// Read-only by default. Recovery archives one stale intent only after a complete
// authenticated provider inventory proves no subaccount was created near/after it.
const {Pool}=require('pg');
const {verifyTarget}=require('./render-consent-migrate.cjs');
const artistId='eff8597a-1aed-4394-af2b-842f63e323b8';
const {createHash}=require('node:crypto');
const expectedParentHash='caef4bcb1b0581c3af726a24112f1abc87fc8013453311019781794bd2b411e4';
async function inventory(env=process.env,request=fetch,parentHash=expectedParentHash){
 const expectedParent=env.TWILIO_ACCOUNT_SID;
 if(!/^AC[0-9a-f]{32}$/i.test(expectedParent||'')||createHash('sha256').update(expectedParent).digest('hex')!==parentHash||!env.TWILIO_AUTH_TOKEN)throw Error('Parent configuration mismatch');
 const accounts=[];let path='/2010-04-01/Accounts.json?PageSize=1000';const seen=new Set();
 while(path){
  if(seen.has(path)||seen.size>=100||!path.startsWith('/2010-04-01/Accounts.json?'))throw Error('Provider pagination refused');
  seen.add(path);
  const response=await request('https://api.twilio.com'+path,{method:'GET',headers:{Authorization:'Basic '+Buffer.from(`${expectedParent}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')},signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok)throw Error(`Provider inventory rejected (HTTP ${response.status})`);
  const body=await response.json();
  if(!Array.isArray(body.accounts)||!(body.next_page_uri===null||typeof body.next_page_uri==='string'))throw Error('Incomplete provider inventory');
  for(const row of body.accounts){
   if(!/^AC[0-9a-f]{32}$/i.test(row.sid)||row.owner_account_sid!==expectedParent||!Number.isFinite(Date.parse(row.date_created)))throw Error('Provider account ownership/date mismatch');
   // Never retain or return provider credentials.
   accounts.push({sid:row.sid,isParent:row.sid===expectedParent,createdAt:new Date(row.date_created).toISOString(),status:row.status});
  }
  path=body.next_page_uri;
 }
 if(!accounts.some(a=>a.sid===expectedParent))throw Error('Parent missing from inventory');
 return accounts;
}
function evaluate(intent,accounts,now=Date.now()){
 const created=Date.parse(intent.created_at);
 if(intent.status!=='INTENT'||intent.twilio_account_id||intent.completed_at||!Number.isFinite(created))throw Error('Intent not unresolved');
 if(now-created<15*60000)throw Error('Intent too recent to reconcile');
 const recent=accounts.filter(a=>!a.isParent&&Date.parse(a.createdAt)>=created-5*60000);
 return {safeToClear:recent.length===0,recentSubaccountCount:recent.length,subaccountCount:accounts.filter(a=>!a.isParent).length,intentCreatedAt:new Date(created).toISOString()};
}
async function review(client,accounts,apply=false,now=Date.now()){
 await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  const target=(await client.query('SELECT a.organization_id,o.name FROM artists a JOIN organizations o ON o.id=a.organization_id WHERE a.id=$1 FOR UPDATE OF a,o',[artistId])).rows[0];
  if(!target||!/^embellished studios(?:\s*,?\s*llc)?$/i.test(target.name.trim()))throw Error('Studio mismatch');
  const org=target.organization_id;
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`legal-customer:${org}`]);
  const intents=(await client.query('SELECT id,organization_id,legal_customer_id,artist_id,requested_by_user_id,twilio_account_id,status,created_at,completed_at FROM twilio_account_creation_intents WHERE organization_id=$1 FOR UPDATE',[org])).rows;
  if(intents.length!==1||intents[0].artist_id!==artistId)throw Error('Expected one Val account intent');
  const intent=intents[0];
  const customer=(await client.query('SELECT id,legal_name FROM legal_customers WHERE id=$1 AND organization_id=$2 FOR SHARE',[intent.legal_customer_id,org])).rows[0];
  if(!customer||!/^embellished studios(?:\s*,?\s*llc)?$/i.test(customer.legal_name.trim()))throw Error('Legal customer mismatch');
  for(const table of ['twilio_accounts','twilio_messaging_services','phone_numbers','legal_customer_accounts','a2p_campaigns','phone_number_port_requests','twilio_provision_operations']){
   if((await client.query(`SELECT 1 FROM ${table} WHERE organization_id=$1 LIMIT 1`,[org])).rows.length)throw Error('Existing resource or operation requires separate reconciliation');
  }
  const report=evaluate(intent,accounts,now);
  if(!apply){await client.query('ROLLBACK');return {applied:false,...report};}
  if(!report.safeToClear)throw Error('Provider outcome is not empty; refusing recovery');
  await client.query(`INSERT INTO studio_activation_events(organization_id,artist_id,action,status,details) VALUES($1,$2,'RECOVER_EMPTY_TWILIO_ACCOUNT_INTENT','SUCCESS',$3::jsonb)`,[org,artistId,JSON.stringify({version:1,intent,providerInventory:accounts,reason:'Operator-approved stale attempt recovery after verified empty provider outcome',providerAction:false})]);
  const removed=await client.query("DELETE FROM twilio_account_creation_intents WHERE id=$1 AND organization_id=$2 AND status='INTENT' AND twilio_account_id IS NULL RETURNING id",[intent.id,org]);
  if(removed.rowCount!==1)throw Error('Intent changed during recovery');
  await client.query('COMMIT');return {applied:true,...report};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
async function main(){
 verifyTarget();
 const accounts=await inventory();
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});let client;
 try{client=await pool.connect();console.log('FIRST_ACCOUNT_REVIEW '+JSON.stringify(await review(client,accounts,process.env.MAIA_RECOVER_EMPTY_ACCOUNT_INTENT==='1')));}
 finally{client?.release();await pool.end();}
}
if(require.main===module)main().catch(error=>{console.error('FIRST_ACCOUNT_REVIEW refused: '+(error instanceof Error&&/^(Parent configuration mismatch|Provider inventory rejected \(HTTP \d{3}\)|Provider pagination refused|Incomplete provider inventory|Provider account ownership\/date mismatch|Parent missing from inventory|Studio mismatch|Expected one Val account intent|Legal customer mismatch|Existing resource or operation requires separate reconciliation|Intent not unresolved|Intent too recent to reconcile|Provider outcome is not empty; refusing recovery|Intent changed during recovery)$/.test(error.message)?error.message:'Diagnostic failed; no credentials logged'));process.exitCode=1;});
module.exports={inventory,evaluate,review,artistId};
