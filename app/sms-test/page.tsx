'use client';
import { useState } from 'react';

export default function SmsTestPage() {
  const [org, setOrg] = useState(''); const [artist, setArtist] = useState(''); const [client, setClient] = useState('');
  const [body, setBody] = useState('Hey! I’m interested in booking a tattoo.'); const [result, setResult] = useState(''); const [loading, setLoading] = useState(false);
  async function send() {
    setLoading(true); setResult('');
    try { const r = await fetch('/api/twilio/send', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ organizationId: org, artistId: artist, clientId: client, body }) }); const d = await r.json(); setResult(r.ok ? `Sent. Twilio SID: ${d.sid}` : `Error: ${d.error || 'Request failed'}`); } catch (e) { setResult(`Error: ${e instanceof Error ? e.message : 'Request failed'}`); } finally { setLoading(false); }
  }
  return <main style={{maxWidth:760,margin:'40px auto',padding:24,fontFamily:'system-ui'}}><h1>SMS Test</h1><p>Use this to test outbound Twilio SMS after configuring your environment.</p><label>Organization ID<input value={org} onChange={e=>setOrg(e.target.value)} /></label><label>Artist ID<input value={artist} onChange={e=>setArtist(e.target.value)} /></label><label>Client ID<input value={client} onChange={e=>setClient(e.target.value)} /></label><label>Message<textarea value={body} onChange={e=>setBody(e.target.value)} rows={5}/></label><button disabled={loading} onClick={send}>{loading?'Sending…':'Send SMS'}</button>{result&&<pre style={{whiteSpace:'pre-wrap',marginTop:20}}>{result}</pre>}<style jsx>{`label{display:block;margin:16px 0;font-weight:600}input,textarea{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:10px;border:1px solid #ccc;border-radius:8px;font:inherit}button{padding:10px 16px;border:0;border-radius:8px;cursor:pointer}`}</style></main>;
}
