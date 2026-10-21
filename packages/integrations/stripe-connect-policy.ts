export function assertConnectTestMode(env:Record<string,string|undefined>){
 if(env.MAIA_STRIPE_CONNECT_ENABLED!=='true'||!env.STRIPE_SECRET_KEY?.startsWith('sk_test_'))throw new Error('Studio payments are not enabled for testing.');
}
export function stripeAccountReady(account:{charges_enabled:boolean;payouts_enabled:boolean;details_submitted?:boolean}){
 return account.charges_enabled&&account.payouts_enabled&&account.details_submitted===true;
}
export function paymentMatchesSession(payment:{amountCents:number;currency:string},session:{payment_status:string;amount_total:number|null;currency:string|null}){
 return session.payment_status==='paid'&&session.amount_total===payment.amountCents&&session.currency?.toLowerCase()===payment.currency.toLowerCase();
}
