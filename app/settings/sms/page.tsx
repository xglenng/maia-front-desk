'use client';
import {useEffect,useRef,useState} from 'react';
import PhoneSetup from '@/components/sms/phone-setup';
import CampaignRegistration from '@/components/sms/campaign-registration';
import ConsentWorkflow from '@/components/sms/consent-workflow';
import {LegalCustomerSetup} from '@/components/legal-customer-setup';
import {useSession} from '@/components/session-gate';
import './sms.css';
const tabs=[{id:'business',label:'1. Business setup'},{id:'phone',label:'2. Phone setup'},{id:'campaign',label:'3. Campaign registration'},{id:'consent',label:'4. SMS consent'}] as const;
type Tab=typeof tabs[number]['id'];
export default function SmsSettings(){
 const user=useSession();
 const [active,setActive]=useState<Tab>('business'),[visited,setVisited]=useState<Tab[]>(['business']);
 const nav=useRef<HTMLDivElement>(null);
 function select(id:Tab){setActive(id);setVisited(current=>current.includes(id)?current:[...current,id]);const url=new URL(window.location.href);url.searchParams.set('tab',id);window.history.replaceState(null,'',url);}
 useEffect(()=>{const id=new URLSearchParams(window.location.search).get('tab');if(tabs.some(tab=>tab.id===id)){setActive(id as Tab);setVisited(current=>current.includes(id as Tab)?current:[...current,id as Tab]);}},[]);
 return <main className="sms-setup"><a href="/settings">← Settings</a><h1>SMS setup</h1><p>Start by confirming your legal business and linking its live Twilio account. Then set up a number, register messaging, and configure client opt-in.</p><div ref={nav} className="sms-setup-tabs" role="tablist" aria-label="SMS setup sections" onKeyDown={event=>{const index=tabs.findIndex(tab=>tab.id===active);let next:number;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();select(tabs[next].id);nav.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();}}>{tabs.map(tab=><button key={tab.id} type="button" role="tab" id={`sms-tab-${tab.id}`} aria-controls={`sms-panel-${tab.id}`} aria-selected={active===tab.id} tabIndex={active===tab.id?0:-1} onClick={()=>select(tab.id)}>{tab.label}</button>)}</div>{tabs.map(tab=><div role="tabpanel" id={`sms-panel-${tab.id}`} aria-labelledby={`sms-tab-${tab.id}`} key={tab.id} hidden={active!==tab.id} tabIndex={0}>{visited.includes(tab.id)&&(tab.id==='business'?<section><h2>Business setup</h2><p>Complete the legal business identity and live Twilio account connection before creating a number.</p>{user?.organization_id&&<LegalCustomerSetup organizationId={user.organization_id}/>}<button type="button" onClick={()=>select('phone')}>Continue to phone setup →</button></section>:tab.id==='phone'?<PhoneSetup embedded/>:tab.id==='campaign'?<CampaignRegistration embedded includeBusinessSetup={false}/>:<ConsentWorkflow embedded/>)}</div>)}<p className="sms-setup-related"><a href="/compliance">Business information &amp; legal pages →</a><a href="/settings/automations">Message timing &amp; reminders →</a></p></main>;
}
