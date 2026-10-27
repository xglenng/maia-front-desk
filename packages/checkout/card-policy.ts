import type Stripe from 'stripe';

export function cardMode(env: Record<string,string|undefined>) {
  if (env.MAIA_COUNTER_CARD_ENABLED !== 'true') throw Error('Card checkout is not enabled.');
  if (/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY||'')) return false;
  if (/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY||'') && env.MAIA_COUNTER_CARD_LIVE === 'true') return true;
  throw Error('Card checkout credentials are not configured for this mode.');
}
export function cardSessionMatches(attempt:{id:string;organizationId:string;stripeAccountId:string;totalCents:number;livemode:boolean;sessionId:string|null},session:Stripe.Checkout.Session,accountId:string){
  return attempt.stripeAccountId===accountId && attempt.sessionId===session.id &&
    session.metadata?.checkoutAttemptId===attempt.id && session.metadata?.organizationId===attempt.organizationId &&
    session.mode==='payment' && session.livemode===attempt.livemode && session.currency==='usd' &&
    session.amount_total===attempt.totalCents;
}
