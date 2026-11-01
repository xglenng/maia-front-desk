import {getStripe} from '@/packages/integrations/payments';
export async function readStudioBanking(account:{stripeAccountId:string;livemode:boolean;payoutsEnabled:boolean},stripe=getStripe()){
 const options={stripeAccount:account.stripeAccountId};
 const [balance,payouts]=await Promise.all([stripe.balance.retrieve(options),stripe.payouts.list({limit:10},options)]);
 if(balance.livemode!==account.livemode||payouts.data.some(payout=>payout.livemode!==account.livemode))throw Error('Payment mode could not be verified.');
 return {connected:true,testMode:!account.livemode,payoutsEnabled:account.payoutsEnabled,available:balance.available.map(({amount,currency})=>({amount,currency})),pending:balance.pending.map(({amount,currency})=>({amount,currency})),payouts:payouts.data.map(({id,amount,currency,status,arrival_date})=>({id,amount,currency,status,arrivalDate:arrival_date}))};
}
