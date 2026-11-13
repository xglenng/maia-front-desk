'use client';
import {useEffect,useRef,useState} from 'react';

type LogoState={assetId:string|null;url:string|null};
export default function StudioLogoSetting({compact=false}:{compact?:boolean}){
 const [logo,setLogo]=useState<LogoState>({assetId:null,url:null});
 const [file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [loading,setLoading]=useState(true);
 const [loaded,setLoaded]=useState(false);
 const fileInput=useRef<HTMLInputElement>(null);
 async function load(){
  const response=await fetch('/api/studio/logo',{cache:'no-store'}),data=await response.json();
  if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Unable to load studio logo.');
  setLogo(data);setLoaded(true);
 }
 async function loadLogo(){
  setLoading(true);setError('');
  try{await load();}catch(reason){setError(reason instanceof Error?reason.message:'Unable to load studio logo.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{void loadLogo();},[]);
 async function save(selectedFile=file){
  if(!selectedFile||busy)return;
  if(!['image/jpeg','image/png','image/webp'].includes(selectedFile.type)||!selectedFile.size||selectedFile.size>2*1024*1024){
   setMessage('');setError('Choose a JPEG, PNG, or WebP logo no larger than 2 MB.');return;
  }
  setBusy(true);setError('');setMessage('');
  try{
   const payload=new FormData();payload.set('logo',selectedFile);
   const response=await fetch('/api/studio/logo',{method:'POST',body:payload}),data=await response.json();
   if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Unable to save studio logo.');
   setLogo(data);setFile(null);setMessage(compact?'Logo saved.':'Studio logo saved.');
  }catch(reason){setError(reason instanceof Error?reason.message:'Unable to save studio logo.');}
  finally{setBusy(false);}
 }
 async function remove(){
  if(busy)return;
  setBusy(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/studio/logo',{method:'DELETE'}),data=await response.json();
   if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Unable to remove studio logo.');
   setLogo({assetId:null,url:null});setFile(null);setMessage('Studio logo removed. Existing signed forms keep their saved version.');
  }catch(reason){setError(reason instanceof Error?reason.message:'Unable to remove studio logo.');}
  finally{setBusy(false);}
 }
 if(compact)return <div style={{border:'1px solid #e4dfda',borderRadius:10,padding:16,marginTop:16,minWidth:0}}>
  <h3 style={{margin:'0 0 8px',fontSize:16}}>Business logo <span style={{fontWeight:400}}> (optional)</span></h3>
  <p style={{color:'#706b66',fontSize:14,lineHeight:1.5}}>Use your studio logo on new consent forms. You can add or replace it later; signed forms keep their original logo.</p>
  {logo.url&&<img src={logo.url} alt="Current business logo" style={{display:'block',maxWidth:'100%',maxHeight:160,objectFit:'contain',margin:'12px 0'}}/>}
  <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy||!loaded} onChange={event=>{const selected=event.target.files?.[0]||null;event.target.value='';if(selected){setFile(selected);void save(selected);}}}/>
  <div style={{display:'flex',flexWrap:'wrap',gap:10,marginBottom:12}}>
   <button type="button" style={logoButton} disabled={busy||!loaded} aria-describedby={error?'business-logo-error':'business-logo-help'} onClick={()=>fileInput.current?.click()}>{busy?'Uploading…':logo.assetId?'Replace logo':'Upload logo'}</button>
   {error&&file&&!busy&&<button type="button" style={removeButton} onClick={()=>void save(file)}>Retry upload</button>}
   {error&&!loaded&&!loading&&<button type="button" style={removeButton} onClick={()=>void loadLogo()}>Retry loading logo</button>}
  </div>
  <p id="business-logo-help" style={{fontSize:13,color:'#706b66',marginBottom:0}}>JPEG, PNG, or WebP; up to 2 MB.</p>
  {loading&&<p role="status">Loading logo…</p>}{message&&<p role="status">{message}</p>}{error&&<p id="business-logo-error" role="alert" style={{color:'#9b2f20'}}>{error}</p>}
 </div>;
 return <section id="studio-branding" style={{border:'1px solid #e4dfda',borderRadius:8,padding:18,background:'#fff',marginTop:16,scrollMarginTop:100}}>
  <h2 style={{marginTop:0}}>Studio logo</h2>
  <p style={{color:'#706b66'}}>Add an optional logo to new Maia consent forms. Logo changes do not replace the version saved with signed forms.</p>
  {logo.url&&<img src={logo.url} alt="Current studio logo" style={{display:'block',maxWidth:'100%',maxHeight:180,objectFit:'contain',margin:'12px 0'}}/>}
  <label style={{display:'grid',gap:8,maxWidth:520,fontSize:13,fontWeight:600}}>Upload a logo (JPEG, PNG, or WebP; up to 2 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event=>setFile(event.target.files?.[0]||null)}/></label>
  <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}>
   <button type="button" disabled={!file||busy} onClick={()=>void save()} style={logoButton}>{busy?'Saving…':'Save logo'}</button>
   {logo.assetId&&<button type="button" disabled={busy} onClick={()=>void remove()} style={removeButton}>Remove logo</button>}
  </div>
  {message&&<p role="status">{message}</p>}{error&&<p role="alert" style={{color:'#9b2f20'}}>{error}</p>}
 </section>;
}
const logoButton={border:0,borderRadius:6,padding:'10px 15px',background:'#181716',color:'#fff',fontWeight:700,cursor:'pointer'};
const removeButton={border:'1px solid #ccc',borderRadius:6,padding:'9px 12px',background:'#fff',color:'#181716',fontWeight:600,cursor:'pointer'};
