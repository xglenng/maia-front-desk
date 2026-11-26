'use client';
import {localCalendarDate} from '@/packages/studio/local-calendar-date';
import {useEffect,useRef,useState} from 'react';
export type InvoiceClient={id:string;first_name:string;last_name:string|null;email:string|null;phone:string|null;sms_opt_in:boolean;sms_consent_status:string};
type CustomerValue={clientId:string;name:string;email:string;phone:string;dateOfBirth?:string};
export function CustomerPicker({clients,loading,error,value,onSave,onClose}:{clients:InvoiceClient[];loading:boolean;error:string;value:CustomerValue;onSave:(value:CustomerValue)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const addNewButtonRef=useRef<HTMLButtonElement>(null);
 const [clientId,setClientId]=useState(value.clientId),[name,setName]=useState(value.name),[email,setEmail]=useState(value.email),[phone,setPhone]=useState(value.phone),[search,setSearch]=useState('');
 const [dateOfBirth,setDateOfBirth]=useState(value.dateOfBirth||'');
 const [maxBirthDate,setMaxBirthDate]=useState('');useEffect(()=>setMaxBirthDate(localCalendarDate()),[]);
 const [manual,setManual]=useState(!value.clientId&&Boolean(value.name));
 useEffect(()=>{
  const element=dialog.current; if(!element)return;
  element.showModal();
  if(addNewButtonRef.current)addNewButtonRef.current.focus();
  const viewport=window.visualViewport;
  const update=()=>{if(viewport){element.style.setProperty('--picker-viewport-height',`${viewport.height}px`);element.style.setProperty('--picker-viewport-top',`${viewport.offsetTop}px`);}};
  update();viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);
  return()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);};
 },[]);
 const matches=clients.filter(client=>`${client.first_name} ${client.last_name||''} ${client.email||''} ${client.phone||''}`.toLowerCase().includes(search.toLowerCase()));
 return <dialog ref={dialog} className="checkout-keypad invoice-customer-picker invoice-customer-dialog" aria-labelledby="invoice-customer-title" onCancel={onClose}>
  <form onSubmit={event=>{event.preventDefault();if(name.trim()&&(clientId||manual))onSave({clientId,name:name.trim(),email:email.trim(),phone:phone.trim(),dateOfBirth});}}>
   <header><h2 id="invoice-customer-title">{manual?'Add new customer':'Select customer'}</h2><button type="button" aria-label="Close customer picker" onClick={onClose}>✕</button></header>
   {manual?
    <button ref={addNewButtonRef} type="button" className="invoice-customer-add-new" onClick={()=>{setManual(false);setClientId('');setName('');setEmail('');setPhone('');}}>← Back to clients</button>:
    <><button ref={addNewButtonRef} type="button" className="invoice-customer-add-new" onClick={()=>{setManual(true);setClientId('');setName('');setEmail('');setPhone('');}}>+ Add new</button>
    <label>Search clients<input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Name, email, or phone"/></label>
    <div className="invoice-customer-scroll">{loading?<p role="status">Loading clients…</p>:error?<p role="alert">{error} You can still add a new customer.</p>:<div className="invoice-customer-results">{matches.length?matches.map(client=><button type="button" key={client.id} aria-pressed={clientId===client.id} onClick={()=>{setClientId(client.id);setName(`${client.first_name} ${client.last_name||''}`.trim());setEmail(client.email||'');setPhone(client.phone||'');}}><strong>{client.first_name} {client.last_name}</strong><small>SMS eligibility checked before sending{clientId===client.id?' · Selected':''}</small></button>):<p>{search?'No matching clients.':'No existing clients for this artist.'}</p>}</div>}</div></>}
   {manual?<div className="invoice-customer-scroll invoice-customer-fields"><label>Customer name<input required autoFocus maxLength={160} value={name} onChange={event=>setName(event.target.value)}/></label><label>Email (optional)<input type="email" maxLength={254} value={email} onChange={event=>setEmail(event.target.value)}/></label><label>Phone (optional)<input type="tel" autoComplete="tel" maxLength={60} value={phone} onChange={event=>setPhone(event.target.value)}/></label><label>Date of birth (optional)<input type="date" min="1900-01-01" max={maxBirthDate} onFocus={()=>setMaxBirthDate(localCalendarDate())} value={dateOfBirth} onChange={event=>setDateOfBirth(event.target.value)}/></label><p className="invoice-customer-notice">The customer is created when the invoice draft is saved. Adding a phone number does not grant SMS consent.</p></div>:
    clientId&&<><label>Customer name<input required maxLength={160} value={name} onChange={event=>setName(event.target.value)}/></label><label>Email (optional)<input type="email" maxLength={254} value={email} onChange={event=>setEmail(event.target.value)}/></label></>}
   <footer className="invoice-customer-footer"><button className="checkout-primary" disabled={!name.trim()||(!clientId&&!manual)}>Use customer</button></footer>
  </form>
 </dialog>;
}
