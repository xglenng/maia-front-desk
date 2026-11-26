import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('public/invoice-payment.js','utf8');
class Element {
 textContent='';hidden=false;disabled=true;className='';dataset={token:'synthetic-token'};children:Element[]=[];handlers:Record<string,(event:{preventDefault:()=>void})=>Promise<void>>={};
 append(...children:Element[]){this.children.push(...children);}
 replaceChildren(){this.children=[];}
 setAttribute(){}
 addEventListener(name:string,handler:(event:{preventDefault:()=>void})=>Promise<void>){this.handlers[name]=handler;}
}
const open={state:'OPEN',amountRemaining:2500,totalCents:2500,lines:[{name:'<script>untrusted</script>',quantity:1,unitCents:2500}],testMode:true,publishableKey:'pk_test_synthetic',stripeAccountId:'acct_synthetic',clientSecret:'pi_synthetic_secret_synthetic'};
async function render(options:{initial?:object;verified?:object;confirmError?:string;loadError?:boolean}={}){
 const nodes=Object.fromEntries(['invoice-payment','payment-status','pay-invoice','payment-form','invoice-summary'].map(id=>[id,new Element()]));
 const calls:{requests:unknown[];confirm:unknown[];stripe:unknown[]}={requests:[],confirm:[],stripe:[]};let reads=0,destroyed=false,historyCleared=false;
 const element={mount:(selector:string)=>assert.equal(selector,'#stripe-payment-element'),on:(name:string,callback:()=>void)=>{if(name==='ready')callback();},destroy:()=>{destroyed=true;}};
 const elements={create:()=>element};
 await vm.runInNewContext(source,{document:{getElementById:(id:string)=>nodes[id],createElement:()=>new Element()},window:{Stripe:(...args:unknown[])=>{calls.stripe.push(args);return {elements:()=>elements,confirmPayment:async(params:unknown)=>{calls.confirm.push(params);return options.confirmError?{error:{message:options.confirmError}}:{};}};}},location:{origin:'https://app.example.test',pathname:'/pay/invoice/synthetic-token',search:'?payment_intent_client_secret=sensitive'},history:{replaceState:()=>{historyCleared=true;}},fetch:async(_url:string,init:{body:string})=>{calls.requests.push(JSON.parse(init.body));reads++;return {ok:!options.loadError,json:async()=>options.loadError?{error:'Unable to load.'}:reads===1?(options.initial||open):(options.verified||{...open,state:'PAID'})};},Intl,Date,Error});
 return {nodes,calls,submit:()=>nodes['payment-form'].handlers.submit({preventDefault(){}}),destroyed:()=>destroyed,historyCleared:()=>historyCleared};
}
test('embedded browser flow confirms the existing intent then waits for server invoice verification',async()=>{
 const view=await render();assert.equal(view.historyCleared(),true);assert.equal(view.nodes['pay-invoice'].disabled,false);
 assert.deepEqual(JSON.parse(JSON.stringify(view.calls.stripe[0])),['pk_test_synthetic',{stripeAccount:'acct_synthetic'}]);
 await view.submit();assert.equal(view.calls.confirm.length,1);const confirm=view.calls.confirm[0] as {redirect:string;confirmParams:{return_url:string}};
 assert.equal(confirm.redirect,'if_required');assert.equal(confirm.confirmParams.return_url,'https://app.example.test/pay/invoice/synthetic-token');
 assert.equal(view.nodes['payment-form'].hidden,true);assert.match(view.nodes['payment-status'].textContent,/invoice is paid/);assert.equal(view.destroyed(),true);
 assert.equal(view.calls.requests.length,2);assert.equal(JSON.stringify(view.calls.requests).includes('secret'),false);
});
test('failed, pending and already-paid invoices cannot produce false payment success',async()=>{
 const declined=await render({confirmError:'Card declined.'});await declined.submit();assert.match(declined.nodes['payment-status'].textContent,/declined/);assert.equal(declined.nodes['pay-invoice'].disabled,false);
 const pending=await render({verified:open});await pending.submit();assert.match(pending.nodes['payment-status'].textContent,/waiting for confirmation/);assert.equal(pending.nodes['pay-invoice'].disabled,true);await pending.submit();assert.equal(pending.calls.confirm.length,1);
 const paid=await render({initial:{...open,state:'PAID'}});assert.equal(paid.calls.stripe.length,0);assert.equal(paid.nodes['payment-form'].hidden,true);
 const unavailable=await render({loadError:true});assert.equal(unavailable.nodes['payment-form'].hidden,true);assert.equal(unavailable.calls.stripe.length,0);
});
