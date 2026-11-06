import {useEffect,useRef,useState} from 'react';
import type {CatalogEntry} from '@/packages/checkout/cart';

const price=(entry:CatalogEntry)=>entry.priceCents===null?'Variable price':`$${(entry.priceCents/100).toFixed(2)}`;

function CatalogDialog({artistId,capacity,onPick,onClose}:{artistId:string;capacity:number;onPick:(entries:CatalogEntry[])=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [catalog,setCatalog]=useState<CatalogEntry[]|null>(null),[error,setError]=useState(false),[search,setSearch]=useState(''),[selected,setSelected]=useState<string[]>([]);
 useEffect(()=>{dialog.current?.showModal();dialog.current?.querySelector('input')?.focus();},[]);
 useEffect(()=>{
  const controller=new AbortController();
  fetch(`/api/checkout/catalog?artistId=${encodeURIComponent(artistId)}`,{signal:controller.signal,cache:'no-store'})
   .then(async response=>{
    if(!response.ok)throw Error('Unable to load catalog.');
    return response.json() as Promise<{catalog:CatalogEntry[]}>;
   })
   .then(data=>{if(!controller.signal.aborted)setCatalog(data.catalog);})
   .catch(()=>{if(!controller.signal.aborted)setError(true);});
  return ()=>controller.abort();
 },[artistId]);
 const keyOf=(entry:CatalogEntry)=>`${entry.kind}:${entry.id}`;
 const atLimit=selected.length>=capacity;
 const query=search.trim().toLowerCase();
 const matches=(catalog||[]).filter(entry=>entry.name.toLowerCase().includes(query));
 return <dialog ref={dialog} className="checkout-keypad invoice-customer-picker" aria-labelledby="invoice-catalog-title" onCancel={event=>{event.preventDefault();onClose();}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();onClose();}}}>
  <div><header><button type="button" onClick={onClose}>‹ Back</button><h2 id="invoice-catalog-title">Add item or service</h2><button type="button" aria-label="Close item picker" onClick={onClose}>✕</button></header>
  <label>Search items and services<input autoFocus value={search} onChange={event=>setSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();}} placeholder="Name"/></label>
  {error?<p role="alert">Unable to load items and services. Go back to add a line manually.</p>
   :!catalog?<p role="status">Loading items and services…</p>
   :!catalog.length?<p>No active items or services for this artist.</p>
   :!matches.length?<p>No matching items or services.</p>
   :<div className="invoice-customer-results">{(['SERVICE','ITEM'] as const).map(kind=>{
     const entries=matches.filter(entry=>entry.kind===kind);
     return entries.length>0&&<section key={kind} aria-labelledby={`invoice-catalog-${kind}`}><h3 id={`invoice-catalog-${kind}`} className="invoice-catalog-group">{kind==='SERVICE'?'Services':'Items'}</h3>
      {entries.map(entry=>{const key=keyOf(entry),on=selected.includes(key);return <button type="button" key={entry.id} aria-pressed={on} disabled={!on&&atLimit} onClick={()=>setSelected(current=>on?current.filter(item=>item!==key):[...current,key])}><strong>{entry.name}</strong><small>{price(entry)}{on?' · Selected':''}</small></button>;})}</section>;
    })}</div>}
  {capacity<=0?<p>This invoice already has the maximum number of lines.</p>:atLimit&&<p>Line limit reached.</p>}
  <button type="button" className="checkout-primary" disabled={!selected.length} onClick={()=>onPick((catalog||[]).filter(entry=>selected.includes(keyOf(entry))))}>{selected.length?`Add ${selected.length} selected`:'Select items to add'}</button>
  </div></dialog>;
}

export function CatalogPicker({artistId,disabled,capacity,onPick}:{artistId:string;disabled:boolean;capacity:number;onPick:(entries:CatalogEntry[])=>void}){
 const [open,setOpen]=useState(false);
 return <>
  <button type="button" className="invoice-customer-trigger" disabled={disabled} onClick={()=>setOpen(true)}><span>Add item or service</span><span aria-hidden="true">›</span></button>
  {open&&<CatalogDialog artistId={artistId} capacity={capacity} onClose={()=>setOpen(false)} onPick={entries=>{setOpen(false);onPick(entries);}}/>}
 </>;
}
