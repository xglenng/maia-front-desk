'use client';
import {useRef,useState} from 'react';
import QuestionBuilder from './question-builder';
import {nativeDefinition,type NativeDefinition,type NativeField} from '@/packages/waivers/forms';
type Content={name:string;audience:string;definition:NativeDefinition};
export type ConsentEditorState={form:Content&{id:string;artistId:string|null};publishedVersion:number;draft:(Content&{id:string;revision:number;baseVersion:number})|null;versions:Array<{id:string;version:number;name:string;createdAt:string}>;legacyReview:{unsigned:number;signedWithoutSnapshot:number}};
export default function ConsentEditor({initial,studioLogoId,onReload}:{initial:ConsentEditorState;studioLogoId:string|null;onReload:()=>Promise<void>}){
 const saved=initial.draft||initial.form;
 const [name,setName]=useState(saved.name),[audience,setAudience]=useState(saved.audience),[definition,setDefinition]=useState<NativeDefinition>(saved.definition);
 const [draft,setDraft]=useState(initial.draft),[savedContent,setSavedContent]=useState(JSON.stringify({name:saved.name,audience:saved.audience,definition:saved.definition}));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const nameInput=useRef<HTMLInputElement>(null);
 const dirty=JSON.stringify({name,audience,definition})!==savedContent;
 const blocked=Boolean(initial.legacyReview.unsigned||initial.legacyReview.signedWithoutSnapshot);
 const previewHref=`/waivers/consent/${initial.form.id}/preview?source=${draft?'draft':'published'}`;
 async function save(event:React.FormEvent){
  event.preventDefault();setBusy(true);setError('');setMessage('');
  try{
   const checked=nativeDefinition.safeParse(definition);if(!checked.success)throw Error(checked.error.issues[0]?.message||'Check the form definition.');
   const response=await fetch('/api/consent-versions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'SAVE_DRAFT',formId:initial.form.id,draftId:draft?.id||null,revision:draft?.revision||0,baseVersion:draft?.baseVersion??initial.publishedVersion,name,audience,definition:checked.data})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Draft could not be saved.');
   setDraft(data.draft);setName(data.draft.name);setAudience(data.draft.audience);setDefinition(data.draft.definition);setSavedContent(JSON.stringify({name:data.draft.name,audience:data.draft.audience,definition:data.draft.definition}));setMessage('Draft saved. Client links and published content are unchanged.');
  }catch(e){setError(e instanceof Error?e.message:'Unable to save draft.');}finally{setBusy(false);}
 }
 async function publish(){
  if(!draft||dirty||blocked||busy)return;
  setBusy(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/consent-versions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'PUBLISH',formId:initial.form.id,draftId:draft.id,revision:draft.revision})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to publish.');
   await onReload();
  }catch(e){setError(e instanceof Error?e.message:'Unable to publish.');}finally{setBusy(false);}
 }
 function signatureText(key:'signerLabel'|'signerNameLabel'|'signerAgreement',value:string){setDefinition(current=>{const next={...current};if(value)next[key]=value;else delete next[key];return next;});}
 return <form onSubmit={save} className="waiver-section native-create consent-version-editor" aria-busy={busy}>
  <div className="section-heading"><div><h2>Edit consent form</h2><p>{initial.publishedVersion?`Published version ${initial.publishedVersion}`:'Legacy current configuration'}{draft?` · Saved draft revision ${draft.revision}`:''}</p></div></div>
  <p className="waiver-notice">Changes apply to future requests. Previously sent and signed forms remain unchanged. Save a draft, preview it, then publish a new version.</p>
  {blocked&&<p role="alert" className="waiver-notice">Publication blocked: {initial.legacyReview.unsigned} unresolved legacy link(s) and {initial.legacyReview.signedWithoutSnapshot} signed record(s) without a verifiable snapshot need review. You can save and preview drafts. No historical content will be invented. Review issued links below Waivers &amp; forms and retained records in <a href="/waivers/archive">Signed forms</a>.</p>}
  <fieldset disabled={busy} style={{border:0,padding:0,minWidth:0}}>
   <label>Audience<select value={audience} onChange={event=>setAudience(event.target.value)}><option value="ADULT">Adult</option><option value="MINOR">Minor / guardian</option><option value="ANY">Any age</option></select></label>
   <p>Audience controls the default signer labels. Changing it does not rewrite your questions or custom signature wording; review both before publishing.</p>
   <QuestionBuilder fields={definition.fields||[]} onChange={fields=>setDefinition({...definition,fields:fields as NativeField[]})} name={name} onNameChange={setName} nameInput={nameInput} nameError={false} body={definition.body} onBodyChange={body=>setDefinition({...definition,body})} onUseTemplate={()=>{}} templateDisabled onPreview={()=>window.open(previewHref,'_blank','noopener,noreferrer')} previewDisabled={busy||dirty} previewLabel="Preview saved form" logoAssetId={definition.logoAssetId||null} availableLogoAssetId={studioLogoId} logoAvailable logoUrl={definition.logoAssetId||studioLogoId?`/api/public/studio-logo/${definition.logoAssetId||studioLogoId}`:null} onLogoChange={logoAssetId=>setDefinition(current=>{const next={...current};if(logoAssetId)next.logoAssetId=logoAssetId;else delete next.logoAssetId;return next;})} logoUpload={<p><a href="/settings/studio#studio-branding">Manage studio logo</a>. Saved versions retain their selected logo.</p>} minorSigner={audience==='MINOR'}/>
   <details><summary>Custom signature wording</summary><p>Leave blank to use the default wording for this audience.</p><label>Signer label<input maxLength={80} value={definition.signerLabel||''} onChange={e=>signatureText('signerLabel',e.target.value)}/></label><label>Signer name label<input maxLength={120} value={definition.signerNameLabel||''} onChange={e=>signatureText('signerNameLabel',e.target.value)}/></label><label>Signature agreement<textarea maxLength={300} value={definition.signerAgreement||''} onChange={e=>signatureText('signerAgreement',e.target.value)}/></label></details>
   <div className="consent-version-actions"><button type="submit" disabled={busy}>{busy?'Working…':'Save draft'}</button><button type="button" disabled={busy||!draft||dirty||blocked} onClick={()=>void publish()}>Publish new version</button>{!dirty&&<a className="request-row-action" href={previewHref} target="_blank" rel="noreferrer">Preview saved form</a>}</div>
  </fieldset>
  {dirty&&<p>Unsaved changes. Save the draft before previewing or publishing.</p>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <details><summary>Published version history</summary>{initial.versions.length?<ul>{initial.versions.map(version=><li key={version.id}>Version {version.version} · {version.name} · {new Date(version.createdAt).toLocaleString()} <a href={`/waivers/consent/${initial.form.id}/preview?versionId=${version.id}`} target="_blank" rel="noreferrer">Preview version {version.version}</a></li>)}</ul>:<p>No versioned publications yet. The legacy current configuration is not a historical issuance snapshot.</p>}</details>
 </form>;
}
