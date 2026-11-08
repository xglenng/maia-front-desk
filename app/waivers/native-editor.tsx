'use client';
import {useEffect,useRef,useState} from 'react';
import QuestionBuilder from './question-builder';
import {nativeDefinition,type NativeField} from '@/packages/waivers/forms';
import {buildConsentStarter,consentStarterReferences,type ConsentStarterKind} from '@/packages/waivers/consent-starters';

export default function NativeEditor({artists,studioBrand,busy,onSaved}:{
 artists:{id:string;name:string}[];studioBrand:string;busy:boolean;onSaved:()=>Promise<void>;
}) {
 const [name,setName]=useState(''),[body,setBody]=useState(''),[artistId,setArtistId]=useState('');
 const [audience,setAudience]=useState('ADULT'),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const [fields,setFields]=useState<NativeField[]>([]),[brand,setBrand]=useState('');
 const [pickerOpen,setPickerOpen]=useState(false);
 const [preparedFor,setPreparedFor]=useState<{artistId:string;artistName:string;brand:string}|null>(null);
 useEffect(()=>{setBrand(current=>current||studioBrand);},[studioBrand]);
 const bindingChanged=Boolean(preparedFor&&(preparedFor.artistId!==artistId||preparedFor.brand!==brand.trim()));
 function loadStarter(kind:ConsentStarterKind,starterBrand:string) {
  setMessage('');
  try {
   const artist=artists.find(row=>row.id===artistId);
   if(!artist)throw Error('Choose an artist before loading a template.');
   const draft=buildConsentStarter(kind,starterBrand,artist.name);
   setName(draft.name);setBody(draft.definition.body);setFields(draft.definition.fields||[]);setAudience('ADULT');
   setBrand(starterBrand.trim());setPreparedFor({artistId,artistName:artist.name,brand:starterBrand.trim()});setPickerOpen(false);
   setMessage('Template loaded into your draft. Review and edit it, then click Create form to save.');
  } catch(error) {return error instanceof Error?error.message:'Unable to load template.';}
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
   setName('');setBody('');setFields([]);setPreparedFor(null);await onSaved();
  } catch(error) {setMessage(error instanceof Error?error.message:'Unable to save.');}
  finally {setSaving(false);}
 }
 return <form className="waiver-card" onSubmit={save}>
  <div className="card-title"><div><h2>Create a Maia form</h2><p>Start with a consent template or write your own. Clients read it and draw their signature.</p></div><span className="provider-pill">Maia hosted</span></div>
  <label>Artist<select required value={artistId} onChange={event=>setArtistId(event.target.value)}><option value="">Choose an artist</option>{artists.map(artist=><option key={artist.id} value={artist.id}>{artist.name}</option>)}</select></label>
  {preparedFor&&<p>Draft prepared for <strong>{preparedFor.artistName}</strong> at <strong>{preparedFor.brand}</strong>.</p>}
  {bindingChanged&&<p role="alert">Artist changed. Reload the template before saving so the form uses the correct names.</p>}
  <label>Audience<select value={audience} onChange={event=>setAudience(event.target.value)}><option value="ADULT">Adult</option><option value="ANY">Any age</option><option value="MINOR">Minor / guardian</option></select></label>
  <p>Use wording approved for your studio, services, and local requirements. For minors, include the appropriate guardian wording. Photo ID uploads can be optional or required. Medical questionnaires are not included, and signing does not opt a client into SMS.</p>
  <QuestionBuilder fields={fields} onChange={setFields} name={name} onNameChange={setName} body={body} onBodyChange={setBody} onUseTemplate={()=>setPickerOpen(true)} templateDisabled={busy||saving}/>
  {pickerOpen&&<TemplatePicker brand={brand} artistName={artists.find(artist=>artist.id===artistId)?.name} hasEdits={Boolean(name||body||fields.length||audience!=='ADULT')} onApply={loadStarter} onClose={()=>setPickerOpen(false)}/>}
  <button disabled={busy||saving||!artistId||bindingChanged}>{saving?'Saving…':'Create form'}</button>{message&&<p role="status">{message}</p>}
 </form>;
}

function TemplatePicker({brand,artistName,hasEdits,onApply,onClose}:{brand:string;artistName:string|undefined;hasEdits:boolean;onApply:(kind:ConsentStarterKind,brand:string)=>string|undefined;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [draftBrand,setDraftBrand]=useState(brand),[pending,setPending]=useState<ConsentStarterKind|null>(null),[error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();},[]);
 function dismiss(){dialog.current?.close();onClose();}
 function apply(kind:ConsentStarterKind){const failure=onApply(kind,draftBrand);if(failure)setError(failure);else dialog.current?.close();}
 function choose(kind:ConsentStarterKind){
  if(hasEdits)setPending(kind);
  else apply(kind);
 }
 return <dialog ref={dialog} className="template-picker" aria-labelledby="template-picker-title" onCancel={event=>{event.preventDefault();dismiss();}} onKeyDown={event=>{if(event.key==='Escape'&&!event.nativeEvent.isComposing){event.preventDefault();dismiss();}}}>
  <div className="template-picker-header"><h3 id="template-picker-title">Use a template</h3><button type="button" aria-label="Close template picker" onClick={dismiss}>✕</button></div>
  {error&&<p role="alert">{error}</p>}
  {pending?<div className="template-picker-confirm"><p>Replace your current unsaved draft with the {pending==='TATTOO'?'tattoo':'piercing'} template?</p><div><button type="button" className="template-picker-primary" onClick={()=>apply(pending)}>Replace draft</button><button type="button" autoFocus onClick={dismiss}>Keep editing</button></div></div>:<>
   <p>Adult starters use your studio and selected artist’s names. Review and edit the wording before saving.</p>
   <label>Brand or studio name<input maxLength={160} value={draftBrand} onChange={event=>setDraftBrand(event.target.value)} placeholder="Your brand name"/></label>
   {!artistName&&<p role="status">Choose an artist before applying a template.</p>}
   {!draftBrand.trim()&&<p role="status">Enter a brand or studio name to apply a template.</p>}
   <div className="template-picker-options">
    <button type="button" disabled={!artistName||!draftBrand.trim()} onClick={()=>choose('TATTOO')}><strong>Tattoo consent · adult</strong><span>Procedure details, risks, aftercare, and consent for tattoo clients.</span></button>
    <button type="button" disabled={!artistName||!draftBrand.trim()} onClick={()=>choose('PIERCING')}><strong>Piercing consent · adult</strong><span>Procedure details, risks, aftercare, and consent for piercing clients.</span></button>
   </div>
   <details><summary>About these starters</summary><p>These editable examples cover procedure details, risk acknowledgment, voluntary consent, questions, aftercare, and optional photo or apprentice permission. Review them for your services and local requirements before use. They include an optional photo ID element; select it to require an upload if your studio needs one. They do not include medical questionnaires, guardian signatures, or staff-only records.</p><p>Reference examples:</p><ul>{consentStarterReferences.map(reference=><li key={reference.url}><a href={reference.url} target="_blank" rel="noreferrer">{reference.name}</a></li>)}</ul></details>
  </>}
 </dialog>;
}
