'use client';
import {useEffect,useRef,useState} from 'react';
import PhoneSetup from '@/components/sms/phone-setup';
import CampaignRegistration from '@/components/sms/campaign-registration';
import ConsentWorkflow from '@/components/sms/consent-workflow';
import './sms.css';
const tabs=[{id:'phone',label:'Phone setup'},{id:'campaign',label:'Campaign registration'},{id:'consent',label:'SMS consent'}] as const;
type Tab=typeof tabs[number]['id'];
export default function SmsSettings(){
 const [active,setActive]=useState<Tab>('phone'),[visited,setVisited]=useState<Tab[]>(['phone']);
 const nav=useRef<HTMLDivElement>(null);
 function select(id:Tab){setActive(id);setVisited(current=>current.includes(id)?current:[...current,id]);const url=new URL(window.location.href);url.searchParams.set('tab',id);window.history.replaceState(null,'',url);}
 useEffect(()=>{const id=new URLSearchParams(window.location.search).get('tab');if(tabs.some(tab=>tab.id===id)){setActive(id as Tab);setVisited(current=>current.includes(id as Tab)?current:[...current,id as Tab]);}},[]);
 return <main className="sms-setup"><a href="/settings">← Settings</a><h1>SMS setup</h1><p>Set up your business number, register appointment messaging, and configure how clients opt in.</p><div ref={nav} className="sms-setup-tabs" role="tablist" aria-label="SMS setup sections" onKeyDown={event=>{const index=tabs.findIndex(tab=>tab.id===active);let next:number;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();select(tabs[next].id);nav.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();}}>{tabs.map(tab=><button key={tab.id} type="button" role="tab" id={`sms-tab-${tab.id}`} aria-controls={`sms-panel-${tab.id}`} aria-selected={active===tab.id} tabIndex={active===tab.id?0:-1} onClick={()=>select(tab.id)}>{tab.label}</button>)}</div>{tabs.map(tab=><div role="tabpanel" id={`sms-panel-${tab.id}`} aria-labelledby={`sms-tab-${tab.id}`} key={tab.id} hidden={active!==tab.id} tabIndex={0}>{visited.includes(tab.id)&&(tab.id==='phone'?<PhoneSetup embedded/>:tab.id==='campaign'?<CampaignRegistration embedded/>:<ConsentWorkflow embedded/>)}</div>)}<p className="sms-setup-related"><a href="/compliance">Business information &amp; legal pages →</a><a href="/settings/automations">Message timing &amp; reminders →</a></p></main>;
}
