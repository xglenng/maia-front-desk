'use client';

import { useEffect, useState } from 'react';

type StepStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'BLOCKED' | 'OPTIONAL';
type Readiness = {
  core: { ready: boolean; blockers: string[] };
  booking: { status: string; ready: boolean; required: boolean; blockers: string[] };
  payments: { status: string; ready: boolean; required: boolean; depositServiceCount: number; blockers: string[] };
  sms: { status: string; readyToSend: boolean; requested: boolean; blockers: string[] };
  social: { status: string; ready: boolean; providers: string[] };
  waivers: { status: string; configured: boolean; internalCount: number; externalCount: number; providerConnections: number };
  steps: Array<{ id: string; title: string; description: string; status: StepStatus; requirement: string; href: string; blockers: string[] }>;
  readyForCoreMaia: boolean;
  readyForBooking: boolean;
  readyForPayments: boolean;
  readyForSms: boolean;
  readyForMeta: boolean;
};

const statusStyle: Record<StepStatus, { label: string; background: string; color: string }> = {
  COMPLETE: { label: 'Complete', background: '#e6f2ea', color: '#2f7651' },
  IN_PROGRESS: { label: 'In progress', background: '#f7efdf', color: '#8a5f18' },
  NOT_STARTED: { label: 'Not started', background: '#f0eeeb', color: '#625e59' },
  BLOCKED: { label: 'Blocked', background: '#f6e9e6', color: '#8f2f22' },
  OPTIONAL: { label: 'Optional', background: '#eef0f2', color: '#58616a' },
};
const panel = { background: '#fff', border: '1px solid #e5e0da', borderRadius: 12, padding: 20, marginTop: 16 };

export function ReadinessPanel() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    fetch('/api/onboarding/readiness', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load onboarding readiness.');
        if (current) setReadiness(body.readiness as Readiness);
      })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'Unable to load readiness.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);

  if (loading) return <section style={panel}><strong>Checking your saved configuration…</strong></section>;
  if (error || !readiness) return <section style={panel}><strong>Readiness unavailable</strong><p role="alert" style={{ color: '#8f2f22', marginBottom: 0 }}>{error || 'Unable to read studio readiness.'}</p></section>;

  const metrics = [
    { title: 'Booking', value: readiness.booking.status.replaceAll('_', ' '), note: readiness.booking.required ? 'Required only for booking' : 'Optional' },
    { title: 'Payments', value: readiness.payments.status.replaceAll('_', ' '), note: readiness.payments.required ? `${readiness.payments.depositServiceCount} deposit service(s)` : 'No payment integration needed' },
    { title: 'SMS', value: readiness.sms.status.replaceAll('_', ' '), note: readiness.sms.readyToSend ? 'A2P transport approved; per-client consent still applies' : 'Optional and not ready to send' },
    { title: 'Social', value: readiness.social.status.replaceAll('_', ' '), note: readiness.social.providers.join(', ') || 'Optional' },
  ];

  return <>
    <section style={{ ...panel, borderColor: readiness.readyForCoreMaia ? '#93bda2' : '#e5e0da' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div><h2 style={{ margin: 0, fontSize: 20 }}>Core Maia</h2><p style={{ color: '#6f6b66', marginBottom: 0 }}>Readiness is calculated from saved records, not a completed checkbox.</p></div>
        <strong style={{ padding: '8px 11px', borderRadius: 20, background: readiness.readyForCoreMaia ? '#e6f2ea' : '#f6e9e6', color: readiness.readyForCoreMaia ? '#2f7651' : '#8f2f22' }}>{readiness.readyForCoreMaia ? 'READY FOR CORE MAIA' : 'SETUP NEEDED'}</strong>
      </div>
      {readiness.core.blockers.length > 0 && <ul style={{ color: '#8f2f22' }}>{readiness.core.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>}
      <div style={metricGrid}>{metrics.map(metric => <div key={metric.title} style={metricStyle}><span style={{ color: '#706b66', fontSize: 12 }}>{metric.title}</span><strong>{metric.value}</strong><small style={{ color: '#706b66' }}>{metric.note}</small></div>)}</div>
      {readiness.sms.status === 'REJECTED' && <p style={{ color: '#8f2f22', marginBottom: 0 }}>SMS requires compliance review. Core Maia can remain available for other channels.</p>}
    </section>
    <section style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><div><h2 style={{ margin: 0, fontSize: 18 }}>Setup checklist</h2><p style={{ color: '#706b66', marginBottom: 0 }}>Open the existing configuration page for each item. Optional integrations do not block core Maia.</p></div><a href="/ai-test" style={linkButton}>Test Maia</a></div>
      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>{readiness.steps.map(step => {
        const presentation = statusStyle[step.status];
        return <article key={step.id} style={stepRow}>
          <div><strong>{step.title}</strong><p style={{ color: '#706b66', fontSize: 13, margin: '4px 0 0' }}>{step.description}</p>{step.blockers.map(blocker => <p key={blocker} style={{ color: '#8f2f22', fontSize: 12, margin: '4px 0 0' }}>{blocker}</p>)}</div>
          <div style={{ textAlign: 'right' }}><span style={{ display: 'inline-block', padding: '5px 8px', borderRadius: 16, background: presentation.background, color: presentation.color, fontSize: 11, fontWeight: 800 }}>{presentation.label}</span><small style={{ display: 'block', marginTop: 5, color: '#706b66', whiteSpace: 'nowrap' }}>{step.requirement}</small><a href={step.href} style={{ display: 'block', marginTop: 7, color: '#8f2f22', fontSize: 12 }}>Open →</a></div>
        </article>;
      })}</div>
    </section>
  </>;
}

const metricGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 10, marginTop: 18 };
const metricStyle = { display: 'grid', gap: 5, padding: 12, border: '1px solid #eeeae5', borderRadius: 8 };
const stepRow = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 14, borderTop: '1px solid #eeeae5', padding: '12px 0' };
const linkButton = { display: 'inline-block', border: '1px solid #cfc8c1', borderRadius: 7, padding: '9px 13px', background: '#fff', color: '#181716', fontWeight: 700, textDecoration: 'none' };
