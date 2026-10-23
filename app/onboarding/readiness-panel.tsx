'use client';

import { useEffect, useState } from 'react';
import { buildOnboardingReadiness } from '@/packages/onboarding/readiness';
import { setupStages, visibleStageChecks, setupSettingsHref, stageComplete, wizardStage } from '@/packages/onboarding/wizard';

type Readiness = ReturnType<typeof buildOnboardingReadiness>;
const panel = { background: '#fff', border: '1px solid #e5e0da', borderRadius: 16, padding: 'clamp(18px, 4vw, 30px)', marginTop: 20 };
const button = { display: 'inline-block', border: '1px solid #d8d8d8', borderRadius: 24, padding: '11px 18px', background: '#fff', color: '#181716', font: 'inherit', fontWeight: 600, textDecoration: 'none', cursor: 'pointer' };
const statusLabels = { COMPLETE: 'Complete', IN_PROGRESS: 'Setup needed', NOT_STARTED: 'Not started', BLOCKED: 'Needs attention', OPTIONAL: 'Optional' };

export function ReadinessPanel({ onSmsSetup }: { onSmsSetup: () => void }) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const restore = () => setIndex(wizardStage(new URLSearchParams(window.location.search).get('step')));
    restore();
    window.addEventListener('popstate', restore);
    const update = () => setRefresh(value => value + 1);
    window.addEventListener('focus', update);
    return () => { window.removeEventListener('popstate', restore); window.removeEventListener('focus', update); };
  }, []);

  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    fetch('/api/onboarding/readiness', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Unable to load studio setup.');
        if (current) setReadiness(body.readiness as Readiness);
      })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'Unable to load studio setup.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [refresh]);

  function navigate(next: number) {
    const url = new URL(window.location.href);
    url.searchParams.set('step', setupStages[next].id);
    window.history.pushState({}, '', url);
    setIndex(next);
  }

  const stage = setupStages[index];
  const completed = readiness ? setupStages.filter(item => stageComplete(item, readiness.steps)).length : 0;
  return <section style={panel} aria-label="Guided studio setup">
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <strong>Step {index + 1} of {setupStages.length}</strong>
      <span style={{ color: '#6f6b66' }}>{completed} of {setupStages.length} sections ready</span>
    </div>
    <nav aria-label="Setup steps" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
      {setupStages.map((item, position) => <button key={item.id} onClick={() => navigate(position)} aria-current={position === index ? 'step' : undefined} style={{ ...button, background: position === index ? '#181716' : '#f5f5f5', color: position === index ? '#fff' : '#181716', borderColor: 'transparent', fontSize: 13 }}>
        {readiness && stageComplete(item, readiness.steps) ? '✓ ' : `${position + 1}. `}{item.title}
      </button>)}
    </nav>
    <div role="progressbar" aria-label="Studio setup readiness" aria-valuemin={0} aria-valuemax={5} aria-valuenow={completed} style={{ height: 6, background: '#ededed', borderRadius: 4, marginTop: 20 }}><div style={{ height: '100%', width: `${completed * 20}%`, background: '#181716', borderRadius: 4 }} /></div>
    <h2 style={{ fontSize: 28, marginBottom: 8 }}>{stage.title}</h2>
    <p style={{ color: '#6f6b66', lineHeight: 1.6 }}>{stage.description}</p>
    {loading && <p role="status">Checking saved settings…</p>}
    {error && <div role="alert"><p>{error}</p><button style={button} onClick={() => setRefresh(value => value + 1)}>Try again</button></div>}
    {readiness && !error && <>
      <p style={{ color: '#6f6b66', fontSize: 13 }}>Save your changes on each setup page, then return to this step. Progress updates from your saved settings.</p>
      {index === 1 && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0' }}><a href={setupSettingsHref('/settings/team', stage.id)} style={button}>Manage artists & apprentices →</a><a href={setupSettingsHref('/?view=Calendar', stage.id)} style={button}>Open Maia calendar →</a></div>}
      {index === 2 && <p style={{ background: '#f5f5f5', padding: 14, borderRadius: 10, lineHeight: 1.6 }}>Maia’s Stripe Connect checkout is currently available for sandbox testing. Live card payments and physical Tap to Pay are not available yet. Manual Venmo deposits require artist confirmation.</p>}
      <div style={{ display: 'grid', gap: 14 }}>{visibleStageChecks(stage, readiness.steps).map(check => <article key={check.id} style={{ borderTop: '1px solid #e8e8e8', paddingTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><strong>{check.title}</strong><span style={{ fontSize: 12, color: check.status === 'COMPLETE' ? '#2f7651' : '#6f6b66' }}>{statusLabels[check.status]}</span></div>
        <p style={{ color: '#6f6b66', lineHeight: 1.5, fontSize: 14 }}>{check.description}</p>
        {check.blockers.length > 0 && <ul style={{ color: '#8f2f22', fontSize: 13 }}>{[...new Set(check.blockers)].map(blocker => <li key={blocker}>{blocker}</li>)}</ul>}
        {check.id === 'sms' ? <a href="#sms-setup" onClick={onSmsSetup} style={button}>Set up SMS</a> : <a href={setupSettingsHref(check.href, stage.id)} style={button}>{check.status === 'COMPLETE' ? 'Review settings' : 'Open setup'} →</a>}
      </article>)}</div>
      {index === 4 && <div style={{ marginTop: 20, padding: 16, borderRadius: 10, background: '#f5f5f5' }}><strong>{readiness.readyForCoreGoLive ? 'Core receptionist checks passed' : 'Finish the remaining checks before automatic replies'}</strong><p style={{ lineHeight: 1.5 }}>Booking: {readiness.booking.status.replaceAll('_', ' ')} · SMS: {readiness.sms.status.replaceAll('_', ' ')} · Social: {readiness.social.status.replaceAll('_', ' ')}</p><p style={{ fontSize: 13 }}>Completing this wizard does not activate messaging, purchase a number, or change conversation Auto/Draft modes.</p></div>}
    </>}
    <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, borderTop: '1px solid #e8e8e8', marginTop: 24, paddingTop: 20 }}>
      <button style={button} disabled={index === 0} onClick={() => navigate(index - 1)}>Back</button>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{index < setupStages.length - 1 ? <><button style={button} onClick={() => navigate(index + 1)}>Skip for now</button><button style={{ ...button, background: '#181716', color: '#fff' }} onClick={() => navigate(index + 1)}>Continue</button></> : <a href="/" style={{ ...button, background: '#181716', color: '#fff' }}>Return to dashboard</a>}</div>
    </footer>
    <p style={{ fontSize: 12, color: '#6f6b66', marginBottom: 0 }}>Continue and Skip only move between steps. They do not mark unfinished setup as complete.</p>
  </section>;
}
