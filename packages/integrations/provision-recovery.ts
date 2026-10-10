import { pool } from '@db';

type Operation = { id: string; artist_id: string; twilio_account_id: string; step: 'SERVICE' | 'NUMBER' | 'ASSOCIATE'; status: string; created_at: Date; completed_at: Date | null; service_count: number; number_count: number; associated_count: number; binding_matches: boolean };
/** Local evidence only. Provider inventory is never fetched or inferred from this report. */
export function recoveryDecision(row: Operation) {
  if (!row.binding_matches) return 'ACCOUNT_REVIEW_REQUIRED';
  if (row.service_count > 1 || row.number_count > 1) return 'AMBIGUOUS_LOCAL_RESOURCES';
  const persisted = row.step === 'SERVICE' ? row.service_count === 1 : row.step === 'NUMBER' ? row.number_count === 1 : row.associated_count === 1;
  if (row.status === 'COMPLETED') return persisted ? 'LOCAL_RECORD_PRESENT' : 'COMPLETED_RESOURCE_MISSING';
  return persisted ? 'LOCAL_RECORD_PRESENT_REVIEW_INTENT' : 'PROVIDER_OUTCOME_UNKNOWN';
}
export async function provisioningRecoveryReport(organizationId: string) {
  const result = await pool.query<Operation>(`
    SELECT o.id,o.artist_id,o.twilio_account_id,o.step,o.status,o.created_at,o.completed_at,
      EXISTS(SELECT 1 FROM legal_customer_accounts b JOIN twilio_accounts a ON a.id=b.twilio_account_id AND a.organization_id=b.organization_id WHERE b.organization_id=o.organization_id AND b.twilio_account_id=o.twilio_account_id AND a.status='ACTIVE') AS binding_matches,
      (SELECT count(*)::integer FROM twilio_messaging_services s WHERE s.organization_id=o.organization_id AND s.artist_id=o.artist_id AND s.twilio_account_id=o.twilio_account_id) AS service_count,
      (SELECT count(*)::integer FROM phone_numbers n WHERE n.organization_id=o.organization_id AND n.artist_id=o.artist_id AND n.twilio_account_id=o.twilio_account_id AND n.is_primary=true) AS number_count,
      (SELECT count(*)::integer FROM phone_numbers n JOIN twilio_messaging_services s ON s.organization_id=n.organization_id AND s.artist_id=n.artist_id AND s.twilio_account_id=n.twilio_account_id AND s.service_sid=n.twilio_messaging_service_sid WHERE n.organization_id=o.organization_id AND n.artist_id=o.artist_id AND n.twilio_account_id=o.twilio_account_id AND n.is_primary=true) AS associated_count
    FROM twilio_provision_operations o WHERE o.organization_id=$1 ORDER BY o.created_at,o.id`, [organizationId]);
  return result.rows.map(row => ({ id:row.id, artistId:row.artist_id, accountId:row.twilio_account_id, step:row.step, status:row.status, createdAt:row.created_at, completedAt:row.completed_at, decision:recoveryDecision(row), providerVerified:false, automaticRetryAllowed:false }));
}
