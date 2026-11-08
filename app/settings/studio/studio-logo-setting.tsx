'use client';
import {useEffect,useState} from 'react';

type LogoState={assetId:string|null;url:string|null};
export default function StudioLogoSetting(){
 const [logo,setLogo]=useState<LogoState>({assetId:null,url:null});
 const [file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 async function load(){
  const response=await fetch('/api/studio/logo',{cache:'no-store'}),data=await response.json();
  if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Unable to load studio logo.');
  setLogo(data);
 }
 useEffect(()=>{void load().catch(reason=>setError(reason instanceof Error?reason.message:'Unable to load studio logo.'));},[]);
 async function save(){
  if(!file||busy)return;
  setBusy(true);setError('');setMessage('');
  try{
   const payload=new FormData();payload.set('logo',file);
   const response=await fetch('/api/studio/logo',{method:'POST',body:payload}),data=await response.json();
   if(!response.ok)throw Error(typeof data.error==='string'?data.error:'Unable to save studio logo.');
   setLogo(data);setFile(null);setMessage('Studio logo saved.');await load();
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
