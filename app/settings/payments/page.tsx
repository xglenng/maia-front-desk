'use client';
import {useCallback,useEffect,useState} from 'react';
import UiIcon from '@/components/ui-icon';
import {usePageRefresh} from '@/components/page-refresh';
import './payments.css';

type PaymentsData={enabled:boolean;configurationError?:string;checkoutEnabled:boolean;canConnectLive:boolean;previousAccountId?:string;testMode:boolean;modeMismatch:boolean;connected:boolean;ready:boolean;reviewPayments:{id:string;appointmentId:string;status:string;appointmentStatus:string;amountCents:number}[]};
const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);

export default function StudioPayments(){
 const [data,setData]=useState<PaymentsData|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const r=await fetch('/api/payments/connect',{cache:'no-store'});const body=await r.json();if(!r.ok)throw new Error(body.error||'Unable to load payment settings.');setData(body);},[]);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);

 // The shared Refresh action re-checks Stripe for a connected account, then reloads what this page shows.
 usePageRefresh(async()=>{
  setError('');
  if(data?.connected&&data.enabled){
   const r=await fetch('/api/payments/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'REFRESH'})});
   const body=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(body.error||'Stripe status could not be refreshed.');
  }
  await load();
 });

 async function connect(action:string){setBusy(true);setError('');try{const r=await fetch('/api/payments/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,previousAccountId:data?.previousAccountId})});const body=await r.json();if(!r.ok)throw new Error(body.error);if(body.url)window.location.assign(body.url);else await load();}catch(e){setError(e instanceof Error?e.message:'Unable to connect.');}finally{setBusy(false);}}

 const state=!data?null:data.ready?'ready':data.connected?'pending':'idle';
 const title=!data?'':data.ready?(data.testMode?'Ready for test card payments':'Ready for card payments'):data.connected?'Stripe setup is incomplete':'Stripe is not connected';
 const detail=!data?'':data.ready?'Your Stripe account can accept card payments through Maia.':data.connected?'Finish Stripe setup to accept card payments. Use Refresh page in the top bar to check for updates.':'Connect your studio’s Stripe account to prepare payments through Maia.';
 const mode=data?.enabled?(data.testMode?'Stripe test mode. No real money is collected.':data.checkoutEnabled?'Live card checkout is enabled. Card sales are paid into the studio account.':'Live Stripe setup is available. Live card checkout remains disabled.'):'';
 const review=data?.reviewPayments??[];

 return <main className="payments-page">
  <a href="/settings">← Settings</a>
  <h1>Studio payments</h1>
  <p className="payments-lede">Manage the studio’s Stripe connection and review payment activity.</p>
  {error&&<p className="payments-notice payments-error" role="alert">{error}</p>}
  {!data&&!error&&<p role="status" className="payments-muted">Loading payment status…</p>}
  {data&&state&&<>
   <section className={`payments-card payments-status payments-${state}`} aria-labelledby="payments-status-title">
    <div className="payments-status-main">
     <span className="payments-status-icon" aria-hidden="true">{state==='ready'?'✓':state==='pending'?'!':'○'}</span>
     <div>
      <span className={`payments-badge payments-${state}`}>{state==='ready'?'Connected':state==='pending'?'Action needed':'Not connected'}</span>
      <h2 id="payments-status-title">{title}</h2>
      <p className="payments-muted">{detail}</p>
      {mode&&<p className="payments-muted">{mode}</p>}
     </div>
    </div>
    <div className="payments-actions">
     <button className={`payments-button${state==='ready'?' payments-secondary':''}`} disabled={busy||!data.enabled} onClick={()=>void connect('CONNECT')}>{busy?'Working…':data.connected?'Continue Stripe setup':'Connect Stripe'}</button>
    </div>
   </section>
   {data.canConnectLive&&<div className="payments-notice"><p><strong>Sandbox account connected.</strong> Connect a live studio account to replace it. Existing test sales are preserved; live checkout stays disabled.</p><button className="payments-button" disabled={busy} onClick={()=>void connect('CONNECT_LIVE')}>Connect live studio account</button></div>}
   {data.modeMismatch&&<p className="payments-notice">The saved account belongs to another Stripe mode. Live checkout must remain disabled while replacing a sandbox connection.</p>}
   {!data.enabled&&<p className="payments-notice">{data.configurationError||'Payment configuration needs to be completed by your administrator.'}</p>}

   <div className="payments-grid">
    <a className="payments-card payments-link-card" href="/settings/payments/report"><strong><UiIcon name="chart"/>Payment report by artist</strong><p>See service sales, tips, refunds, and net totals for each artist.</p></a>
    <section className="payments-card" aria-labelledby="payments-review-title">
     <div className="payments-review-head"><h2 id="payments-review-title">Payments needing review</h2><span className={`payments-badge ${review.length?'payments-alert':'payments-idle'}`}>{review.length?`${review.length} to review`:'All clear'}</span></div>
     {review.length===0?<p className="payments-muted">No payments need review.</p>:<>
      <p className="payments-muted">Pending refunds, refunds needing attention, or payments received for an unavailable appointment. Showing up to 50 recent items.</p>
      <ul className="payments-review-list">{review.map(payment=><li key={payment.id}><a href={`/appointments/${payment.appointmentId}`}>Review payment · {money(payment.amountCents)}</a><span>{payment.appointmentStatus==='PAYMENT_RECEIVED_SLOT_UNAVAILABLE'&&payment.status==='PAID'?'Paid · appointment time unavailable':payment.status.replaceAll('_',' ')}</span></li>)}</ul>
     </>}
    </section>
   </div>
  </>}
 </main>;
}
