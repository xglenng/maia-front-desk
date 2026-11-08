'use client';
import {useEffect,useRef,useState} from 'react';
import QuestionBuilder from './question-builder';
import {nativeDefinition,type NativeField} from '@/packages/waivers/forms';
import {buildConsentStarter,consentStarterReferences,type ConsentStarterKind} from '@/packages/waivers/consent-starters';

type ArtistProfile={id:string;name:string};
export default function NativeEditor({currentArtist,artistProfileCount,studioBrand,studioLogoAssetId,busy,onSaved}:{
 currentArtist:ArtistProfile|null;artistProfileCount:number;studioBrand:string;studioLogoAssetId:string|null;busy:boolean;onSaved:()=>Promise<void>;
}) {
 const [name,setName]=useState(''),[body,setBody]=useState(''),[audience,setAudience]=useState('ADULT');
 const [saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const [fields,setFields]=useState<NativeField[]>([]),[brand,setBrand]=useState('');
 const [logoSelected,setLogoSelected]=useState(false),[pickerOpen,setPickerOpen]=useState(false);
 const [preparedFor,setPreparedFor]=useState<{artistId:string;artistName:string;brand:string}|null>(null);
 useEffect(()=>{setBrand(current=>current||studioBrand);},[studioBrand]);
 const bindingChanged=Boolean(preparedFor&&(!currentArtist||preparedFor.artistId!==currentArtist.id||preparedFor.brand!==brand.trim()));
 function loadStarter(kind:ConsentStarterKind,starterBrand:string) {
  setMessage('');
  try {
   if(!currentArtist)throw Error('Ask the studio owner to create an artist profile and link it to your sign-in before creating a form.');
   const draft=buildConsentStarter(kind,starterBrand,currentArtist.name);
   setName(draft.name);setBody(draft.definition.body);setFields(draft.definition.fields||[]);setAudience(draft.audience);
   setBrand(starterBrand.trim());setPreparedFor({artistId:currentArtist.id,artistName:currentArtist.name,brand:starterBrand.trim()});setPickerOpen(false);
   setMessage('Editable template loaded. Review it for your studio and services before saving.');
  } catch(error) {return error instanceof Error?error.message:'Unable to load template.';}
 }
 async function save(event:React.FormEvent) {
  event.preventDefault();setSaving(true);setMessage('');
  try {
   if(!currentArtist)throw Error('Ask the studio owner to create an artist profile and link it to your sign-in before saving a form.');
   if(bindingChanged)throw Error('Reload the template for the signed-in artist and studio brand before saving.');
   const parsed=nativeDefinition.safeParse({body,fields,...(logoSelected&&studioLogoAssetId?{logoAssetId:studioLogoAssetId}:{})});
   if(!parsed.success)throw Error(parsed.error.issues[0]?.message||'Check your questions.');
   const response=await fetch('/api/waiver-integrations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ADD_NATIVE_FORM',name,definition:parsed.data,artistId:currentArtist.id,audience})});
   const data=await response.json();
   if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Check the form details.');
   setMessage('Maia form created. It is ready to assign to appointments.');
   setName('');setBody('');setFields([]);setLogoSelected(false);setPreparedFor(null);await onSaved();
  } catch(error) {setMessage(error instanceof Error?error.message:'Unable to save.');}
  finally {setSaving(false);}
 }
 if(!currentArtist)return <div className="waiver-card" role="alert"><h2>Artist profile needed</h2><p>{artistProfileCount>1?'More than one artist profile is linked to your sign-in. Ask the studio owner to resolve the profile before saving a form.':'No artist profile is linked to your sign-in in this studio. Ask the studio owner to create an artist profile and link it to your user before saving a consent form.'}</p></div>;
 return <form className="waiver-card" onSubmit={save}>
  <div className="card-title"><div><h2>Create a Maia form</h2><p>Start with a consent template or write your own. Clients read it and draw their signature.</p></div><span className="provider-pill">Maia hosted</span></div>
  <p>Artist profile: <strong>{currentArtist.name}</strong></p>
  {preparedFor&&<p>Draft prepared for <strong>{preparedFor.artistName}</strong> at <strong>{preparedFor.brand}</strong>.</p>}
  {bindingChanged&&<p role="alert">Studio brand changed. Reload the template before saving so its wording uses the current brand.</p>}
  <label>Audience<select value={audience} onChange={event=>setAudience(event.target.value)}><option value="ADULT">Adult</option><option value="ANY">Any age</option><option value="MINOR">Minor / guardian</option></select></label>
  <p>Use wording approved for your studio, services, and local requirements. For minors, include the appropriate guardian wording. Photo ID uploads can be optional or required. Medical questionnaires are not included, and signing does not opt a client into SMS.</p>
  <QuestionBuilder fields={fields} onChange={setFields} name={name} onNameChange={setName} body={body} onBodyChange={setBody} onUseTemplate={()=>setPickerOpen(true)} templateDisabled={busy||saving} logoAssetId={logoSelected?studioLogoAssetId:null} availableLogoAssetId={studioLogoAssetId} logoUrl={studioLogoAssetId?`/api/public/studio-logo/${studioLogoAssetId}`:null} onLogoChange={value=>setLogoSelected(Boolean(value))} minorSigner={audience==='MINOR'}/>
  {pickerOpen&&<TemplatePicker brand={brand} artistName={currentArtist.name} hasEdits={Boolean(name||body||fields.length||logoSelected||audience!=='ADULT')} onApply={loadStarter} onClose={()=>setPickerOpen(false)}/>}
  <button disabled={busy||saving}>{saving?'Saving…':'Create form'}</button>{message&&<p role="status">{message}</p>}
 </form>;
}

