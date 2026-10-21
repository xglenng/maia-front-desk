'use client';
import {useEffect,useState} from 'react';
type Totals={paymentCount:number;serviceCents:number;tipCents:number;refundCents:number;netCents:number;needsReview:number};
type Report={artistId:string|null;artists:{id:string;name:string}[];rows:(Totals&{artistId:string;artistName:string})[];totals:Totals;start:string;end:string};
const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const inputStyle={padding:10,border:'1px solid #d7d1cb',borderRadius:8,font:'inherit',minHeight:44};
export default function PaymentReport(){
 const today=new Date().toISOString().slice(0,10);
 const [start,setStart]=useState(today.slice(0,8)+'01'),[end,setEnd]=useState(today),[artistId,setArtistId]=useState('');
 const [data,setData]=useState<Report|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setBusy(true);setError('');setData(null);try{const query=new URLSearchParams({start,end,...(artistId?{artistId}:{})});const r=await fetch('/api/payments/report?'+query,{cache:'no-store'});const body=await r.json();if(!r.ok)throw Error(body.error||'Unable to load report.');setData(body);}catch(e){setError(e instanceof Error?e.message:'Unable to load report.');}finally{setBusy(false);}}
 const [team,setTeam]=useState<Report['artists']>([]);
 useEffect(()=>{void load();},[]);
 useEffect(()=>{if(data)setTeam(data.artists);},[data]);
 return <main style={{maxWidth:1050,margin:'auto',padding:'24px 20px 100px',color:'#181716'}}>
  <a href="/settings/payments">← Studio payments</a><h1>Payment report</h1>
  <p>Recorded payments · USD · Payment dates in UTC</p>
  <form onSubmit={e=>{e.preventDefault();void load();}} style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end',margin:'24px 0'}}>
   <label>From<br/><input aria-label="From" type="date" value={start} onChange={e=>setStart(e.target.value)} required style={inputStyle}/></label>
   <label>Through<br/><input aria-label="Through" type="date" value={end} onChange={e=>setEnd(e.target.value)} required style={inputStyle}/></label>
   <label>Artist<br/><select aria-label="Artist" value={artistId} onChange={e=>setArtistId(e.target.value)} style={inputStyle}><option value="">All artists</option>{team.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <button disabled={busy} style={{...inputStyle,background:'#181716',color:'#fff',cursor:'pointer'}}>{busy?'Loading…':'Update report'}</button>
  </form>
  {error&&<p role="alert">{error}</p>}
  <p style={{color:'#706b66'}}>Includes settled payments with a recorded confirmation date. Refunds are the current refunds against those payments, including refunds made later. Net collected is before processing fees. This is not a payout or refund-date cash-flow report. Artist attribution follows the appointment’s assigned artist. Pending and expired charges are excluded.</p>
  {data&&<><p><a href={'/api/payments/report?'+new URLSearchParams({start:data.start,end:data.end,format:'csv',...(data.artistId?{artistId:data.artistId}:{})})} download style={{display:'inline-block',padding:'10px 14px',border:'1px solid #d7d1cb',borderRadius:8}}>Download CSV</a> · Exports the displayed date and artist filters.</p><p>Showing {data.start} through {data.end} (UTC)</p><dl style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:12}}>{[['Service received',data.totals.serviceCents],['Tips received',data.totals.tipCents],['Refunded',data.totals.refundCents],['Net collected',data.totals.netCents]].map(([label,value])=><div key={label} style={{padding:16,border:'1px solid #e4dfda',borderRadius:12}}><dt>{label}</dt><dd style={{margin:'8px 0 0',fontSize:24,fontWeight:700}}>{money(value as number)}</dd></div>)}</dl>
   <p>{data.totals.paymentCount} settled payments{data.totals.needsReview>0?` · ${data.totals.needsReview} refunds pending or needing review`:''}</p>
   {data.rows.length===0?<p>No settled payments match these filters.</p>:<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}><caption style={{textAlign:'left',fontWeight:600,padding:'12px 0'}}>By artist</caption><thead><tr>{['Artist','Payments','Service received','Tips','Refunded','Net collected'].map(label=><th key={label} style={{padding:12,borderBottom:'1px solid #ddd'}}>{label}</th>)}</tr></thead><tbody>{data.rows.map(row=><tr key={row.artistId}>{[row.artistName,row.paymentCount,money(row.serviceCents),money(row.tipCents),money(row.refundCents),money(row.netCents)].map((value,index)=><td key={index} style={{padding:12,borderBottom:'1px solid #eee'}}>{value}</td>)}</tr>)}</tbody></table></div>}
  </>}
 </main>;
}
