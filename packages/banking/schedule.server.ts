import {createHash} from 'node:crypto';
import {z} from 'zod';
import type Stripe from 'stripe';

const weekday=z.enum(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']);
export const payoutScheduleSchema=z.discriminatedUnion('interval',[
 z.object({interval:z.literal('daily')}).strict(),
 z.object({interval:z.literal('weekly'),weeklyDays:z.array(weekday).min(1).max(7)}).strict(),
 z.object({interval:z.literal('monthly'),monthlyDays:z.array(z.number().int().min(1).max(31)).min(1).max(31)}).strict(),
]);
export type PayoutSchedule=z.infer<typeof payoutScheduleSchema>;
export type StoredPayoutSchedule={interval:string;weeklyDays?:string[];monthlyDays?:number[]};
export class PayoutScheduleError extends Error{constructor(message:string,readonly status=409){super(message);}}
const version='2026-09-30.endive';
export function normalizeSchedule(value:any):StoredPayoutSchedule{
 if(!value||!['daily','weekly','monthly','manual'].includes(value.interval))throw new PayoutScheduleError('Stripe did not return a usable payout schedule.',502);
 return {interval:value.interval,...(value.interval==='weekly'?{weeklyDays:[...new Set<string>(value.weekly_payout_days||[])].sort()}:{}),...(value.interval==='monthly'?{monthlyDays:[...new Set<number>(value.monthly_payout_days||[])].sort((a,b)=>a-b)}:{})};
}
export async function readPayoutControl(account:{stripeAccountId:string;livemode:boolean},stripe:Stripe){
 const connected=await stripe.accounts.retrieve(account.stripeAccountId);
 if(connected.id!==account.stripeAccountId||connected.controller?.is_controller!==true)return {canEdit:false,schedule:null,reason:'Manage your payout schedule in Stripe. This account has not granted Maia payout control.'};
 const balance=await stripe.balance.retrieve({stripeAccount:account.stripeAccountId});
 if(balance.livemode!==account.livemode)throw new PayoutScheduleError('Payment mode changed. Refresh your Stripe connection.',409);
 const settings=await stripe.rawRequest('GET','/v1/balance_settings',undefined,{stripeAccount:account.stripeAccountId,apiVersion:version,timeout:10000});
 return {canEdit:true,schedule:normalizeSchedule((settings as any).payments?.payouts?.schedule),reason:null};
}
export async function updatePayoutSchedule(account:{stripeAccountId:string;livemode:boolean},input:{schedule:PayoutSchedule;expectedSchedule:StoredPayoutSchedule;requestId:string},stripe:Stripe){
 const schedule=payoutScheduleSchema.parse(input.schedule);
 const control=await readPayoutControl(account,stripe);
 if(!control.canEdit)throw new PayoutScheduleError(control.reason!,403);
 const canonical=(s:StoredPayoutSchedule)=>normalizeSchedule({interval:s.interval,weekly_payout_days:s.weeklyDays,monthly_payout_days:s.monthlyDays});
 if(JSON.stringify(control.schedule)!==JSON.stringify(canonical(input.expectedSchedule)))throw new PayoutScheduleError('The payout schedule changed. Refresh banking before saving again.');
 const normalized=canonical(schedule);
 const payoutSchedule={interval:normalized.interval,...(normalized.interval==='weekly'?{weekly_payout_days:normalized.weeklyDays}:{}),...(normalized.interval==='monthly'?{monthly_payout_days:normalized.monthlyDays}:{})};
 const key=createHash('sha256').update(JSON.stringify([account.stripeAccountId,input.requestId,normalized])).digest('hex');
 const result=await stripe.rawRequest('POST','/v1/balance_settings',{payments:{payouts:{schedule:payoutSchedule}}},{stripeAccount:account.stripeAccountId,apiVersion:version,timeout:10000,idempotencyKey:`maia-payout-schedule:${key}`});
 const actual=normalizeSchedule((result as any).payments?.payouts?.schedule);
 if(JSON.stringify(actual)!==JSON.stringify(normalized))throw new PayoutScheduleError('Stripe returned a different schedule. Refresh banking to see the current settings.',502);
 return actual;
}
