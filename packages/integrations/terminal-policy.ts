import {assertConnectTestMode} from './stripe-connect-policy';
export function assertTerminalTestMode(env:Record<string,string|undefined>){
 assertConnectTestMode(env);
 if(env.MAIA_STRIPE_TERMINAL_ENABLED!=='true')throw Error('Tap to Pay testing is disabled.');
}
export function terminalIntentMatches(payment:{amountCents:number;currency:string;id:string;organizationId:string;appointmentId:string},intent:{livemode:boolean;status:string;amount:number;amount_received:number;currency:string;payment_method_types:string[];metadata:Record<string,string>}){
 return !intent.livemode&&intent.status==='succeeded'&&intent.amount===payment.amountCents&&intent.amount_received===payment.amountCents&&intent.currency===payment.currency&&intent.payment_method_types.length===1&&intent.payment_method_types[0]==='card_present'&&intent.metadata.paymentId===payment.id&&intent.metadata.organizationId===payment.organizationId&&intent.metadata.appointmentId===payment.appointmentId&&intent.metadata.flow==='TERMINAL_BALANCE';
}
