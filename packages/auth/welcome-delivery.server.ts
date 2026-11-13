import 'server-only';
import { pool } from '@db';
import { getStripe } from '@/packages/integrations/payments';
import { welcomeEmail, type WelcomeTrial } from './welcome-email';
import type Stripe from 'stripe';

type WelcomeJob = { organization_id: string; owner_id: string; lock_token: string; attempt_count: number; first_send_at: Date | null; email_payload: unknown };
type Payload = { from: string; to: string[]; subject: string; html: string; text: string };

export async function trialForStudio(organizationId: string, stripeClient?: Stripe): Promise<WelcomeTrial | null> {
  if (!process.env.MAIA_STRIPE_TRIAL_TEST_PRICE_ID || !/^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY || '')) return null;
  const stripe = stripeClient ?? getStripe();
  const customers = await stripe.customers.search({ query: `metadata['maiaBillingStudio']:'${organizationId}'`, limit: 2 });
  if (customers.data.length > 1) throw new Error('AMBIGUOUS_BILLING_ACCOUNT');
  if (!customers.data.length) return null;
  const subscriptions = await stripe.subscriptions.list({ customer: customers.data[0].id, status: 'trialing', limit: 2, expand: ['data.items.data.price.product'] });
  if (subscriptions.data.length > 1 || subscriptions.has_more) throw new Error('AMBIGUOUS_TRIAL');
  const subscription = subscriptions.data[0];
  if (!subscription?.trial_end || subscription.trial_end * 1000 <= Date.now()) return null;
  if (subscription.items.data.length !== 1 || subscription.items.has_more) throw new Error('AMBIGUOUS_TRIAL_PLAN');
  const product = subscription.items.data[0]?.price.product;
  if (!product || typeof product === 'string' || product.deleted || !product.name) throw new Error('TRIAL_PLAN_UNAVAILABLE');
  return { planName: product.name, endsAt: new Date(subscription.trial_end * 1000) };
}

function isPayload(value: unknown): value is Payload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.from === 'string' && Array.isArray(payload.to) && payload.to.length === 1 && typeof payload.to[0] === 'string' && typeof payload.subject === 'string' && typeof payload.html === 'string' && typeof payload.text === 'string';
}

async function finish(job: WelcomeJob, status: 'RETRY' | 'SENT' | 'FAILED' | 'DELIVERY_UNKNOWN', code: string | null) {
  await pool.query(`UPDATE owner_welcome_emails SET status=$3, last_error_code=$4,
    sent_at=CASE WHEN $3='SENT' THEN now() ELSE sent_at END,
    run_at=CASE WHEN $3='RETRY' THEN now() + interval '15 minutes' ELSE run_at END,
    lock_token=NULL, lock_expires_at=NULL, updated_at=now()
    WHERE organization_id=$1 AND lock_token=$2 AND status='PROCESSING'`, [job.organization_id, job.lock_token, status, code]);
  return { status, code };
}

async function deliver(job: WelcomeJob) {
  try {
    if (job.first_send_at && Date.now() - job.first_send_at.getTime() >= 23 * 60 * 60 * 1000) return finish(job, 'DELIVERY_UNKNOWN', 'IDEMPOTENCY_WINDOW_EXPIRED');
    let payload: Payload;
    if (job.email_payload) {
      if (!isPayload(job.email_payload)) return finish(job, 'FAILED', 'INVALID_PAYLOAD');
      payload = job.email_payload;
    } else {
      const { rows } = await pool.query(`SELECT u.email,u.name AS owner_name,o.name AS studio_name FROM users u
        JOIN organizations o ON o.id=u.organization_id JOIN auth_credentials c ON c.user_id=u.id
        WHERE u.id=$1 AND u.organization_id=$2 AND u.role='OWNER' AND c.active=true`, [job.owner_id, job.organization_id]);
      if (!rows[0]) return finish(job, 'FAILED', 'OWNER_NOT_AVAILABLE');
      const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || '');
      if (origin.protocol !== 'https:' || origin.username || origin.password || !process.env.RESEND_API_KEY || !process.env.AUTH_EMAIL_FROM || process.env.MAIA_STAGING_ISOLATED === '1') return finish(job, 'RETRY', 'EMAIL_NOT_CONFIGURED');
      const trial = await trialForStudio(job.organization_id);
      const email = welcomeEmail({ ownerName: rows[0].owner_name, studioName: rows[0].studio_name, origin: origin.origin, trial });
      payload = { from: process.env.AUTH_EMAIL_FROM, to: [rows[0].email], ...email };
      const saved = await pool.query(`UPDATE owner_welcome_emails SET email_payload=$3::jsonb,first_send_at=now(),updated_at=now()
        WHERE organization_id=$1 AND lock_token=$2 AND status='PROCESSING' RETURNING organization_id`, [job.organization_id, job.lock_token, JSON.stringify(payload)]);
      if (!saved.rowCount) return { status: 'LEASE_LOST', code: 'LEASE_LOST' };
    }
    if (!process.env.RESEND_API_KEY || process.env.MAIA_STAGING_ISOLATED === '1') return finish(job, 'RETRY', 'EMAIL_NOT_CONFIGURED');
    const lease = await pool.query(`UPDATE owner_welcome_emails SET lock_expires_at=now()+interval '5 minutes',updated_at=now()
      WHERE organization_id=$1 AND lock_token=$2 AND status='PROCESSING' AND lock_expires_at>now() RETURNING organization_id`, [job.organization_id, job.lock_token]);
    if (!lease.rowCount) return { status: 'LEASE_LOST', code: 'LEASE_LOST' };
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `studio-welcome/${job.organization_id}` },
      body: JSON.stringify({ from: payload.from, to: payload.to, subject: payload.subject, html: payload.html, text: payload.text }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return finish(job, 'SENT', null);
    if (response.status === 409 || response.status === 429 || response.status >= 500) return finish(job, 'RETRY', 'PROVIDER_TEMPORARY_FAILURE');
    return finish(job, 'FAILED', 'PROVIDER_REJECTED');
  } catch (error) {
    console.error('Welcome email delivery failed', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    return finish(job, 'RETRY', 'DELIVERY_OR_CONFIGURATION_ERROR');
  }
}

export async function processWelcomeEmails() {
  const { rows } = await pool.query<WelcomeJob>(`WITH due AS (
    SELECT organization_id FROM owner_welcome_emails
    WHERE (status IN ('PENDING','RETRY') AND run_at<=now()) OR (status='PROCESSING' AND lock_expires_at<=now())
    ORDER BY run_at,organization_id FOR UPDATE SKIP LOCKED LIMIT 10
  ) UPDATE owner_welcome_emails j SET status='PROCESSING',attempt_count=j.attempt_count+1,
    lock_token=gen_random_uuid(),lock_expires_at=now()+interval '5 minutes',updated_at=now()
    FROM due WHERE j.organization_id=due.organization_id
    RETURNING j.organization_id,j.owner_id,j.lock_token,j.attempt_count,j.first_send_at,j.email_payload`);
  return Promise.all(rows.map(deliver));
}
