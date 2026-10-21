import test from 'node:test';
import assert from 'node:assert/strict';
import {assertTerminalTestMode,terminalIntentMatches} from '../terminal-policy';
test('Terminal requires both opt-in gates and a test key',()=>{
 const env={MAIA_STRIPE_CONNECT_ENABLED:'true',MAIA_STRIPE_TERMINAL_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_synthetic'};
 assert.doesNotThrow(()=>assertTerminalTestMode(env));
 for(const change of [{MAIA_STRIPE_TERMINAL_ENABLED:'false'},{MAIA_STRIPE_CONNECT_ENABLED:'false'},{STRIPE_SECRET_KEY:'sk_live_synthetic'}])assert.throws(()=>assertTerminalTestMode({...env,...change}));
});
test('Terminal credits only exact settled card-present money and tenant/payment references',()=>{
 const payment={id:'payment',organizationId:'org',appointmentId:'appointment',amountCents:300,currency:'usd'};
 const intent={livemode:false,status:'succeeded',amount:300,amount_received:300,currency:'usd',payment_method_types:['card_present'],metadata:{paymentId:'payment',organizationId:'org',appointmentId:'appointment',flow:'TERMINAL_BALANCE'}};
 assert.equal(terminalIntentMatches(payment,intent),true);
 for(const change of [{livemode:true},{status:'requires_capture'},{amount:301},{amount_received:0},{currency:'eur'},{payment_method_types:['card']},{metadata:{...intent.metadata,organizationId:'foreign'}},{metadata:{...intent.metadata,paymentId:'other'}}])assert.equal(terminalIntentMatches(payment,{...intent,...change}),false);
});