function TemplatePicker({brand,artistName,hasEdits,onApply,onClose}:{brand:string;artistName:string|undefined;hasEdits:boolean;onApply:(kind:ConsentStarterKind,brand:string)=>string|undefined;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [draftBrand,setDraftBrand]=useState(brand),[pending,setPending]=useState<ConsentStarterKind|null>(null),[error,setError]=useState('');
 useEffect(()=>{dialog.current?.showModal();},[]);
 function dismiss(){dialog.current?.close();onClose();}
 function apply(kind:ConsentStarterKind){const failure=onApply(kind,draftBrand);if(failure)setError(failure);else dialog.current?.close();}
 function choose(kind:ConsentStarterKind){if(hasEdits)setPending(kind);else apply(kind);}
 const title=(kind:ConsentStarterKind)=>kind==='TATTOO'?'Tattoo consent · adult':kind==='PIERCING'?'Piercing consent · adult':kind==='MINOR_TATTOO'?'Minor Tattoo Consent':'Minor Piercing Consent';
 return <dialog ref={dialog} className="template-picker" aria-labelledby="template-picker-title" onCancel={event=>{event.preventDefault();dismiss();}} onKeyDown={event=>{if(event.key==='Escape'&&!event.nativeEvent.isComposing){event.preventDefault();dismiss();}}}>
  <div className="template-picker-header"><h3 id="template-picker-title">Use a template</h3><button type="button" aria-label="Close template picker" onClick={dismiss}>✕</button></div>
  {error&&<p role="alert">{error}</p>}
  {pending?<div className="template-picker-confirm"><p>Replace your current unsaved draft with “{title(pending)}”?</p><div><button type="button" className="template-picker-primary" onClick={()=>apply(pending)}>Replace draft</button><button type="button" autoFocus onClick={dismiss}>Keep editing</button></div></div>:<>
   <p>Adult starters use your studio and artist’s names. Minor starters identify the parent or legal guardian as the signer. Each is an editable starting point for studio review; review and edit all wording before saving.</p>
   <label>Brand or studio name<input maxLength={160} value={draftBrand} onChange={event=>setDraftBrand(event.target.value)} placeholder="Your brand name"/></label>
   {!artistName&&<p role="status">Your artist profile must be linked before applying a template.</p>}
   {!draftBrand.trim()&&<p role="status">Enter a brand or studio name to apply a template.</p>}
   <div className="template-picker-options">
    <button type="button" disabled={!artistName||!draftBrand.trim()} onClick={()=>choose('TATTOO')}><strong>Tattoo consent · adult</strong><span>Adult tattoo procedure details, risks, aftercare, and consent.</span></button>
    <button type="button" disabled={!artistName||!draftBrand.trim()} onClick={()=>choose('PIERCING')}><strong>Piercing consent · adult</strong><span>Adult piercing procedure details, risks, aftercare, and consent.</span></button>
    <button type="button" disabled={!artistName||!draftBrand.trim()} onClick={()=>choose('MINOR_TATTOO')}><strong>Minor Tattoo Consent</strong><span>Editable starting point for studio review, including the minor’s details and parent or legal guardian consent and signature.</span></button>
    <button type="button" disabled={!artistName||!draftBrand.trim()} onClick={()=>choose('MINOR_PIERCING')}><strong>Minor Piercing Consent</strong><span>Editable starting point for studio review, including the minor’s details and parent or legal guardian consent and signature.</span></button>
   </div>
   <details><summary>About these starters</summary><p>These editable examples cover procedure details, risk acknowledgment, voluntary consent, questions, aftercare, and optional photo or apprentice permission. Review them for your services and local requirements before use. They include an optional photo ID element; select it to require an upload if your studio needs it. They do not include medical questionnaires or staff-only records.</p><p>Reference examples:</p><ul>{consentStarterReferences.map(reference=><li key={reference.url}><a href={reference.url} target="_blank" rel="noreferrer">{reference.name}</a></li>)}</ul></details>
  </>}
 </dialog>;
}
