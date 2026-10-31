'use client';
import {useEffect,useRef,useState} from 'react';
import {updatePriceDigits} from '@/packages/checkout/price-entry';
import type {CatalogEntry} from '@/packages/checkout/cart';

export default function PriceKeypad({entry,onCancel,onConfirm}:{entry:CatalogEntry|null;onCancel:()=>void;onConfirm:(cents:number)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[digits,setDigits]=useState('');
 const cents=Number(digits||0);
 function key(value:string){setDigits(previous=>updatePriceDigits(previous,value));}
 useEffect(()=>{if(entry){setDigits('');dialog.current?.showModal();}else dialog.current?.close();},[entry]);
 return <dialog className="checkout-keypad" ref={dialog} aria-labelledby="price-keypad-title" onCancel={onCancel} onKeyDown={event=>{if(/^[0-9]$/.test(event.key)||event.key==='Backspace'){event.preventDefault();key(event.key);}else if(event.key==='Enter'){event.preventDefault();if(cents>0)onConfirm(cents);}}}>
  <header><button type="button" aria-label="Cancel price entry" onClick={onCancel}>×</button><div><p>{entry?.name}</p><h2 id="price-keypad-title">Enter price</h2></div></header>
  <output aria-live="polite" aria-label="Price">{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100)}</output>
  <div className="checkout-number-keys">{['1','2','3','4','5','6','7','8','9','00','0','Backspace'].map(value=><button type="button" key={value} aria-label={value==='Backspace'?'Delete last digit':value} onClick={()=>key(value)}>{value==='Backspace'?'⌫':value}</button>)}</div>
  <button type="button" className="checkout-primary" disabled={!cents} onClick={()=>onConfirm(cents)}>Add · {new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100)}</button>
 </dialog>;
}
