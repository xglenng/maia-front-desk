'use client';
import {checkoutTip,type TipChoice} from '@/packages/integrations/checkout-tip';
const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
export function CheckoutTipReview({balanceCents,choice,custom,disabled,onChoice,onCustom}:{balanceCents:number;choice:TipChoice;custom:string;disabled:boolean;onChoice:(choice:TipChoice)=>void;onCustom:(value:string)=>void}){
 const tip=checkoutTip(balanceCents,choice,custom);
 return <div>
  <h2 style={{marginTop:0}}>Review payment</h2>
  <fieldset disabled={disabled} style={{border:0,padding:0,margin:'16px 0'}}>
   <legend style={{fontWeight:600,marginBottom:10}}>Optional tip</legend>
   <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
    {([0,15,20,25,'custom'] as const).map(option=><button type="button" key={option} aria-pressed={choice===option} onClick={()=>onChoice(option)} style={{flex:'1 0 80px',minHeight:48,border:'1px solid '+(choice===option?'#181716':'#d7d1cb'),borderRadius:10,padding:'10px 12px',font:'inherit',background:choice===option?'#181716':'#fff',color:choice===option?'#fff':'#181716',cursor:disabled?'default':'pointer'}}>{option===0?'No tip':option==='custom'?'Custom':`${option}%`}</button>)}
   </div>
   {choice==='custom'&&<label style={{display:'block',marginTop:12}}>Custom tip ($) <input type="text" inputMode="decimal" value={custom} onChange={e=>onCustom(e.target.value)} style={{padding:10,width:110,font:'inherit',border:'1px solid #d7d1cb',borderRadius:8}}/></label>}
   <p style={{color:'#706b66',fontSize:14}}>Percentages use the remaining service balance. No tip is selected by default.</p>
  </fieldset>
  {!tip.valid&&<p role="alert">Enter a tip from $0 to $1,000 with up to two decimal places.</p>}
  <dl aria-label="Payment total" style={{margin:'16px 0',padding:16,background:'#f6f5f3',borderRadius:12}}>
   {([['Service balance',money(balanceCents)],['Tip',tip.valid?money(tip.tipCents):'Enter a valid amount'],['Total to pay',tip.totalCents==null?'—':money(tip.totalCents)]]).map(([label,value])=><div key={label} style={{display:'flex',justifyContent:'space-between',gap:16,padding:'6px 0',fontWeight:label==='Total to pay'?700:400,fontSize:label==='Total to pay'?20:16}}><dt>{label}</dt><dd style={{margin:0}}>{value}</dd></div>)}
  </dl>
 </div>;
}
