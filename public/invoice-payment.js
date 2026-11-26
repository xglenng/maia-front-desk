/* Stripe owns the payment fields; Maia never reads card numbers or security codes. */
(async function () {
 'use strict';
 const root=document.getElementById('invoice-payment');if(!root)return;
 const status=document.getElementById('payment-status'),button=document.getElementById('pay-invoice'),form=document.getElementById('payment-form'),details=document.getElementById('invoice-summary');
 const token=root.dataset.token;
 if(location.search)history.replaceState({},'',location.pathname);
 let stripe,elements,payment,busy=false,paymentElement;
 const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value/100);
 async function load(){
  const response=await fetch('/api/public/invoice-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),cache:'no-store',credentials:'omit'});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load this invoice.');return data;
 }
 function paid(){form.hidden=true;status.textContent='Thank you. This invoice is paid.';status.setAttribute('role','status');if(paymentElement)paymentElement.destroy();}
 function summary(data){
  details.replaceChildren();
  if(data.number){const title=document.createElement('h2');title.textContent='Invoice '+data.number;details.append(title);}
  if(Array.isArray(data.lines))data.lines.forEach(line=>{const p=document.createElement('p');p.className='invoice-line';const label=document.createElement('span'),amount=document.createElement('strong');label.textContent=String(line.quantity)+' × '+String(line.name);amount.textContent=money(line.quantity*line.unitCents);p.append(label,amount);details.append(p);});
  const total=document.createElement('h2');total.textContent=(data.state==='PAID'?'Paid: ':'Amount due: ')+money(data.amountRemaining??data.totalCents);details.append(total);
  if(data.dueAt){const due=document.createElement('p');due.textContent='Due '+new Date(data.dueAt*1000).toLocaleDateString();details.append(due);}
  if(data.testMode){const note=document.createElement('p');note.textContent='Test mode — no real money is collected.';details.append(note);}
 }
 try{
  payment=await load();summary(payment);
  // Payment state below is verified by the server, not by redirect parameters.
  if(payment.state==='PAID'){paid();return;}
  if(typeof window.Stripe!=='function')throw Error('Stripe could not load. Check your connection or use the Stripe payment page.');
  stripe=window.Stripe(payment.publishableKey,{stripeAccount:payment.stripeAccountId});
  elements=stripe.elements({clientSecret:payment.clientSecret,appearance:{theme:'stripe',variables:{colorPrimary:'#e96522',borderRadius:'12px'}}});
  paymentElement=elements.create('payment',{layout:'tabs'});paymentElement.mount('#stripe-payment-element');
  paymentElement.on('ready',()=>{button.disabled=false;status.textContent='Card details are securely handled by Stripe.';});
  paymentElement.on('loaderror',()=>{status.textContent='The secure fields could not load. Refresh this page or use the Stripe payment page.';});
  form.hidden=false;button.textContent='Pay '+money(payment.amountRemaining);
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(busy)return;busy=true;button.disabled=true;status.textContent='Submitting payment…';
   let submitted=false;
   try{
    const result=await stripe.confirmPayment({elements,confirmParams:{return_url:location.origin+location.pathname},redirect:'if_required'});
    if(result.error)throw Error(result.error.message||'Payment could not be completed.');
    submitted=true;
    const verified=await load();summary(verified);
    if(verified.state==='PAID'){paid();return;}
    status.textContent='Payment submitted. We’re waiting for confirmation. Refresh this page to check its status.';
    button.textContent='Payment processing…';
    // Do not submit a second confirmation while the first payment is being processed.
    button.disabled=true;
   }catch(error){status.textContent=submitted?'Payment submitted, but confirmation could not be checked. Refresh this page before trying again.':error instanceof Error?error.message:'Payment could not be confirmed. Refresh before trying again.';button.disabled=submitted;busy=submitted;}
  });
 }catch(error){status.textContent=error instanceof Error?error.message:'Unable to load the secure payment form.';form.hidden=true;}
})();
