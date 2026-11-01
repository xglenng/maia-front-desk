// Approved maintenance: retire only Val's exact mock primary number, retaining
// its row and recording the prior flags for recovery. Never calls Twilio.
const {Pool}=require('pg');
const {verifyTarget}=require('./render-consent-migrate.cjs');
const artistId='eff8597a-1aed-4394-af2b-842f63e323b8';
const mockNumber='+15554558597';
async function unassignValMock(client){
 await client.query('BEGIN');
 try{
  const artist=(await client.query(`SELECT a.organization_id,a.display_name,o.name AS studio_name FROM artists a JOIN organizations o ON o.id=a.organization_id WHERE a.id=$1 FOR UPDATE OF a`,[artistId])).rows[0];
  if(!artist||artist.display_name!=='Val'||!/^embellished studios(?:\s*,?\s*llc)?$/i.test(artist.studio_name.trim()))throw Error('Artist/studio identity mismatch');
  const numbers=(await client.query(`SELECT p.id,p.phone_number,p.compliance_status,p.active,p.is_primary,p.twilio_phone_number_sid,p.twilio_messaging_service_sid,p.twilio_account_id,a.account_sid FROM phone_numbers p LEFT JOIN twilio_accounts a ON a.id=p.twilio_account_id AND a.organization_id=p.organization_id WHERE p.organization_id=$1 AND p.artist_id=$2 AND (p.is_primary=true OR p.phone_number=$3) FOR UPDATE OF p`,[artist.organization_id,artistId,mockNumber])).rows;
  const target=numbers.find(row=>row.phone_number===mockNumber);
  if(!target||numbers.some(row=>row.is_primary&&row.id!==target.id))throw Error('Unexpected primary phone state');
  if(target.compliance_status!=='MOCK_APPROVED'||!/^PNMOCK/.test(target.twilio_phone_number_sid||'')||!/^MGMOCK/.test(target.twilio_messaging_service_sid||'')||!/^ACMOCK/.test(target.account_sid||''))throw Error('Refusing non-mock resources');
  if(!target.active&&!target.is_primary){await client.query('COMMIT');return {changed:false};}
  const updated=await client.query(`UPDATE phone_numbers SET active=false,is_primary=false,updated_at=now() WHERE id=$1 AND organization_id=$2 AND artist_id=$3 AND phone_number=$4 AND compliance_status='MOCK_APPROVED' AND twilio_phone_number_sid LIKE 'PNMOCK%' RETURNING id`,[target.id,artist.organization_id,artistId,mockNumber]);
  if(updated.rowCount!==1)throw Error('Mock number changed during cleanup');
  await client.query(`INSERT INTO studio_activation_events(organization_id,artist_id,action,status,details) VALUES($1,$2,'UNASSIGN_MOCK_NUMBER','SUCCESS',$3::jsonb)`,[artist.organization_id,artistId,JSON.stringify({phoneNumberId:target.id,previousActive:target.active,previousIsPrimary:target.is_primary,reason:'User-approved removal of Val mock primary number; retained for recovery',providerAction:false})]);
  if((await client.query('SELECT id FROM phone_numbers WHERE organization_id=$1 AND artist_id=$2 AND is_primary=true',[artist.organization_id,artistId])).rowCount!==0)throw Error('Primary number still assigned');
  await client.query('COMMIT');return {changed:true};
 }catch(error){await client.query('ROLLBACK');throw error;}
}
async function main(){verifyTarget();const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000});let client;try{client=await pool.connect();const result=await unassignValMock(client);console.log(result.changed?'PASS: Val mock number unassigned and deactivated; audit recorded; no Twilio calls.':'PASS: Val mock number was already unassigned; no changes.');}finally{client?.release();await pool.end();}}
if(require.main===module)main().catch(()=>{console.error('Val mock cleanup refused or failed. No credentials logged.');process.exitCode=1;});
module.exports={unassignValMock,artistId,mockNumber};
