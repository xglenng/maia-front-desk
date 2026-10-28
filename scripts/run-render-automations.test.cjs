const test=require('node:test');const assert=require('node:assert/strict');const {run}=require('./run-render-automations.cjs');
test('cron posts once to the fixed deployment and returns aggregate status only',async()=>{
 let calls=0;
 const result=await run({env:{AUTOMATION_CRON_SECRET:'synthetic-only'},fetchImpl:async(url,options)=>{
  calls++;assert.equal(url,'https://maia-production-preview.onrender.com/api/automations/run');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.headers.authorization,'Bearer synthetic-only');
  return {ok:true,json:async()=>({processed:2,results:[{id:'private-id',status:'COMPLETED'},{status:'CANCELLED'}]})};
 }});
 assert.equal(calls,1);assert.deepEqual(result,{processed:2,statuses:{COMPLETED:1,CANCELLED:1}});
});
test('cron fails closed without a secret or on unsuccessful/invalid responses',async()=>{
 await assert.rejects(run({env:{},fetchImpl:()=>{throw Error('Must not call')}}),/required/);
 await assert.rejects(run({env:{AUTOMATION_CRON_SECRET:'synthetic-only'},fetchImpl:async()=>({ok:false,status:401})}),/HTTP 401/);
 await assert.rejects(run({env:{AUTOMATION_CRON_SECRET:'synthetic-only'},fetchImpl:async()=>({ok:true,json:async()=>({})})}),/Invalid automation response/);
});
