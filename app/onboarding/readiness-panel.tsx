'use client';

import { useEffect, useRef, useState } from 'react';
import { buildOnboardingReadiness } from '@/packages/onboarding/readiness';
import { availableSetupScreens, setupScreen, setupStages, setupTaskHref, stageComplete, visibleStageChecks } from '@/packages/onboarding/wizard';
import type { IndustrySettingsValue } from '@/packages/onboarding/industry';
import { useSession } from '@/components/session-gate';
import IndustrySettings from '@/components/industry-settings';
import styles from './setup-wizard.module.css';

type Readiness = ReturnType<typeof buildOnboardingReadiness>;
const statusLabels = { COMPLETE: 'Complete', IN_PROGRESS: 'Setup needed', NOT_STARTED: 'Not started', BLOCKED: 'Needs attention', OPTIONAL: 'Optional' };

export function ReadinessPanel({ onSmsSetup, onScreenChange }: { onSmsSetup: () => void; onScreenChange?: () => void }) {
  const user = useSession();
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selection, setSelection] = useState<{ stage: string | null; item: string | null }>({ stage: 'studio', item: null });
  const [refresh, setRefresh] = useState(0);
  const [industry, setIndustry] = useState<IndustrySettingsValue | null>(null);
  const [formCapabilities, setFormCapabilities] = useState({ consent: true, request: true });
  const dirty = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const restore = () => {
      const query = new URLSearchParams(window.location.search);
      setSelection({ stage: query.get('step'), item: query.get('item') });
      onScreenChange?.();
    };
    restore();
    const update = () => setRefresh(value => value + 1);
    window.addEventListener('popstate', restore);
    window.addEventListener('focus', update);
    window.addEventListener('maia-industry-settings', update);
    return () => { window.removeEventListener('popstate', restore); window.removeEventListener('focus', update); window.removeEventListener('maia-industry-settings', update); };
  }, []);

  useEffect(() => {
    let current = true;
    setLoading(true); setError('');
    Promise.all([fetch('/api/onboarding/readiness', { cache: 'no-store' }), fetch('/api/studio/industry', { cache: 'no-store' })])
      .then(async ([response, industryResponse]) => {
        const [body, industryBody] = await Promise.all([response.json(), industryResponse.json()]);
        if (!response.ok) throw Error(body.error || 'Unable to load studio setup.');
        if (!industryResponse.ok) throw Error(industryBody.error || 'Unable to load business preferences.');
        if (current) {
          setReadiness(body.readiness as Readiness);
          if (!dirty.current) setIndustry(industryBody.settings);
          setFormCapabilities({ consent: industryBody.settings.consentFormsEnabled, request: industryBody.settings.requestFormsEnabled });
        }
      }).catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'Unable to load studio setup.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [refresh]);

  const screens = availableSetupScreens(formCapabilities);
  const screen = setupScreen(selection.stage, selection.item, formCapabilities);
  const index = screens.findIndex(item => item.id === screen.id);
  const stage = setupStages.find(item => item.id === screen.stage)!;
  const check = readiness && visibleStageChecks(stage, readiness.steps).find(item => item.id === screen.id);
  const completed = readiness ? setupStages.filter(item => stageComplete(item, readiness.steps)).length : 0;
  const taskHref = (href: string) => setupTaskHref(href, screen.stage, screen.id);

  async function navigate(next: typeof screens[number], save = true) {
    if (saving) return;
    setActionError('');
    if (save && (dirty.current || screen.id === 'specialties') && industry && user?.role === 'OWNER') {
      setSaving(true);
      try {
        const response = await fetch('/api/studio/industry', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(industry) });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || 'Unable to save your business specialties.');
        dirty.current = false;
        setIndustry(data.settings);
        setFormCapabilities({ consent: data.settings.consentFormsEnabled, request: data.settings.requestFormsEnabled });
        window.dispatchEvent(new Event('maia-industry-settings'));
      } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Unable to save. Please try again.'); setSaving(false); return; }
      setSaving(false);
    }
    const url = new URL(window.location.href);
    url.searchParams.set('step', next.stage); url.searchParams.set('item', next.id);
    window.history.pushState({}, '', url);
    setSelection({ stage: next.stage, item: next.id });
    onScreenChange?.();
    title.current?.focus({ preventScroll: true });
    title.current?.scrollIntoView({ block: 'start' });
  }

  return <section className={styles.wizard} aria-label="Guided studio setup">
    <div className={styles.progressLabel}><strong>Step {index + 1} of {screens.length}</strong><span>{completed} of {setupStages.length} sections ready</span></div>
    <nav className={styles.steps} aria-label="Setup sections">{setupStages.map(item => <button type="button" key={item.id} disabled={saving} aria-current={item.id === screen.stage ? 'step' : undefined} onClick={() => void navigate(screens.find(entry => entry.stage === item.id)!)}>{item.title}</button>)}</nav>
    <div className={styles.progress} role="progressbar" aria-label="Studio setup readiness" aria-valuemin={0} aria-valuemax={setupStages.length} aria-valuenow={completed}><span style={{ width: `${completed / setupStages.length * 100}%` }}/></div>
    <header className={styles.heading}><span>{stage.title}</span><h2 ref={title} tabIndex={-1}>{screen.title}</h2><p>{screen.description}</p></header>
    {loading && <p role="status">Checking saved settings…</p>}
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>Try again</button></div>}
    {readiness && !error && <>
      {screen.id === 'specialties' && industry && <IndustrySettings mode="embedded" compact settings={industry} onChange={next => { dirty.current = true; setIndustry(next); }} disabled={user?.role !== 'OWNER' || saving} saveVersion={0}/>}
      {screen.id === 'waivers' ? <div className={styles.choices}>
        <a className={styles.choice} href={taskHref('/waivers/new?setup=consent')}><span className={styles.choiceIcon} aria-hidden="true">+</span><span><strong>Create a new consent form</strong><small>Start with an industry-specific template or build your own. Review and edit it before saving.</small></span><span aria-hidden="true">›</span></a>
        <a className={styles.choice} href={taskHref('/waivers?setup=connect')}><span className={styles.choiceIcon} aria-hidden="true">↗</span><span><strong>Connect an existing form</strong><small>Use a hosted form link or connect Jotform. Your original form stays with its provider.</small></span><span aria-hidden="true">›</span></a>
        {check?.status === 'COMPLETE' && <p className={styles.complete}>Consent setup is already complete. <a href={taskHref('/waivers')}>Review saved forms</a></p>}
      </div> : screen.id === 'requests' ? <div className={styles.choices}><a className={styles.choice} href={taskHref('/waivers/new?setup=request')}><span className={styles.choiceIcon} aria-hidden="true">+</span><span><strong>Create a request form</strong><small>Choose a template for your business specialties. Requests go to staff for review.</small></span><span aria-hidden="true">›</span></a><a href={taskHref('/waivers')}>Review existing request forms</a></div> : check && <article className={styles.task}>
        <div className={styles.taskTitle}><strong>{check.title}</strong><span>{statusLabels[check.status]}</span></div>
        <p>{check.description}</p>
        {check.blockers.length > 0 && <ul>{[...new Set(check.blockers)].map(blocker => <li key={blocker}>{blocker}</li>)}</ul>}
        {check.id === 'go_live' ? <><p>{readiness.readyForCoreGoLive ? 'Your core setup is ready.' : 'Finish the required settings shown above.'}</p><div className={styles.actions}>{readiness.steps.filter(item => ['studio_profile', 'artist', 'services', 'receptionist'].includes(item.id) && item.status !== 'COMPLETE').map(item => <a key={item.id} href={taskHref(item.href)}>Fix {item.title.toLowerCase()}</a>)}</div></> : check.id === 'sms' ? <a href="#sms-setup" onClick={onSmsSetup}>Open optional SMS setup</a> : <a href={taskHref(check.href)}>{check.id === 'test' ? 'Preview replies' : check.status === 'COMPLETE' ? 'Review settings' : 'Open setup'}</a>}
      </article>}
    </>}
    {actionError && <p role="alert" className={styles.error}>{actionError}</p>}
    <footer className={styles.footer}><button type="button" disabled={index === 0 || saving} onClick={() => void navigate(screens[index - 1], false)}>Back</button><div>{index < screens.length - 1 ? <><button type="button" disabled={saving || loading || !readiness || Boolean(error)} onClick={() => void navigate(screens[index + 1], false)}>Skip for now</button><button type="button" className={styles.primary} disabled={saving || loading || !readiness || Boolean(error)} onClick={() => void navigate(screens[index + 1])}>{saving ? 'Saving…' : screen.id === 'specialties' && user?.role === 'OWNER' ? 'Save & continue' : 'Continue'}</button></> : <a className={styles.primary} href="/">Return to dashboard</a>}</div></footer>
    <p className={styles.footnote}>Progress reflects saved settings. Skipping a step does not mark it complete or activate messaging.</p>
  </section>;
}
