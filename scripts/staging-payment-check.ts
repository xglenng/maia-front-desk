import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import Stripe from 'stripe';
import {NextRequest} from 'next/server';
import {pool} from '../packages/db/src';
import {studioRefund,reconcileStudioRefund} from '../packages/booking/src/studio-refund.server';
import {studioCheckout} from '../packages/booking/src/studio-checkout.server';
import {GET as paymentStatusRoute} from '../app/api/payments/connect/route';
import {POST as refundRoute} from '../app/api/payments/connect/refund/route';
import {POST as webhook} from '../app/api/payments/connect/webhook/route';
async function main(){
 assert.equal(process.env.MAIA_STAGING_ISOLATED,'1');assert.equal((await pool.query('SELECT purpose FROM maia_staging_meta.bootstrap LIMIT 1')).rows[0]?.purpose,'synthetic-testing');
 Object.assign(process.env,{MAIA_STRIPE_CONNECT_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_synthetic',STRIPE_CONNECT_WEBHOOK_SECRET:'whsec_synthetic_only'});
 const org=randomUUID(),foreign=randomUUID(),artist=randomUUID(),client=randomUUID(),service=randomUUID(),appointment=randomUUID(),other=randomUUID(),account='acct_synthetic_'+org.replaceAll('-','');
 await pool.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic Payments',$3),($2,'Synthetic Other Payments',$4)",[org,foreign,org,foreign]);
 await pool.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$2,'Synthetic Payment Artist')",[artist,org]);
 await pool.query("INSERT INTO clients(id,organization_id,first_name,sms_opt_in) VALUES($1,$2,'Synthetic Payment Client',false)",[client,org]);
 await pool.query("INSERT INTO services(id,organization_id,artist_id,service_type,pricing_type,name,duration_minutes,base_price_cents,deposit_type,deposit_percent,payment_provider) VALUES($1,$2,$3,'TATTOO','FLAT','Synthetic Service',60,20000,'PERCENT',25,'STRIPE')",[service,org,artist]);
 await pool.query("INSERT INTO availability_rules(organization_id,artist_id,day_of_week,start_minute,end_minute,active) VALUES($1,$2,1,540,1020,true)",[org,artist]);
 await pool.query("INSERT INTO studio_payment_accounts(organization_id,stripe_account_id) VALUES($1,$2)",[org,account]);
 for(const id of [appointment,other])await pool.query("INSERT INTO appointments(id,organization_id,artist_id,client_id,service_id,starts_at,ends_at,status,price_cents,deposit_cents,deposit_status,payment_provider,scheduling_provider) VALUES($1,$2,$3,$4,$5,'2035-01-08 16:00:00','2035-01-08 17:00:00','PAYMENT_PENDING',20000,5000,'PENDING','STRIPE','INTERNAL')",[id,org,artist,client,service]); // 9am Denver
 const artistUser=randomUUID(),rawToken=randomBytes(32).toString('hex'),tokenHash=createHash('sha256').update(rawToken).digest('hex');
 await pool.query("INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,$3,'Synthetic Artist','ARTIST')",[artistUser,org,artistUser+'@example.invalid']);
 await pool.query("INSERT INTO auth_credentials(user_id,password_hash,active) VALUES($1,'synthetic-unusable',true)",[artistUser]);
 await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '5 minutes')",[tokenHash,artistUser]);
 try{
 const forbidden=await refundRoute(new NextRequest('http://localhost/api/payments/connect/refund',{method:'POST',headers:{origin:'http://localhost',cookie:'inkflow_session='+rawToken,'Content-Type':'application/json'},body:JSON.stringify({appointmentId:appointment,paymentId:randomUUID()})}),undefined);
 assert.equal(forbidden.status,403,'Artist must not issue refunds');
 }finally{await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[tokenHash]);}
 const owner=randomUUID();await pool.query("INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,$3,'Synthetic Owner','OWNER')",[owner,org,owner+'@example.invalid']);
 const sessions=new Map<string,any>();let creates=0;let failCreate=false;const checkoutKeys:string[]=[];
 const stripe={accounts:{retrieve:async(id:string)=>{assert.equal(id,account);return{charges_enabled:true,payouts_enabled:true,details_submitted:true};}},checkout:{sessions:{create:async(input:any,options:any)=>{assert.equal(options.stripeAccount,account);assert.match(options.idempotencyKey,/^studio-checkout:/);checkoutKeys.push(options.idempotencyKey);if(failCreate){failCreate=false;throw Error('Synthetic network timeout');}creates++;const s={id:'cs_test_'+randomUUID(),url:'https://checkout.stripe.com/synthetic',status:'open',payment_status:'unpaid',amount_total:input.line_items[0].price_data.unit_amount,currency:'usd',metadata:input.metadata,payment_intent:'pi_synthetic_'+creates};sessions.set(s.id,s);return s;},retrieve:async(id:string,options:any)=>{assert.equal(options.stripeAccount,account);return sessions.get(id);}}}} as unknown as Stripe;
 await assert.rejects(studioCheckout(foreign,appointment,'DEPOSIT',stripe),/not found/);
 await pool.query("INSERT INTO scheduling_connections(organization_id,artist_id,provider,status,external_account_id,access_token_encrypted) VALUES($1,$2,'SQUARE','CONNECTED','synthetic','synthetic-test-only')",[org,artist]);
 await assert.rejects(studioCheckout(org,appointment,'DEPOSIT',stripe),/connected calendar/);
 await pool.query("UPDATE scheduling_connections SET status='DISCONNECTED' WHERE organization_id=$1 AND artist_id=$2",[org,artist]);
 const checkout=await studioCheckout(org,appointment,'DEPOSIT',stripe);
 assert.equal((await studioCheckout(org,appointment,'DEPOSIT',stripe)).sessionId,checkout.sessionId);assert.equal(creates,1);
 await assert.rejects(studioCheckout(org,other,'DEPOSIT',stripe),/no longer available/);
 const [{hold_expires_at}]=(await pool.query('SELECT hold_expires_at FROM appointments WHERE id=$1',[appointment])).rows;assert.ok(hold_expires_at>new Date());
 const signer=new Stripe('sk_test_synthetic');
 async function event(session:any,overrides:object={},validSignature=true){const body=JSON.stringify({id:'evt_'+randomUUID(),object:'event',type:'checkout.session.completed',livemode:false,account,data:{object:session},...overrides});const signature=signer.webhooks.generateTestHeaderString({payload:body,secret:validSignature?'whsec_synthetic_only':'wrong'});return webhook(new NextRequest('http://127.0.0.1:3100/api/payments/connect/webhook',{method:'POST',headers:{'stripe-signature':signature},body}));}
 const session={...sessions.get(checkout.sessionId),payment_status:'paid',status:'complete'};
 assert.equal((await event(session,{},false)).status,400);
 assert.equal((await event({...session,amount_total:1})).status,409);
 assert.equal((await event(session,{account:'acct_other'})).status,200);
 assert.equal((await pool.query('SELECT deposit_status FROM appointments WHERE id=$1',[appointment])).rows[0].deposit_status,'PENDING');
 assert.equal((await event(session)).status,200);assert.equal((await event(session)).status,200);
 assert.equal((await pool.query('SELECT status,deposit_status FROM appointments WHERE id=$1',[appointment])).rows[0].status,'CONFIRMED');
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM automation_jobs WHERE appointment_id=$1 AND type='APPOINTMENT_CONFIRMATION'",[appointment])).rows[0].n,1);
 const balance=await studioCheckout(org,appointment,'BALANCE',stripe);assert.equal(balance.amountCents,15000);
 assert.equal((await event({...sessions.get(balance.sessionId),payment_status:'paid'})).status,200);
 await assert.rejects(studioCheckout(org,appointment,'BALANCE',stripe),/no amount/);
 // Full refunds use stable provider idempotency, retain booking and block recollection.
 const balancePayment=(await pool.query("SELECT id FROM payments WHERE appointment_id=$1 AND purpose='BALANCE'",[appointment])).rows[0].id;
 let refunds=0;let refundedAmount=0;let refundStatus='succeeded';
 const refundStripe={refunds:{list:async function*(){yield{id:'re_synthetic',currency:'usd',status:refundStatus,amount:refundedAmount};},create:async(input:any,options:any)=>{assert.equal(options.stripeAccount,account);assert.equal(options.idempotencyKey,'studio-full-refund:'+balancePayment);assert.equal(input.payment_intent,'pi_synthetic_2');refunds++;refundedAmount=15000;return{id:'re_synthetic',status:'succeeded',charge:'ch_synthetic'};}},charges:{retrieve:async(id:string,options:any)=>{assert.equal(id,'ch_synthetic');assert.equal(options.stripeAccount,account);return{livemode:false,payment_intent:'pi_synthetic_2',amount:15000,amount_refunded:refundedAmount,currency:'usd'};}}} as unknown as Stripe;
 await assert.rejects(studioRefund(foreign,appointment,balancePayment,owner,refundStripe),/Owner access/);
 await assert.rejects(studioRefund(org,appointment,balancePayment,artistUser,refundStripe),/Owner access/);
 await assert.rejects(studioRefund(org,other,balancePayment,owner,refundStripe),/not found/);
 assert.equal((await studioRefund(org,appointment,balancePayment,owner,refundStripe)).status,'REFUNDED');
 const audit=(await pool.query('SELECT refunded_cents,provider_refund_id,refund_requested_by_user_id,refund_requested_at FROM payments WHERE id=$1',[balancePayment])).rows[0];assert.equal(audit.refunded_cents,15000);assert.equal(audit.provider_refund_id,'re_synthetic');assert.equal(audit.refund_requested_by_user_id,owner);assert.ok(audit.refund_requested_at);
 assert.equal((await studioRefund(org,appointment,balancePayment,owner,refundStripe)).status,'REFUNDED');assert.equal(refunds,1);
 await reconcileStudioRefund(account,'ch_synthetic',refundStripe);
 assert.equal((await pool.query('SELECT status FROM appointments WHERE id=$1',[appointment])).rows[0].status,'CONFIRMED');
 await assert.rejects(studioCheckout(org,appointment,'BALANCE',stripe),/refund/);
 // Replayed checkout completion must not undo a refund.
 assert.equal((await event({...sessions.get(balance.sessionId),payment_status:'paid'})).status,200);
 assert.equal((await pool.query('SELECT status FROM payments WHERE id=$1',[balancePayment])).rows[0].status,'REFUNDED');
 refundStatus='pending';await reconcileStudioRefund(account,'ch_synthetic',refundStripe);
 assert.equal((await pool.query('SELECT status FROM payments WHERE id=$1',[balancePayment])).rows[0].status,'REFUND_PENDING');
 refundStatus='failed';await reconcileStudioRefund(account,'ch_synthetic',refundStripe);
 assert.equal((await pool.query('SELECT status FROM payments WHERE id=$1',[balancePayment])).rows[0].status,'REFUND_REVIEW');
 refundStatus='succeeded';
 refundedAmount=1000;await reconcileStudioRefund(account,'ch_synthetic',refundStripe);
 assert.equal((await pool.query('SELECT status FROM payments WHERE id=$1',[balancePayment])).rows[0].status,'REFUND_REVIEW');
 await assert.rejects(studioRefund(org,appointment,balancePayment,owner,refundStripe),/review/);
 // A late completed payment records money without reviving cancellation.
 await pool.query("UPDATE appointments SET status='CANCELLED' WHERE id=$1",[appointment]);
 await pool.query("UPDATE appointments SET starts_at='2035-01-08 18:00:00',ends_at='2035-01-08 19:00:00' WHERE id=$1",[other]);
 const late=await studioCheckout(org,other,'DEPOSIT',stripe);await pool.query("UPDATE appointments SET status='CANCELLED',hold_expires_at=null WHERE id=$1",[other]);
 assert.equal((await event({...sessions.get(late.sessionId),payment_status:'paid'})).status,200);
 const cancelled=(await pool.query('SELECT status,deposit_status FROM appointments WHERE id=$1',[other])).rows[0];assert.equal(cancelled.status,'CANCELLED');assert.equal(cancelled.deposit_status,'PAID');
 const switched=randomUUID();await pool.query("INSERT INTO appointments(id,organization_id,artist_id,client_id,service_id,starts_at,ends_at,status,price_cents,deposit_cents,deposit_status,payment_provider,scheduling_provider) VALUES($1,$2,$3,$4,$5,'2035-01-08 20:00:00','2035-01-08 21:00:00','PAYMENT_PENDING',20000,5000,'PENDING','STRIPE','INTERNAL')",[switched,org,artist,client,service]);
 const interrupted=await studioCheckout(org,switched,'DEPOSIT',stripe);
 await pool.query("UPDATE scheduling_connections SET status='CONNECTED' WHERE organization_id=$1 AND artist_id=$2",[org,artist]);
 assert.equal((await event({...sessions.get(interrupted.sessionId),payment_status:'paid'})).status,200);
 assert.equal((await pool.query('SELECT status FROM appointments WHERE id=$1',[switched])).rows[0].status,'PAYMENT_RECEIVED_SLOT_UNAVAILABLE');
 // Failed card/unpaid completion never confirms an appointment; abandoned sessions
 // expire without recording money, and a network timeout retries the same ledger key.
 await pool.query("UPDATE scheduling_connections SET status='DISCONNECTED' WHERE organization_id=$1",[org]);
 const failure=randomUUID();await pool.query("INSERT INTO appointments(id,organization_id,artist_id,client_id,service_id,starts_at,ends_at,status,price_cents,deposit_cents,deposit_status,payment_provider,scheduling_provider) VALUES($1,$2,$3,$4,$5,'2035-01-08 22:00:00','2035-01-08 23:00:00','PAYMENT_PENDING',20000,5000,'PENDING','STRIPE','INTERNAL')",[failure,org,artist,client,service]);
 failCreate=true;await assert.rejects(studioCheckout(org,failure,'DEPOSIT',stripe),/network timeout/);
 const retry=await studioCheckout(org,failure,'DEPOSIT',stripe);
 assert.equal(checkoutKeys.at(-1),checkoutKeys.at(-2));
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM payments WHERE appointment_id=$1',[failure])).rows[0].n,1);
 assert.equal((await event(sessions.get(retry.sessionId))).status,409);
 assert.equal((await pool.query('SELECT status FROM appointments WHERE id=$1',[failure])).rows[0].status,'PAYMENT_PENDING');
 assert.equal((await event(sessions.get(retry.sessionId),{type:'checkout.session.expired'})).status,200);
 assert.equal((await pool.query('SELECT status FROM payments WHERE appointment_id=$1',[failure])).rows[0].status,'EXPIRED');
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM automation_jobs WHERE appointment_id=$1 AND type='APPOINTMENT_CONFIRMATION'",[failure])).rows[0].n,0);
 const replaced=await studioCheckout(org,failure,'DEPOSIT',stripe);assert.notEqual(replaced.sessionId,retry.sessionId);
 // A refund timeout must retain intent/audit and never become paid again.
 const failurePayment=(await pool.query('SELECT id FROM payments WHERE provider_checkout_session_id=$1',[replaced.sessionId])).rows[0].id;
 assert.equal((await event({...sessions.get(replaced.sessionId),payment_status:'paid'})).status,200);
 const timeoutStripe={refunds:{create:async()=>{throw Error('Synthetic refund timeout');}}} as unknown as Stripe;
 await assert.rejects(studioRefund(org,failure,failurePayment,owner,timeoutStripe),/timeout/);
 const uncertain=(await pool.query('SELECT status,refund_requested_by_user_id FROM payments WHERE id=$1',[failurePayment])).rows[0];assert.equal(uncertain.status,'REFUND_PENDING');assert.equal(uncertain.refund_requested_by_user_id,owner);
 assert.equal((await pool.query('SELECT deposit_status FROM appointments WHERE id=$1',[failure])).rows[0].deposit_status,'REFUND_PENDING');
 await assert.rejects(studioCheckout(org,failure,'BALANCE',stripe),/refund/);
 // Tenant-scoped refund actor FK rejects a foreign studio owner.
 const foreignOwner=randomUUID();await pool.query("INSERT INTO users(id,organization_id,email,name,role) VALUES($1,$2,$3,'Synthetic Foreign Owner','OWNER')",[foreignOwner,foreign,foreignOwner+'@example.invalid']);
 await assert.rejects(pool.query('UPDATE payments SET refund_requested_by_user_id=$1 WHERE id=$2',[foreignOwner,balancePayment]),e=>(e as {code:string}).code==='23503');
 const ownerToken=randomBytes(32).toString('hex'),ownerHash=createHash('sha256').update(ownerToken).digest('hex');
 await pool.query("INSERT INTO auth_credentials(user_id,password_hash,active) VALUES($1,'synthetic-unusable',true)",[owner]);
 await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '5 minutes')",[ownerHash,owner]);
 try{
 const response=await paymentStatusRoute(new NextRequest('http://localhost/api/payments/connect',{headers:{cookie:'inkflow_session='+ownerToken}}),undefined);assert.equal(response.status,200);
 const body=await response.json();assert.ok(body.reviewPayments.some((p:any)=>p.id===failurePayment));
 const permittedIds=new Set((await pool.query('SELECT id FROM payments WHERE organization_id=$1',[org])).rows.map(p=>p.id));assert.ok(body.reviewPayments.every((p:any)=>permittedIds.has(p.id)));
 }finally{await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[ownerHash]);}
 console.log('PASS: mocked Stripe with real synthetic database: tenant/account isolation, deposit holds, duplicate checkout/webhook, invalid signatures, mismatched amounts, remaining balance, owner-only full refunds, refund retry/pending/failure/partial/replay cases, cancellation and deduplicated confirmation jobs. No provider requests or messages.');
}
main().catch(error=>{console.error('Synthetic payment checks failed:',error.message);process.exitCode=1;}).finally(()=>pool.end());
