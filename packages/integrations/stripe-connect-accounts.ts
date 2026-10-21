import type Stripe from 'stripe';
// Keep the existing SDK for payments; rawRequest supports the v2 JSON protocol
// without changing API versions for established Square/legacy Stripe flows.
export const CONNECT_ACCOUNT_API_VERSION='2026-09-30.endive';
export async function createStudioStripeAccount(stripe:Stripe,organizationId:string,name:string){
 const value=await stripe.rawRequest('POST','/v2/core/accounts',{
  display_name:name,metadata:{organizationId},dashboard:'full',
  identity:{country:'us'},
  configuration:{merchant:{capabilities:{card_payments:{requested:true}}}},
  defaults:{responsibilities:{fees_collector:'stripe',losses_collector:'stripe'}},
 },{apiVersion:CONNECT_ACCOUNT_API_VERSION,idempotencyKey:`studio-connect-v2:${organizationId}`});
 const account=value as unknown as {id?:string;livemode?:boolean};
 if(!account.id?.startsWith('acct_')||account.livemode!==false)throw new Error('Invalid Stripe sandbox account response.');
 return {id:account.id};
}
export async function createStudioOnboardingLink(stripe:Stripe,accountId:string,appUrl:string){
 const value=await stripe.rawRequest('POST','/v2/core/account_links',{
  account:accountId,use_case:{type:'account_onboarding',account_onboarding:{
   refresh_url:`${appUrl}/settings/payments?refresh=1`,return_url:`${appUrl}/settings/payments?returned=1`,
  }},
 },{apiVersion:CONNECT_ACCOUNT_API_VERSION});
 const link=value as unknown as {url?:string;livemode?:boolean};
 if(!link.url||link.livemode!==false||new URL(link.url).protocol!=='https:'||!['accounts.stripe.com','connect.stripe.com'].includes(new URL(link.url).hostname))throw new Error('Invalid Stripe sandbox onboarding response.');
 return {url:link.url};
}
