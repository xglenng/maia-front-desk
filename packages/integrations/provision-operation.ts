import { pool } from '@db';
export class ProvisionReconciliationRequired extends Error {}
/** A committed intent precedes each remote write. Unknown outcomes never auto-retry. */
export async function provisionOperation<T>(organizationId: string, artistId: string, accountId: string, step: string, work: () => Promise<T>): Promise<T> {
  const claim = await pool.query(`INSERT INTO twilio_provision_operations(organization_id,artist_id,twilio_account_id,step) VALUES($1,$2,$3,$4) ON CONFLICT (organization_id,artist_id,step) DO NOTHING RETURNING id`, [organizationId, artistId, accountId, step]);
  if (!claim.rows.length) throw new ProvisionReconciliationRequired('Existing provisioning intent requires reviewed reconciliation before retry.');
  const result = await work(); // Failure/crash deliberately retains an unresolved intent.
  await pool.query(`UPDATE twilio_provision_operations SET status='COMPLETED',completed_at=now() WHERE id=$1 AND organization_id=$2`, [claim.rows[0].id, organizationId]);
  return result;
}
