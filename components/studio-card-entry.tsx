'use client';
import {useEffect,useRef,useState} from 'react';
import {loadStripe} from '@stripe/stripe-js/pure';

export function StudioCardEntry({appointmentId,tipCents,onClose}:{appointmentId:string;tipCents:number;onClose:()=>void}){
 const container=useRef<HTMLDivElement>(null);
 const [error,setError]=useState('');
 const [status,setStatus]=useState('Loading secure test card form…');
 useEffect(()=>{
  let disposed=false;let destroy:(()=>void)|undefined;
  async function mount(){
   const response=await fetch('/api/payments/connect/card-entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appointmentId,tipCents}),cache:'no-store'});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Unable to open card entry.');
   if(disposed)return;
   const stripe=await loadStripe(data.publishableKey,{stripeAccount:data.stripeAccountId});
   if(!stripe)throw Error('Unable to load Stripe. Check your connection.');
   if(disposed)return;
   const checkout=await stripe.createEmbeddedCheckoutPage({clientSecret:data.clientSecret,onComplete:()=>{if(!disposed)setStatus('Payment submitted. Close this form and refresh the appointment to verify its recorded status.');}});
   if(disposed){checkout.destroy();return;}
   destroy=()=>checkout.destroy();
   if(container.current)checkout.mount(container.current);
   setStatus('Sandbox only. Use Stripe test card details.');
  }
  void mount().catch(()=>{if(!disposed){setStatus('');setError('Unable to open card entry. Check the test configuration, connection, and any existing payment request.');}});
  return()=>{disposed=true;destroy?.();};
 },[appointmentId,tipCents]);
 return <section aria-label="Secure test card entry" style={{border:'1px solid #ddd',borderRadius:12,padding:16,marginTop:16}}>
  <h2>Enter test card details</h2>
  <p role="status">{status}</p>
  {error&&<p role="alert">{error}</p>}
  <div ref={container}/>
  <button type="button" onClick={onClose} style={{padding:'10px 16px',marginTop:16}}>Close and refresh payment status</button>
 </section>;
}
