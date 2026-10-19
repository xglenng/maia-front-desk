'use client';
import { useEffect, useState } from 'react';
type Artist = { id: string; display_name: string; studio: string; aiRuns: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number | null; smsMessages: number; estimatedSmsSegments: number; mmsMessages: number };
export default function UsagePage() {
  const [month,setMonth] = useState(new Date().toISOString().slice(0,7));
  const [platform,setPlatform] = useState(false);
  const [admin,setAdmin] = useState(false);
  const [rows,setRows] = useState<Artist[]>([]);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    fetch(`/api/usage?month=${encodeURIComponent(month)}&scope=${platform?'platform':'studio'}`, { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setRows(data.artists); setAdmin(data.platformAdmin); }).catch(error => { if(error.name !== 'AbortError') setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[month,platform]);
  return <main style={{maxWidth:1100,margin:'auto',padding:24}}><a href="/settings">← Settings</a><h1>Usage dashboard</h1><p>Calendar month in UTC. Reporting only; no usage limits or extra charges are applied.</p><label>Month <input type="month" value={month} onChange={event=>setMonth(event.target.value)}/></label>{admin && <label style={{marginLeft:16}}><input type="checkbox" checked={platform} onChange={event=>setPlatform(event.target.checked)}/> All studios</label>}
    <p>SMS segments are text-based estimates, excluding known failed sends. MMS is counted separately. Provider invoices may differ. AI costs use configured rates and exclude discounts; “Unavailable” means rates or token data are missing.</p>
    {error?<p role="alert">{error}</p>:loading?<p role="status">Loading usage…</p>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:16}}>{rows.map(row=><section key={row.id} style={{border:'1px solid #ddd',borderRadius:12,padding:20,background:'#fff'}}><h2>{row.display_name}</h2><p>{row.studio}</p><dl>{Object.entries({'AI runs (including drafts)':row.aiRuns,'Input tokens':row.inputTokens,'Output tokens':row.outputTokens,'Estimated AI cost (USD)':row.estimatedCostUsd===null?'Unavailable':`$${row.estimatedCostUsd.toFixed(4)}`,'SMS messages':row.smsMessages,'Estimated SMS segments':row.estimatedSmsSegments,'MMS messages':row.mmsMessages}).map(([label,value])=><div key={label} style={{display:'flex',justifyContent:'space-between',gap:12,marginBottom:10}}><dt>{label}</dt><dd style={{margin:0}}>{value}</dd></div>)}</dl></section>)}{!rows.length&&<p>No artists are available for your account.</p>}</div>}
  </main>;
}
