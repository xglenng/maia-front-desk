'use client';
import {useEffect,useState} from 'react';
import QuestionBuilder from './question-builder';
import {nativeDefinition,type NativeField} from '@/packages/waivers/forms';
import {buildConsentStarter,consentStarterReferences,type ConsentStarterKind} from '@/packages/waivers/consent-starters';

export default function NativeEditor({artists,studioBrand,busy,onSaved}:{
 artists:{id:string;name:string}[];studioBrand:string;busy:boolean;onSaved:()=>Promise<void>;
}) {
 const [name,setName]=useState(''),[body,setBody]=useState(''),[artistId,setArtistId]=useState('');
 const [audience,setAudience]=useState('ADULT'),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const [fields,setFields]=useState<NativeField[]>([]),[brand,setBrand]=useState('');
 const [starterKind,setStarterKind]=useState<ConsentStarterKind>('TATTOO'),[confirmReplace,setConfirmReplace]=useState(false);
 const [preparedFor,setPreparedFor]=useState<{artistId:string;artistName:string;brand:string}|null>(null);
 useEffect(()=>{setBrand(current=>current||studioBrand);},[studioBrand]);
 const bindingChanged=Boolean(preparedFor&&(preparedFor.artistId!==artistId||preparedFor.brand!==brand.trim()));
 function loadStarter(replace=false) {
  setMessage('');
  if(!replace&&(name.trim()||body.trim()||fields.length)){setConfirmReplace(true);return;}
  try {
   const artist=artists.find(row=>row.id===artistId);
   if(!artist)throw Error('Choose an artist before loading a template.');
   const draft=buildConsentStarter(starterKind,brand,artist.name);
   setName(draft.name);setBody(draft.definition.body);setFields(draft.definition.fields||[]);setAudience('ADULT');
   setPreparedFor({artistId,artistName:artist.name,brand:brand.trim()});setConfirmReplace(false);
   setMessage('Template loaded into your draft. Review and edit it, then click Create form to save.');
  } catch(error) {setMessage(error instanceof Error?error.message:'Unable to load template.');}
 }
 async function save(event:React.FormEvent) {
  event.preventDefault();setSaving(true);setMessage('');
  try {
   if(bindingChanged)throw Error('Reload the template for the selected artist and brand before saving.');
   const parsed=nativeDefinition.safeParse({body,fields});
   if(!parsed.success)throw Error(parsed.error.issues[0]?.message||'Check your questions.');
   const response=await fetch('/api/waiver-integrations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ADD_NATIVE_FORM',name,definition:parsed.data,artistId,audience})});
   const data=await response.json();
   if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Check the form details.');
   setMessage('Maia form created. It is ready to assign to appointments.');
   setName('');setBody('');setFields([]);setPreparedFor(null);setConfirmReplace(false);await onSaved();
  } catch(error) {setMessage(error instanceof Error?error.message:'Unable to save.');}
  finally {setSaving(false);}
 }
 return <form className="waiver-card" onSubmit={save}>
  <div className="card-title"><div><h2>Create a Maia form</h2><p>Start with a consent template or write your own. Clients read it and draw their signature.</p></div><span className="provider-pill">Maia hosted</span></div>
  <label>Artist<select required value={artistId} onChange={event=>{setArtistId(event.target.value);setConfirmReplace(false);}}><option value="">Choose an artist</option>{artists.map(artist=><option key={artist.id} value={artist.id}>{artist.name}</option>)}</select></label>
  <section className="consent-starter" aria-label="Consent templates">
   <h3>Start with a template</h3><p>Adult consent starters use your brand and selected artist’s name. Everything is editable before you save.</p>
   <div className="starter-inputs"><label>Brand or studio name<input maxLength={160} value={brand} onChange={event=>{setBrand(event.target.value);setConfirmReplace(false);}} placeholder="Your brand name"/></label>
   <label>Consent template<select value={starterKind} onChange={event=>{setStarterKind(event.target.value as ConsentStarterKind);setConfirmReplace(false);}}><option value="TATTOO">Tattoo consent · adult</option><option value="PIERCING">Piercing consent · adult</option></select></label></div>
   <button type="button" className="starter-load" disabled={busy||saving||!artistId||!brand.trim()} onClick={()=>loadStarter()}>Use consent template</button>
   {confirmReplace&&<div className="starter-replace" role="status"><p>Replace your current unsaved draft with this template?</p><button type="button" onClick={()=>loadStarter(true)}>Replace draft</button><button type="button" onClick={()=>setConfirmReplace(false)}>Keep editing</button></div>}
   {preparedFor&&<p>Draft prepared for <strong>{preparedFor.artistName}</strong> at <strong>{preparedFor.brand}</strong>.</p>}
   {bindingChanged&&<p role="alert">Artist or brand changed. Reload the template before saving so the form uses the correct names.</p>}
   <details><summary>About these starters</summary><p>These editable examples cover procedure details, risk acknowledgment, voluntary consent, questions, aftercare, and optional photo or apprentice permission. Review them for your services and local requirements before use. They include an optional photo ID element; select it to require an upload if your studio needs one. They do not include medical questionnaires, guardian signatures, or staff-only records.</p><p>Reference examples:</p><ul>{consentStarterReferences.map(reference=><li key={reference.url}><a href={reference.url} target="_blank" rel="noreferrer">{reference.name}</a></li>)}</ul></details>
  </section>
  <label>Audience<select value={audience} onChange={event=>setAudience(event.target.value)}><option value="ADULT">Adult</option><option value="ANY">Any age</option><option value="MINOR">Minor / guardian</option></select></label>
  <p>Use wording approved for your studio, services, and local requirements. For minors, include the appropriate guardian wording. Photo ID uploads can be optional or required. Medical questionnaires are not included, and signing does not opt a client into SMS.</p>
  <QuestionBuilder fields={fields} onChange={setFields} name={name} onNameChange={setName} body={body} onBodyChange={setBody}/>
  <button disabled={busy||saving||!artistId||bindingChanged}>{saving?'Saving…':'Create form'}</button>{message&&<p role="status">{message}</p>}
 </form>;
}
