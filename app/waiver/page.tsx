'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function WaiverPage() {
  return <Suspense fallback={<main style={{ maxWidth: 760, margin: '40px auto', padding: 24, fontFamily: 'system-ui' }}>Loading waiver…</main>}><WaiverForm /></Suspense>;
}

function WaiverForm() {
  const params = useSearchParams();
  const [waiver, setWaiver] = useState<any>(null);
  const [signedName, setSignedName] = useState('');
  const [status, setStatus] = useState('Loading waiver…');
  const organizationId = params.get('organizationId') || '';
  const appointmentId = params.get('appointmentId') || '';
  const clientId = params.get('clientId') || '';
  const waiverTemplateId = params.get('waiverTemplateId') || '';
  const access = params.get('access') || '';

  useEffect(() => {
    const qs = '?' + new URLSearchParams({organizationId,appointmentId,clientId,waiverTemplateId,access});
    fetch(`/api/waivers${qs}`).then(r => r.json()).then(data => {
      const match = (data.waivers || []).find((w: any) => w.id === waiverTemplateId) || data.waivers?.[0];
      setWaiver(match);
      setStatus(match ? '' : 'No active waiver found.');
    }).catch(() => setStatus('Unable to load waiver.'));
  }, [organizationId, waiverTemplateId,appointmentId,clientId,access]);

  async function sign() {
    if (!signedName.trim() || !waiver) return;
    setStatus('Signing…');
    const res = await fetch('/api/waivers/sign', { method: 'POST', headers: { 'content-type': 'application/json', 'x-waiver-token':access }, body: JSON.stringify({ organizationId, appointmentId, clientId, waiverTemplateId: waiver.id, signedName }) });
    const data = await res.json();
    setStatus(res.ok ? 'Waiver signed successfully.' : (data.error || 'Unable to sign waiver.'));
  }

  return <main style={{ maxWidth: 760, margin: '40px auto', padding: 24, fontFamily: 'system-ui' }}>
    <h1>{waiver?.name || 'Tattoo Consent & Waiver'}</h1>
    {status && <p>{status}</p>}
    {waiver && <><p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{waiver.body}</p><label>Full legal name<input value={signedName} onChange={e => setSignedName(e.target.value)} style={{ display: 'block', width: '100%', padding: 12, margin: '8px 0 16px' }} /></label><button onClick={sign} disabled={!signedName.trim()} style={{ padding: '12px 18px' }}>Sign waiver</button></>}
  </main>;
}
