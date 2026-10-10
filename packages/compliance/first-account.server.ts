import { pool } from '@db';
import type { Identity } from '@/packages/auth/server';
import { createTwilioSubaccount,encryptSecret } from '@integrations/twilio';
import { twilioProvisionPreflight } from '@integrations/twilio-provision-preflight';
export class FirstAccountConflict extends Error {}
/** Deliberately disabled by default, including mock/staging. No implicit fallback. */
export function assertFirstAccountEnabled() {
  if(process.env.MAIA_STAGING_ISOLATED==='1' || process.env.TWILIO_PROVISION_MODE!=='live' || process.env.TWILIO_ACCOUNT_CREATION_ENABLED!=='true')throw new FirstAccountConflict('Live account creation is disabled. Explicit operator authorization is required.');
}
export async function createFirstLegalAccount(actor:Identity,input:{legalCustomerId:string;artistId:string}) {
  assertFirstAccountEnabled();
  if(actor.role!=='OWNER')throw new FirstAccountConflict('Owner authorization required.');
  twilioProvisionPreflight({});
  const client=await pool.connect();
  let intentId:string,legalName:string;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`legal-customer:${actor.organization_id}`]);
    const owner=await client.query("SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND role='OWNER' FOR SHARE",[actor.id,actor.organization_id]);
    const customer=await client.query('SELECT legal_name FROM legal_customers WHERE id=$1 AND organization_id=$2 FOR SHARE',[input.legalCustomerId,actor.organization_id]);
    const artist=await client.query('SELECT id FROM artists WHERE id=$1 AND organization_id=$2 FOR SHARE',[input.artistId,actor.organization_id]);
    if(!owner.rows.length || !customer.rows.length || !artist.rows.length)throw new FirstAccountConflict('Owner, legal customer and founding artist must belong to this organization.');
    const existing=await client.query(`SELECT EXISTS(SELECT 1 FROM twilio_accounts WHERE organization_id=$1) OR EXISTS(SELECT 1 FROM twilio_messaging_services WHERE organization_id=$1) OR EXISTS(SELECT 1 FROM phone_numbers WHERE organization_id=$1) AS present`,[actor.organization_id]);
    if(existing.rows[0].present)throw new FirstAccountConflict('Existing resources require account review; first-account creation cannot adopt or replace them.');
    const claim=await client.query(`INSERT INTO twilio_account_creation_intents(organization_id,legal_customer_id,artist_id,requested_by_user_id) VALUES($1,$2,$3,$4) ON CONFLICT(organization_id) DO NOTHING RETURNING id`,[actor.organization_id,input.legalCustomerId,input.artistId,actor.id]);
    if(!claim.rows.length)throw new FirstAccountConflict('An account creation intent already exists. Review its outcome before retry.');
    intentId=claim.rows[0].id;legalName=customer.rows[0].legal_name;
    await client.query('COMMIT');
  } catch(error) {await client.query('ROLLBACK');client.release();throw error;}
  // Intent is committed before remote work. All uncertain outcomes remain blocked.
  try {
    const created=await createTwilioSubaccount(`Maia ${legalName}`);
    if(!/^AC[0-9a-f]{32}$/i.test(created.sid) || created.sid===process.env.TWILIO_ACCOUNT_SID || !created.auth_token?.trim())throw new FirstAccountConflict('Account creation outcome needs review.');
    const encrypted=encryptSecret(created.auth_token);
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`legal-customer:${actor.organization_id}`]);
    const account=await client.query(`INSERT INTO twilio_accounts(organization_id,artist_id,account_sid,auth_token_encrypted,status) VALUES($1,$2,$3,$4,'ACTIVE') RETURNING id`,[actor.organization_id,input.artistId,created.sid,encrypted]);
    await client.query(`INSERT INTO legal_customer_accounts(organization_id,legal_customer_id,twilio_account_id,verified_by_user_id,verified_at,verification_reference) VALUES($1,$2,$3,$4,now(),$5)`,[actor.organization_id,input.legalCustomerId,account.rows[0].id,actor.id,`Created by account intent ${intentId}`]);
    await client.query(`UPDATE twilio_account_creation_intents SET status='COMPLETED',completed_at=now(),twilio_account_id=$1 WHERE id=$2 AND organization_id=$3`,[account.rows[0].id,intentId,actor.organization_id]);
    await client.query('COMMIT');
    return {accountId:account.rows[0].id,legalCustomerId:input.legalCustomerId,status:'ACCOUNT_CREATED',registrationApproved:false};
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
