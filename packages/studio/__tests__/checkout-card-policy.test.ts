import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import {cardMode,cardSessionMatches} from '../../checkout/card-policy';
test('counter card checkout requires explicit enablement and separate live authorization',()=>{
 assert.throws(()=>cardMode({STRIPE_SECRET_KEY:'sk_live_example'}));
 assert.equal(cardMode({MAIA_COUNTER_CARD_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_example'}),false);
 assert.throws(()=>cardMode({MAIA_COUNTER_CARD_ENABLED:'true',STRIPE_SECRET_KEY:'sk_live_example'}));
 assert.equal(cardMode({MAIA_COUNTER_CARD_ENABLED:'true',MAIA_COUNTER_CARD_LIVE:'true',STRIPE_SECRET_KEY:'sk_live_example'}),true);
});
test('card reconciliation binds provider session, account, organization, amount, currency and mode',()=>{
 const attempt={id:'attempt',organizationId:'org',stripeAccountId:'acct_recipient',totalCents:1200,livemode:false,sessionId:'cs_saved'};
 const session={id:'cs_saved',metadata:{checkoutAttemptId:'attempt',organizationId:'org'},mode:'payment',livemode:false,currency:'usd',amount_total:1200} as unknown as Stripe.Checkout.Session;
 assert.equal(cardSessionMatches(attempt,session,'acct_recipient'),true);
 for(const change of [{id:'cs_other'},{livemode:true},{currency:'eur'},{amount_total:1},{metadata:{checkoutAttemptId:'other',organizationId:'org'}}])assert.equal(cardSessionMatches(attempt,{...session,...change} as Stripe.Checkout.Session,'acct_recipient'),false);
 assert.equal(cardSessionMatches(attempt,session,'acct_foreign'),false);
});
