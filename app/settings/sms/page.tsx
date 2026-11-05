'use client';
import {useEffect,useRef,useState} from 'react';
import PhoneSetup from '@/components/sms/phone-setup';
import CampaignRegistration,{registrationStatus} from '@/components/sms/campaign-registration';
import ConsentWorkflow from '@/components/sms/consent-workflow';
import {LegalCustomerSetup} from '@/components/legal-customer-setup';
import {useSession} from '@/components/session-gate';
import {resolveSmsStep} from '@/packages/onboarding/sms-step';
import './sms.css';
const tabs=[{id:'business',label:'1. Business setup'},{id:'phone',label:'2. Phone setup'},{id:'campaign',label:'3. Campaign registration'},{id:'consent',label:'4. SMS consent'}] as const;
type Tab=typeof tabs[number]['id'];
export default function SmsSettings(){
 const user=useSession();
 const [active,setActive]=useState<Tab|null>(null),[visited,setVisited]=useState<Tab[]>([]);
 const [businessReady,setBusinessReady]=useState(false);
 const [resolving,setResolving]=useState(true),[resolveError,setResolveError]=useState(false),[stage,setStage]=useState<{title:string;detail:string;error:boolean}|null>(null);
 const chosen=useRef(false);
 const nav=useRef<HTMLDivElement>(null);
 const organizationId=user?.organization_id;
 function select(id:Tab){chosen.current=true;setActive(id);setVisited(current=>current.includes(id)?current:[...current,id]);const url=new URL(window.location.href);url.searchParams.set('tab',id);window.history.replaceState(null,'',url);}
 useEffect(()=>{const id=new URLSearchParams(window.location.search).get('tab');if(tabs.some(tab=>tab.id===id)){chosen.current=true;setResolving(false);setActive(id as Tab);setVisited(current=>current.includes(id as Tab)?current:[...current,id as Tab]);}},[]);
 useEffect(()=>{
  if(chosen.current||!organizationId)return;
  let cancelled=false;
  const q=`organizationId=${encodeURIComponent(organizationId)}`;
  const read=async(url:string)=>{const response=await fetch(url,{cache:'no-store'});return {status:response.status,ok:response.ok,data:await response.json()};};
  (async()=>{
   try{
    const [legal,phone,registration]=await Promise.all([read(`/api/compliance/legal-customer/setup?${q}`),read(`/api/twilio/status?${q}`),read(`/api/compliance/registration?${q}`)]);
    if(!legal.ok||!phone.ok||(!registration.ok&&registration.status!==404))throw new Error('status');
    const profile=registration.ok?registration.data.profile:null;
    const step=resolveSmsStep({legalSetup:legal.data,phones:phone.data.artists,registration:profile?{status:profile.status,readiness:profile.readiness,consentFormsReady:(registration.data.consentForms??[]).length>0&&registration.data.consentForms.every((form:{ready:boolean})=>form.ready)}:null});
    if(cancelled||chosen.current)return;
    setStage(step==='campaign'&&profile?registrationStatus(profile):null);
    setActive(step);setVisited(current=>current.includes(step)?current:[...current,step]);setResolving(false);
   }catch{
    if(cancelled||chosen.current)return;
    setResolveError(true);setResolving(false);
   }
  })();
  return ()=>{cancelled=true;};
 },[organizationId]);
 return <main className="sms-setup"><a href="/settings">← Settings</a><h1>SMS setup</h1><p>Start by confirming your legal business and linking its live Twilio account. Then set up a number, register messaging, and configure client opt-in.</p><div ref={nav} className="sms-setup-tabs" role="tablist" aria-label="SMS setup sections" onKeyDown={event=>{const index=Math.max(0,tabs.findIndex(tab=>tab.id===active));let next:number;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();select(tabs[next].id);nav.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();}}>{tabs.map(tab=><button key={tab.id} type="button" role="tab" id={`sms-tab-${tab.id}`} aria-controls={`sms-panel-${tab.id}`} aria-selected={active===tab.id} tabIndex={(active??tabs[0].id)===tab.id?0:-1} onClick={()=>select(tab.id)}>{tab.label}</button>)}</div>{active===null&&<p role="status" className="sms-setup-status">{resolving?'Finding your current setup step…':resolveError?"Maia couldn't find your current setup step. Choose a section above to continue.":null}</p>}{active!==null&&stage&&<p role="status" className="sms-setup-status" style={stage.error?{color:'#a12621'}:undefined}><strong>{stage.title}.</strong> {stage.detail}</p>}{tabs.map(tab=><div role="tabpanel" id={`sms-panel-${tab.id}`} aria-labelledby={`sms-tab-${tab.id}`} key={tab.id} hidden={active!==tab.id} tabIndex={0}>{visited.includes(tab.id)&&(tab.id==='business'?<section><h2>Business setup</h2><p>Complete the legal business identity and live Twilio account connection before creating a number.</p>{user?.organization_id&&<LegalCustomerSetup organizationId={user.organization_id} onReadyChange={setBusinessReady}/>}{businessReady&&<button type="button" onClick={()=>select('phone')}>Continue to phone setup →</button>}</section>:tab.id==='phone'?<PhoneSetup embedded/>:tab.id==='campaign'?<CampaignRegistration embedded includeBusinessSetup={false}/>:<ConsentWorkflow embedded/>)}</div>)}<p className="sms-setup-related"><a href="/compliance">Business information &amp; legal pages →</a><a href="/settings/automations">Message timing &amp; reminders →</a></p></main>;
}
