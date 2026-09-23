'use client';
import {useState, FormEvent} from 'react';
export default function Login(){
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');
    try{const data=Object.fromEntries(new FormData(e.currentTarget));const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
      if(res.ok)window.location.assign('/');else setError((await res.json()).error);
    }catch{setError('Unable to connect. Please try again.');}finally{setBusy(false);}}
  return <main style={{maxWidth:420,margin:'70px auto',padding:24}}><h1>Sign in to INKFLOW</h1><p>Use the studio ID and account provided by your administrator.</p><form onSubmit={submit} style={{display:'grid',gap:16}}>
    <label>Studio ID<input name="organizationId" required style={{display:'block',width:'100%',padding:10}} /></label>
    <label>Email<input name="email" type="email" autoComplete="username" required style={{display:'block',width:'100%',padding:10}} /></label>
    <label>Password<input name="password" type="password" autoComplete="current-password" required style={{display:'block',width:'100%',padding:10}} /></label>
    <button disabled={busy} style={{padding:12}}>{busy?'Signing in…':'Sign in'}</button><p role="alert">{error}</p></form></main>;
}
