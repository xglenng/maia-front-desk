'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import NativeWaiver,{type NativeWaiverData} from '@/app/waiver/native-waiver';
import '../../../waivers.css';
export default function ConsentPreview(){
 const {id}=useParams<{id:string}>();const [form,setForm]=useState<(NativeWaiverData&{versionLabel:string})|null>(null),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();const query=new URLSearchParams(window.location.search);query.set('formId',id);fetch('/api/consent-versions/preview?'+query,{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Preview unavailable.');setForm(data);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[id]);
 return <><header className="waiver-admin"><a href={`/waivers/consent/${id}`}>Back to consent editor</a><h1>Consent preview</h1><p>{form?.versionLabel||'Read-only form preview'}</p>{error&&<p role="alert">{error}</p>}{!form&&!error&&<p>Loading preview…</p>}</header>{form&&<NativeWaiver previewForm={form}/>}</>;
}
