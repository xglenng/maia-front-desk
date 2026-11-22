"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import NativeEditor, {type SavedRequestForm} from '../../native-editor';
import '../../waivers.css';

type Setup={studioBrand:string;studioLogoAssetId:string|null;studioLogoAvailable:boolean;artists:Array<{id:string;name:string}>};
export default function EditRequestFormPage() {
  const {id}=useParams<{id:string}>();
  const router=useRouter();
  const [form,setForm]=useState<SavedRequestForm|null>(null);
  const [setup,setSetup]=useState<Setup|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    Promise.all([fetch('/api/request-forms',{cache:'no-store',signal:controller.signal}),fetch('/api/waiver-integrations',{cache:'no-store',signal:controller.signal})])
      .then(async ([formsResponse,setupResponse])=>{
        const [formsData,setupData]=await Promise.all([formsResponse.json(),setupResponse.json()]);
        if(!formsResponse.ok||!setupResponse.ok)throw Error('Unable to load request form.');
        const selected=(formsData.forms as SavedRequestForm[]).find(item=>item.id===id);
        if(!selected)throw Error('Request form not found.');
        setForm(selected);setSetup(setupData);
      }).catch(caught=>{if(!controller.signal.aborted)setError(caught instanceof Error?caught.message:'Unable to load request form.');});
    return ()=>controller.abort();
  },[id]);
  const artist=setup?.artists.find(item=>item.id===form?.artistId)||null;
  return <main className="waiver-admin"><header><a href="/waivers">← Current forms</a><h1>Edit request form</h1></header>
    {error&&<p role="alert">{error}</p>}
    {!form&&!error&&<p>Loading…</p>}
    {form&&setup&&<section className="waiver-section native-create"><NativeEditor currentArtist={artist} artistProfileCount={artist?1:0} studioBrand={setup.studioBrand} studioLogoAssetId={setup.studioLogoAssetId} studioLogoAvailable={setup.studioLogoAvailable} busy={false} initialRequest={form} onSaved={async()=>{router.push('/waivers?created=request');}}/></section>}
  </main>;
}
