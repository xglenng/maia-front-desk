"use client";

import { useEffect, useState } from 'react';
import NativeFields from '@/app/waiver/native-fields';
import type { NativeAnswers } from '@/packages/waivers/forms';
import type { RequestDefinition } from '@/packages/waivers/request-forms';

type FormData = {name:string;definition:RequestDefinition;version:number};
export default function RequestPage() {
  const [token,setToken]=useState('');
  const [form,setForm]=useState<FormData|null>(null);
  const [answers,setAnswers]=useState<NativeAnswers>({});
  const [images,setImages]=useState<Record<string,File>>({});
  const [submissionKey,setSubmissionKey]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [received,setReceived]=useState(false);
  useEffect(()=>{
    const value=new URLSearchParams(window.location.search).get('token')||'';
    setToken(value);
    try {
      const key=`maia-request:${value}`;
      const saved=sessionStorage.getItem(key);
      const id=saved||crypto.randomUUID();
      sessionStorage.setItem(key,id);
      setSubmissionKey(id);
    } catch {
      setError('This browser must allow session storage to safely submit a request.');
      return;
    }
    const controller=new AbortController();
    fetch(`/api/public/request-forms?token=${encodeURIComponent(value)}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load the form.');setForm(data);})
      .catch(caught=>{if(!controller.signal.aborted)setError(caught instanceof Error?caught.message:'Unable to load the form.');});
    return ()=>controller.abort();
  },[]);
  async function submit(event:React.FormEvent) {
    event.preventDefault();
    if(!form||!submissionKey||busy)return;
    setBusy(true);setError('');
    try {
      const payload=new window.FormData();
      payload.set('payload',JSON.stringify({token,idempotencyKey:submissionKey,version:form.version,answers}));
      for(const [id,file] of Object.entries(images))payload.set(`image:${id}`,file);
      const response=await fetch('/api/public/request-forms',{method:'POST',body:payload});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'Unable to submit your request.');
      setReceived(true);
      sessionStorage.removeItem(`maia-request:${token}`);
    } catch(caught) {
      setError(caught instanceof Error?caught.message:'Unable to submit your request. Please retry.');
    } finally {setBusy(false);}
  }
  return <main style={{maxWidth:760,margin:'32px auto',padding:24}}>
    {form?.definition.logoAssetId&&<img src={`/api/public/studio-logo/${form.definition.logoAssetId}`} alt="Studio logo" style={{display:'block',maxWidth:'100%',maxHeight:180,objectFit:'contain',marginBottom:24}}/>}
    <h1>{form?.name||'Request form'}</h1>
    {error&&<p role="alert">{error}</p>}
    {!form&&!error&&<p>Loading form…</p>}
    {received?<p role="status">Your request was received for review. Thank you.</p>:form&&<form onSubmit={submit}>
      <p style={{whiteSpace:'pre-wrap',lineHeight:1.7}}>{form.definition.body}</p>
      <NativeFields fields={form.definition.fields} answers={answers} onChange={setAnswers} disabled={busy}
        onImageChange={(id,file)=>setImages(previous=>{const next={...previous};if(file)next[id]=file;else delete next[id];return next;})}/>
      <button disabled={busy||!submissionKey} style={{background:'#181716',color:'white',padding:'12px 24px',borderRadius:24}}>{busy?'Submitting…':'Submit request'}</button>
    </form>}
  </main>;
}
