import { pool } from '@db';
import type { Identity } from '@/packages/auth/server';
export class ProvisionReviewConflict extends Error {}
/** Closes local bookkeeping only; never retries a remote write or certifies provider approval. */
export async function reviewPersistedProvision(actor: Identity, operationId: string, reference: string) {
  if(actor.role!=='OWNER' || !reference.trim() || reference.length>300) throw new ProvisionReviewConflict('Owner review and an evidence reference are required.');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`legal-customer:${actor.organization_id}`]);
    const owner=await client.query("SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND role='OWNER' FOR SHARE",[actor.id,actor.organization_id]);
    if(!owner.rows.length)throw new ProvisionReviewConflict('Owner review is required.');
    const result=await client.query(`SELECT o.* FROM twilio_provision_operations o WHERE id=$1 AND organization_id=$2 FOR UPDATE`,[operationId,actor.organization_id]);
    const operation=result.rows[0];
    if(!operation)throw new ProvisionReviewConflict('Operation not found in this organization.');
    if(operation.reviewed_at) { await client.query('COMMIT');return {id:operation.id,status:operation.status}; }
    if(operation.status!=='INTENT')throw new ProvisionReviewConflict('Only unresolved intents can be reviewed.');
    // Require a current binding and one unambiguous persisted service/number graph.
    const binding=await client.query(`SELECT a.id FROM legal_customer_accounts b JOIN twilio_accounts a ON a.id=b.twilio_account_id AND a.organization_id=b.organization_id WHERE b.organization_id=$1 AND b.twilio_account_id=$2 AND a.status='ACTIVE' FOR SHARE OF a,b`,[actor.organization_id,operation.twilio_account_id]);
    if(binding.rows.length!==1)throw new ProvisionReviewConflict('Active reviewed account binding required.');
    const services=await client.query('SELECT id,service_sid FROM twilio_messaging_services WHERE organization_id=$1 AND artist_id=$2 AND twilio_account_id=$3 AND status=\'ACTIVE\' FOR SHARE',[actor.organization_id,operation.artist_id,operation.twilio_account_id]);
    const numbers=await client.query('SELECT id,twilio_phone_number_sid,twilio_messaging_service_sid FROM phone_numbers WHERE organization_id=$1 AND artist_id=$2 AND twilio_account_id=$3 AND is_primary=true FOR SHARE',[actor.organization_id,operation.artist_id,operation.twilio_account_id]);
    const service=services.rows[0],number=numbers.rows[0];
    if(services.rows.length>1 || numbers.rows.length>1)throw new ProvisionReviewConflict('Ambiguous local resources require separate investigation.');
    const validService=services.rows.length===1 && /^MG[0-9a-f]{32}$/i.test(service.service_sid);
    const validNumber=numbers.rows.length===1 && /^PN[0-9a-f]{32}$/i.test(number.twilio_phone_number_sid);
    const persisted=operation.step==='SERVICE'?validService:operation.step==='NUMBER'?validNumber:operation.step==='ASSOCIATE' && validService && validNumber && number.twilio_messaging_service_sid===service.service_sid;
    if(!persisted)throw new ProvisionReviewConflict('Matching persisted resource required; unknown provider outcomes cannot be cleared.');
    await client.query(`UPDATE twilio_provision_operations SET status='COMPLETED',completed_at=now(),reviewed_at=now(),reviewed_by_user_id=$1,review_reference=$2 WHERE id=$3 AND organization_id=$4`,[actor.id,reference.trim(),operation.id,actor.organization_id]);
    await client.query('COMMIT');return {id:operation.id,status:'COMPLETED'};
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
