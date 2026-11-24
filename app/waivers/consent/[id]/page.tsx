'use client';
import {useCallback,useEffect,useState} from 'react';
import {useParams,useSearchParams} from 'next/navigation';
import ConsentEditor,{type ConsentEditorState} from '../../consent-editor';
import '../../waivers.css';
export default function EditConsentPage(){
 const published=useSearchParams().get('published')==='1';
 const {id}=useParams<{id:string}>();const [state,setState]=useState<ConsentEditorState|null>(null),[logo,setLogo]=useState<string|null>(null),[error,setError]=useState(''),[generation,setGeneration]=useState(0);
 const load=useCallback(async(signal?:AbortSignal)=>{
  const [response,setupResponse]=await Promise.all([fetch('/api/consent-versions?formId='+encodeURIComponent(id),{cache:'no-store',signal}),fetch('/api/waiver-integrations',{cache:'no-store',signal})]);
  const [data,setup]=await Promise.all([response.json(),setupResponse.json()]);if(!response.ok)throw Error(data.error||'Unable to load consent form.');if(!setupResponse.ok)throw Error('Unable to load studio branding.');setState(data);setLogo(setup.studioLogoAssetId||null);setGeneration(n=>n+1);setError('');
 },[id]);
 useEffect(()=>{const controller=new AbortController();load(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[load]);
 return <main className="waiver-admin"><header><a href="/waivers">Back to Waivers &amp; forms</a><h1>Consent form editor</h1></header>{published&&<p role="status" className="waiver-notice success">Published for future clients. Previously sent links and signed records are unchanged.</p>}{error&&<p role="alert">{error}</p>}{!state&&!error&&<p>Loading consent form…</p>}{state&&<ConsentEditor key={generation} initial={state} studioLogoId={logo} onReload={()=>load()}/>}</main>;
}
