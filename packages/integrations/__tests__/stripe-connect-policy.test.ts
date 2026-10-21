import test from 'node:test';
import assert from 'node:assert/strict';
import {assertConnectTestMode,paymentMatchesSession,stripeAccountReady} from '../stripe-connect-policy';
test('studio payments reject live keys and disabled test mode',()=>{
 for(const env of [{},{MAIA_STRIPE_CONNECT_ENABLED:'true',STRIPE_SECRET_KEY:'sk_live_fake'},{STRIPE_SECRET_KEY:'sk_test_fake'}])assert.throws(()=>assertConnectTestMode(env));
 assert.doesNotThrow(()=>assertConnectTestMode({MAIA_STRIPE_CONNECT_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_fake'}));
});
test('studio account must be fully enabled before checkout',()=>{
 assert.equal(stripeAccountReady({charges_enabled:true,payouts_enabled:true,details_submitted:true}),true);
 assert.equal(stripeAccountReady({charges_enabled:true,payouts_enabled:false,details_submitted:true}),false);
 assert.equal(stripeAccountReady({charges_enabled:true,payouts_enabled:true}),false);
});
test('only verified full matching amounts are accepted',()=>{
 const p={amountCents:6250,currency:'usd'},s={payment_status:'paid',amount_total:6250,currency:'usd'};
 assert.equal(paymentMatchesSession(p,s),true);
 for(const change of [{payment_status:'unpaid'},{amount_total:62},{currency:'eur'},{amount_total:null}])assert.equal(paymentMatchesSession(p,{...s,...change}),false);
});
