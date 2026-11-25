'use client';
import {useEffect,useRef,useState} from 'react';
import type {StoredPayoutSchedule} from '@/packages/banking/schedule.server';
const days=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
export type ScheduleControl={canEdit:boolean;schedule:StoredPayoutSchedule|null;reason:string|null};
export default function PayoutSchedule({control,onSaved}:{control:ScheduleControl;onSaved:()=>Promise<void>}){
 const [interval,setInterval]=useState('daily'),[weeklyDay,setWeeklyDay]=useState('friday'),[monthlyDay,setMonthlyDay]=useState('1');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const request=useRef<{key:string;id:string}|null>(null);
 const current=JSON.stringify(control.schedule);
 useEffect(()=>{const schedule=JSON.parse(current) as StoredPayoutSchedule|null;if(schedule){setInterval(['daily','weekly','monthly'].includes(schedule.interval)?schedule.interval:'daily');setWeeklyDay(schedule.weeklyDays?.[0]||'friday');setMonthlyDay(String(schedule.monthlyDays?.[0]||1));}},[current]);
 if(!control.canEdit||!control.schedule)return <p>{control.reason||'Manage payout timing in your Stripe account.'}</p>;
 const summary=control.schedule.interval==='weekly'?`Weekly: ${control.schedule.weeklyDays?.join(', ')}`:control.schedule.interval==='monthly'?`Monthly: day ${control.schedule.monthlyDays?.join(', ')}`:control.schedule.interval==='manual'?'Manual payouts': 'Daily payouts';
 async function save(event:React.FormEvent){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  const schedule={interval,...(interval==='weekly'?{weeklyDays:[weeklyDay]}:{}),...(interval==='monthly'?{monthlyDays:[Number(monthlyDay)]}:{})};
  const payload={schedule,expectedSchedule:control.schedule};const key=JSON.stringify(payload);
  if(request.current?.key!==key)request.current={key,id:crypto.randomUUID()};
  try{
   const response=await fetch('/api/banking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,requestId:request.current!.id})});
   const body=await response.json();if(!response.ok)throw Error(body.error||'Unable to save payout schedule.');
   await onSaved();setMessage('Payout schedule saved. Bank arrival times can vary.');
  }catch(reason){setError(reason instanceof Error?reason.message:'Unable to save payout schedule.');}finally{setBusy(false);}
 }
 return <form onSubmit={save} className="payout-schedule-form" aria-busy={busy}>
  <p><strong>Current schedule:</strong> {summary}</p>
  <fieldset disabled={busy}><legend>Automatic payout schedule</legend>
   <label>Frequency<select value={interval} onChange={e=>{setInterval(e.target.value);setMessage('');}}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
   {interval==='weekly'&&<label>Payout day<select value={weeklyDay} onChange={e=>setWeeklyDay(e.target.value)}>{days.map(day=><option key={day} value={day}>{day[0].toUpperCase()+day.slice(1)}</option>)}</select></label>}
   {interval==='monthly'&&<label>Day of month<select value={monthlyDay} onChange={e=>setMonthlyDay(e.target.value)}>{Array.from({length:31},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label>}
   <p>Applies to available funds. {interval==='monthly'?'Days 29–31 use the last day in shorter months. ':''}Saving changes this studio’s automatic payout schedule in Stripe. It does not request an immediate payout or change the destination account.</p>
   <button type="submit">{busy?'Saving…':'Save payout schedule'}</button>
  </fieldset>
  {error&&<p role="alert" className="checkout-error">{error}</p>}{message&&<p role="status">{message}</p>}
 </form>;
}
