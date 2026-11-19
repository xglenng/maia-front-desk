import {getStripe} from '@/packages/integrations/payments';
export async function readStudioBanking(account:{stripeAccountId:string;livemode:boolean;payoutsEnabled:boolean},stripe=getStripe()){
 const options={stripeAccount:account.stripeAccountId};
 const [balance,payouts]=await Promise.all([stripe.balance.retrieve(options),stripe.payouts.list({limit:10},options)]);
 if(balance.livemode!==account.livemode||payouts.data.some(payout=>payout.livemode!==account.livemode))throw Error('Payment mode could not be verified.');
 let payoutSettings = null;
 try {
  const connected = await stripe.accounts.retrieve(account.stripeAccountId);
  const schedule = connected.settings?.payouts?.schedule;
  payoutSettings = {
   schedule: schedule ? { interval: schedule.interval, weeklyAnchor: schedule.weekly_anchor, monthlyAnchor: schedule.monthly_anchor } : null,
   destinations: connected.external_accounts ? connected.external_accounts.data.map(destination => ({
    name: destination.object === 'bank_account' ? destination.bank_name : destination.brand,
    last4: destination.last4,
    currency: destination.currency,
    defaultForCurrency: destination.default_for_currency === true,
   })) : null,
  };
 } catch {
  // Account settings permissions can differ from balance read permissions.
 }
 return {payoutSettings,connected:true,testMode:!account.livemode,payoutsEnabled:account.payoutsEnabled,available:balance.available.map(({amount,currency})=>({amount,currency})),pending:balance.pending.map(({amount,currency})=>({amount,currency})),payouts:payouts.data.map(({id,amount,currency,status,arrival_date})=>({id,amount,currency,status,arrivalDate:arrival_date}))};
}
