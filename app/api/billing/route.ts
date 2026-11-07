import { NextRequest, NextResponse } from 'next/server';
import { identity, protectedRoute } from '@/packages/auth/server';
import { pool } from '@/packages/db/src';
import { getStripe } from '@/packages/integrations/payments';

const headers = { 'Cache-Control': 'private, no-store' };

async function startTrial(request: NextRequest) {
  const user = (await identity(request))!;
  const priceId = process.env.MAIA_STRIPE_TRIAL_TEST_PRICE_ID;
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!priceId || !origin || !/^(sk|rk)_test_/.test(key)) {
    return NextResponse.json({ error: 'Trial checkout is unavailable.' }, { status: 503, headers });
  }

  const stripe = getStripe();
  const price = await stripe.prices.retrieve(priceId);
  if (price.livemode || !price.active || price.currency !== 'usd' ||
      price.unit_amount !== 6900 || price.recurring?.interval !== 'month' ||
      price.recurring.interval_count !== 1 || price.recurring.usage_type !== 'licensed') {
    return NextResponse.json({ error: 'Trial pricing is unavailable.' }, { status: 503, headers });
  }

  const lock = await pool.connect();
  const lockKey = `maia-trial:${user.organization_id}`;
  try {
    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [lockKey]);
    const customers = await stripe.customers.search({
      query: `metadata['maiaBillingStudio']:'${user.organization_id}'`,
      limit: 2,
    });
    if (customers.data.length > 1) throw Error('Multiple billing customers');
    const customer = customers.data[0] ?? await stripe.customers.create({
      metadata: { maiaBillingStudio: user.organization_id },
    }, { idempotencyKey: lockKey });
    const returnUrl = new URL('/settings/payments', origin).href;

    const subscriptions = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 1 });
    if (subscriptions.data.length) {
      const portal = await stripe.billingPortal.sessions.create({ customer: customer.id, return_url: returnUrl });
      return NextResponse.json({ url: portal.url }, { headers });
    }
    const sessions = await stripe.checkout.sessions.list({ customer: customer.id, limit: 1 });
    const existing = sessions.data.find(session => session.mode === 'subscription' && session.metadata?.maiaBillingStudio === user.organization_id);
    if (existing?.status === 'complete') throw Error('Trial checkout is still syncing');
    if (existing?.status === 'open' && existing.url) return NextResponse.json({ url: existing.url }, { headers });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { maiaBillingStudio: user.organization_id },
      subscription_data: { trial_period_days: 30, metadata: { maiaBillingStudio: user.organization_id } },
      success_url: returnUrl,
      cancel_url: returnUrl,
    }, { idempotencyKey: `${lockKey}:checkout:${existing?.id ?? 'first'}` });
    if (!session.url) throw Error('Missing trial checkout URL');
    return NextResponse.json({ url: session.url }, { headers });
  } finally {
    try {
      await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [lockKey]);
      lock.release();
    } catch {
      lock.release(true);
    }
  }
}

export const GET = protectedRoute(async () => NextResponse.json({
  enabled: Boolean(process.env.MAIA_STRIPE_TRIAL_TEST_PRICE_ID && process.env.NEXT_PUBLIC_APP_URL &&
    /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? '')),
}, { headers }), true);

export const POST = protectedRoute(startTrial, true);
