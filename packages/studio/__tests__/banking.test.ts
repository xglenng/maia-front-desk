import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readStudioBanking} from '../../banking/read.server';
test('banking reads only the resolved account, omits bank details and rejects mode mismatch or failures',async()=>{
 const calls:unknown[]=[],account={stripeAccountId:'acct_synthetic',livemode:false,payoutsEnabled:true};
 const payout={id:'po_synthetic',amount:1500,currency:'usd',status:'pending',arrival_date:123,livemode:false,destination:'bank_private'};
 const provider:any={balance:{retrieve:async(options:unknown)=>{calls.push(options);return {livemode:false,available:[{amount:2500,currency:'usd',source_types:{card:2500}}],pending:[]};}},payouts:{list:async(body:unknown,options:unknown)=>{calls.push(body,options);return {data:[payout]};}}};
 const result=await readStudioBanking(account,provider);
 assert.deepEqual(calls,[{stripeAccount:'acct_synthetic'},{limit:10},{stripeAccount:'acct_synthetic'}]);
 assert.deepEqual(result.available,[{amount:2500,currency:'usd'}]);
 assert.equal(JSON.stringify(result).includes('bank_private'),false);
 assert.equal(result.testMode,true);
 payout.livemode=true;await assert.rejects(readStudioBanking(account,provider),/mode/);
 provider.balance.retrieve=async()=>{throw Error('unavailable');};await assert.rejects(readStudioBanking(account,provider),/unavailable/);
});
