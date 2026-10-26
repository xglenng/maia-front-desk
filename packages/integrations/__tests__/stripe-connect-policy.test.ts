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

test('live onboarding works while live charging stays disabled',async()=>{
 const {studioOnboardingMode,canReplaceSandboxAccount}=await import('../stripe-connect-policy');
 const {cardMode}=await import('../../checkout/card-policy');
 const env={MAIA_COUNTER_CARD_ENABLED:'true',STRIPE_SECRET_KEY:'sk_live_fake',NEXT_PUBLIC_APP_URL:'https://maia.example',MAIA_COUNTER_CARD_LIVE:'false'};
 assert.equal(studioOnboardingMode(env),true);assert.throws(()=>cardMode(env));
 assert.equal(canReplaceSandboxAccount(false,true,env),true);
 assert.equal(canReplaceSandboxAccount(true,false,env),false);
 assert.equal(canReplaceSandboxAccount(true,true,env),false);
 assert.equal(canReplaceSandboxAccount(false,true,{...env,MAIA_COUNTER_CARD_LIVE:'true'}),false);
 assert.throws(()=>studioOnboardingMode({...env,NEXT_PUBLIC_APP_URL:'http://localhost'}));
 assert.throws(()=>studioOnboardingMode({...env,STRIPE_SECRET_KEY:''}));
});
test('onboarding diagnostics name settings without disclosing their values',async()=>{
 const {studioOnboardingMode}=await import('../stripe-connect-policy');
 const cases=[
  [{},'MAIA_COUNTER_CARD_ENABLED'],
  [{MAIA_COUNTER_CARD_ENABLED:'true',STRIPE_SECRET_KEY:'private-wrong-value'},'STRIPE_SECRET_KEY'],
  [{MAIA_COUNTER_CARD_ENABLED:'true',STRIPE_SECRET_KEY:'sk_live_private',NEXT_PUBLIC_APP_URL:'private-invalid-url'},'NEXT_PUBLIC_APP_URL'],
 ] as const;
 for(const [env,setting] of cases){
  assert.throws(()=>studioOnboardingMode(env),error=>{
   assert.ok(error instanceof Error);assert.match(error.message,new RegExp(setting));assert.doesNotMatch(error.message,/private/);return true;
  });
 }
});
