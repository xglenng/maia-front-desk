import test from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import {createStudioStripeAccount,createStudioOnboardingLink,CONNECT_ACCOUNT_API_VERSION} from '../stripe-connect-accounts';
test('new studio accounts use Accounts v2 with direct merchant payments and stable tenant key',async()=>{
 const stripe={rawRequest:async(method:string,path:string,body:any,options:any)=>{
  assert.equal(method,'POST');assert.equal(path,'/v2/core/accounts');assert.equal(options.apiVersion,CONNECT_ACCOUNT_API_VERSION);
  assert.equal(options.idempotencyKey,'studio-connect-v2:tenant');assert.equal(body.metadata.organizationId,'tenant');
  assert.equal(body.dashboard,'full');assert.equal(body.configuration.merchant.capabilities.card_payments.requested,true);
  assert.deepEqual(body.defaults.responsibilities,{fees_collector:'stripe',losses_collector:'stripe'});
  return{id:'acct_test',livemode:false};
 }} as unknown as Stripe;
 assert.equal((await createStudioStripeAccount(stripe,'tenant','Synthetic Studio')).id,'acct_test');
});
test('onboarding uses v2 links and trusted return URLs',async()=>{
 const stripe={rawRequest:async(_method:string,path:string,body:any)=>{
  assert.equal(path,'/v2/core/account_links');assert.equal(body.account,'acct_test');
  assert.equal(body.use_case.account_onboarding.return_url,'http://127.0.0.1:3100/settings/payments?returned=1');
  assert.equal(body.use_case.type,'account_onboarding');return{url:'https://connect.stripe.com/test',livemode:false};
 }} as unknown as Stripe;
 assert.ok((await createStudioOnboardingLink(stripe,'acct_test','http://127.0.0.1:3100')).url);
});
test('live responses and unexpected onboarding destinations are rejected',async()=>{
 const live={rawRequest:async()=>({id:'acct_live',livemode:true,url:'https://accounts.stripe.com/test'})} as unknown as Stripe;
 await assert.rejects(createStudioStripeAccount(live,'tenant','Synthetic'));
 await assert.rejects(createStudioOnboardingLink(live,'acct_live','http://localhost'));
 const foreign={rawRequest:async()=>({livemode:false,url:'https://evil.test'})} as unknown as Stripe;
 await assert.rejects(createStudioOnboardingLink(foreign,'acct_test','http://localhost'));
});
