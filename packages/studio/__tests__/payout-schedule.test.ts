import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSchedule,payoutScheduleSchema,readPayoutControl,updatePayoutSchedule} from '../../banking/schedule.server';
const account={stripeAccountId:'acct_studio',livemode:false};
function fixture(){
 let schedule:any={interval:'daily'};
 const calls:Array<{method:string;path:string;body:any;options:any}>=[];
 const stripe:any={accounts:{retrieve:async(id:string)=>({id,controller:{is_controller:true}})},balance:{retrieve:async(opts:any)=>{assert.equal(opts.stripeAccount,account.stripeAccountId);return {livemode:false};}},rawRequest:async(method:string,path:string,body:any,options:any)=>{calls.push({method,path,body,options});if(method==='POST')schedule=body.payments.payouts.schedule;return {payments:{payouts:{schedule}}};}};
 return {stripe,calls,setSchedule:(value:any)=>{schedule=value;}};
}
test('payout schedules validate automatic intervals and reject destinations, manual payouts and invalid dates',()=>{
 assert.equal(payoutScheduleSchema.safeParse({interval:'manual'}).success,false);
 assert.equal(payoutScheduleSchema.safeParse({interval:'weekly',weeklyDays:[]}).success,false);
 assert.equal(payoutScheduleSchema.safeParse({interval:'weekly',weeklyDays:['holiday']}).success,false);
 assert.equal(payoutScheduleSchema.safeParse({interval:'monthly',monthlyDays:[32]}).success,false);
 assert.equal(payoutScheduleSchema.safeParse({interval:'daily',destination:'ba_other'}).success,false);
 assert.deepEqual(normalizeSchedule({interval:'weekly',weekly_payout_days:['friday','monday','friday']}),{interval:'weekly',weeklyDays:['friday','monday']});
});
test('schedule updates target only the server-resolved account, preserve unrelated settings and use retry keys',async()=>{
 const {stripe,calls}=fixture();const input={schedule:{interval:'weekly' as const,weeklyDays:['friday' as const]},expectedSchedule:{interval:'daily'},requestId:'synthetic-request'};
 assert.deepEqual(await updatePayoutSchedule(account,input,stripe),{interval:'weekly',weeklyDays:['friday']});
 const update=calls.find(c=>c.method==='POST')!;
 assert.equal(update.path,'/v1/balance_settings');assert.equal(update.options.stripeAccount,'acct_studio');assert.match(update.options.idempotencyKey,/^maia-payout-schedule:/);
 assert.deepEqual(update.body,{payments:{payouts:{schedule:{interval:'weekly',weekly_payout_days:['friday']}}}});
 const second=fixture();await updatePayoutSchedule(account,input,second.stripe);assert.equal(second.calls.find(c=>c.method==='POST')!.options.idempotencyKey,update.options.idempotencyKey);
});
test('unknown platform control and mode mismatch never send a write',async()=>{
 for(const mode of ['denied','wrong-account','wrong-mode']){
  const {stripe,calls}=fixture();
  if(mode==='denied')stripe.accounts.retrieve=async()=>({id:account.stripeAccountId,controller:{is_controller:false}});
  if(mode==='wrong-account')stripe.accounts.retrieve=async()=>({id:'acct_other',controller:{is_controller:true}});
  if(mode==='wrong-mode')stripe.balance.retrieve=async()=>({livemode:true});
  await assert.rejects(updatePayoutSchedule(account,{schedule:{interval:'daily'},expectedSchedule:{interval:'daily'},requestId:'synthetic'},stripe));
  assert.equal(calls.filter(c=>c.method==='POST').length,0);
 }
});
test('stale schedules and provider failures do not report success',async()=>{
 const {stripe,calls,setSchedule}=fixture();setSchedule({interval:'monthly',monthly_payout_days:[1,15]});
 assert.deepEqual((await readPayoutControl(account,stripe)).schedule,{interval:'monthly',monthlyDays:[1,15]});
 await assert.rejects(updatePayoutSchedule(account,{schedule:{interval:'daily'},expectedSchedule:{interval:'daily'},requestId:'synthetic'},stripe),/changed/);
 assert.equal(calls.filter(c=>c.method==='POST').length,0);
 stripe.rawRequest=async()=>{throw Error('provider unavailable');};
 await assert.rejects(readPayoutControl(account,stripe),/provider unavailable/);
});
test('monthly and daily changes serialize only their applicable anchors',async()=>{
 const {stripe,calls}=fixture();
 await updatePayoutSchedule(account,{schedule:{interval:'monthly',monthlyDays:[31]},expectedSchedule:{interval:'daily'},requestId:'month'},stripe);
 await updatePayoutSchedule(account,{schedule:{interval:'daily'},expectedSchedule:{interval:'monthly',monthlyDays:[31]},requestId:'day'},stripe);
 assert.deepEqual(calls.filter(c=>c.method==='POST').map(c=>c.body.payments.payouts.schedule),[{interval:'monthly',monthly_payout_days:[31]},{interval:'daily'}]);
});
