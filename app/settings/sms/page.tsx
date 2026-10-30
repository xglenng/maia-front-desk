'use client';
import {useEffect,useState} from 'react';
import {useSession} from '@/components/session-gate';
type PhoneStatus={artist:{id:string;displayName:string};phoneNumber:{phoneNumber:string;active:boolean;complianceStatus:string}|null};
export default function SmsSettings(){
 const user=useSession();const [rows,setRows]=useState<PhoneStatus[]>([]);const [error,setError]=useState('');
 useEffect(()=>{if(!user)return;let active=true;fetch('/api/twilio/status').then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load SMS settings');if(active)setRows(data.artists);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[user]);
 return <main style={{maxWidth:850,margin:'0 auto',padding:'40px 20px 80px'}}><a href="/settings">← Settings</a><h1>SMS settings</h1><p>Manage client opt-in and automatic message timing for your artist profile.</p>{error&&<p role="alert">{error}</p>}{rows.map(row=><section key={row.artist.id} style={{border:'1px solid #e4dfda',borderRadius:12,padding:22,marginTop:16}}><h2>{row.artist.displayName}</h2>{row.phoneNumber?<><p>Business number: <strong>{row.phoneNumber.phoneNumber}</strong></p><p>{row.phoneNumber.active?'Active':'Inactive'} · {row.phoneNumber.complianceStatus}</p></>:<p>No business number assigned. Ask your studio owner to set up your phone number and registration.</p>}<p><a href="/settings/consent-forms">Configure SMS consent →</a></p><p><a href="/settings/automations">Configure message timing →</a></p></section>)}<p>Phone purchases, number transfers, and messaging registrations are managed by the studio owner.</p>{user?.role==='OWNER'&&<a href="/twilio">Phone setup and porting →</a>}</main>;
}
