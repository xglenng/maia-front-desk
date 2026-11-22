"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { NativeAnswers } from '@/packages/waivers/forms';
import type { RequestDefinition } from '@/packages/waivers/request-forms';

type Details={submission:{id:string;requestType:string;clientName:string;createdAt:string;definition:RequestDefinition;answers:NativeAnswers};attachments:Array<{id:string;fieldId:string}>};
export default function RequestDetailsPage() {
  const {id}=useParams<{id:string}>();
  const [details,setDetails]=useState<Details|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`/api/requests/${encodeURIComponent(id)}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to load request.');setDetails(data);})
      .catch(caught=>{if(!controller.signal.aborted)setError(caught instanceof Error?caught.message:'Unable to load request.');});
    return ()=>controller.abort();
  },[id]);
  return <main style={{maxWidth:760,margin:'32px auto',padding:24}}>
    <a href="/requests">← Submitted requests</a><h1>{details?.submission.requestType==='TATTOO_REQUEST'?'Tattoo request':details?'Piercing request':'Request'}</h1>
    {error&&<p role="alert">{error}</p>}{!details&&!error&&<p>Loading request…</p>}
    {details&&<><h2>{details.submission.clientName}</h2><p>Submitted {new Date(details.submission.createdAt).toLocaleString()}</p>
      {details.submission.definition.fields.map(field=>{
        if(['HEADING','PARAGRAPH','DIVIDER'].includes(field.type))return null;
        const attachment=details.attachments.find(item=>item.fieldId===field.id);
        const answer=details.submission.answers[field.id];
        const text=Array.isArray(answer)?answer.join(', '):typeof answer==='boolean'?(answer?'Yes':'No'):answer||'Not provided';
        return <section key={field.id} style={{margin:'24px 0'}}><h3>{field.label}</h3>{field.type==='IMAGE'?(attachment?<a href={`/api/requests/${id}/images/${attachment.id}`} target="_blank" rel="noreferrer"><img src={`/api/requests/${id}/images/${attachment.id}`} alt={field.label} style={{maxWidth:'100%',maxHeight:320}}/></a>:<p>Not provided</p>):<p style={{whiteSpace:'pre-wrap'}}>{text}</p>}</section>;
      })}
    </>}
  </main>;
}
