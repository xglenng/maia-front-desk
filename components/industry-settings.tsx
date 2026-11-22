'use client';

import { useEffect, useState } from 'react';
import { useSession } from './session-gate';
import styles from './industry-settings.module.css';
import { industryOptions, suggestedStaffTerm, type Industry } from '@/packages/onboarding/industry';

type Settings = { industries: Industry[]; staffTerm: string; consentFormsEnabled: boolean; requestFormsEnabled: boolean };

export default function IndustrySettings() {
  const user = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [autoTerm, setAutoTerm] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/studio/industry', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Unable to load business settings.');
      setSettings(data.settings);
      setAutoTerm(false);
      window.dispatchEvent(new Event('maia-industry-settings'));
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load business settings.'); });
    return () => controller.abort();
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/studio/industry', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Unable to save business settings.');
      setSettings(data.settings);
      setAutoTerm(false);
      window.dispatchEvent(new Event('maia-industry-settings'));
      setNotice('Business settings saved. Existing services, forms, and links have not been changed.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save business settings.'); }
    finally { setSaving(false); }
  }
  if (!settings) return <p role={error ? 'alert' : 'status'}>{error || 'Loading business settings…'}</p>;
  const editable = user?.role === 'OWNER';
  return <form onSubmit={save} className={styles.card}>
    <header><span className={styles.eyebrow}>Business setup</span><h2>Specialties &amp; forms</h2>
    <p>Choose your industries to tailor your website and form templates.</p></header>
    <fieldset disabled={!editable || saving} className={styles.fields}>
      <legend>Business specialties</legend>
      <div className={styles.specialties}>{industryOptions.map(option => <label key={option.value} className={styles.specialty} data-selected={settings.industries.includes(option.value)}>
        <input type="checkbox" checked={settings.industries.includes(option.value)} onChange={event => {
          const industries = event.target.checked ? [...settings.industries, option.value] : settings.industries.filter(item => item !== option.value);
          const suggest = autoTerm || (!settings.industries.length && settings.staffTerm === 'artist');
          const staffTerm = suggest ? suggestedStaffTerm(industries) : settings.staffTerm;
          setAutoTerm(suggest);
          setSettings({ ...settings, industries, staffTerm });
        }}/>{option.label}
      </label>)}</div>
      <div className={styles.terminology}><label>Staff terminology (editable suggestion)
        <input value={settings.staffTerm} maxLength={60} onChange={event => { setAutoTerm(false); setSettings({ ...settings, staffTerm: event.target.value }); }} className={styles.input}/>
      </label>
      <button className={styles.secondary} type="button" onClick={() => { setAutoTerm(false); setSettings({ ...settings, staffTerm: suggestedStaffTerm(settings.industries) }); }}>Use suggested term</button></div>
      <div className={styles.formOptions}><h3>Optional forms</h3><p>Choose the tools your business uses.</p>
      <div className={styles.optionGrid}>
        <label className={styles.option}><span><strong>Consent forms</strong><small>Collect agreements and signatures before appointments.</small></span><input aria-label="Enable consent forms" type="checkbox" checked={settings.consentFormsEnabled} onChange={event => setSettings({ ...settings, consentFormsEnabled: event.target.checked })}/></label>
        <label className={styles.option}><span><strong>Request forms</strong><small>Receive client inquiries from your public website.</small></span><input aria-label="Enable request forms" type="checkbox" checked={settings.requestFormsEnabled} onChange={event => setSettings({ ...settings, requestFormsEnabled: event.target.checked })}/></label>
      </div>
      <details className={styles.help}><summary>What happens when a form type is turned off?</summary><p>New forms and starter templates are disabled. Existing forms, submissions, and public links stay available until you deactivate each form. Turning off consent forms also stops automated consent sending.</p></details></div>
      <div className={styles.footer}><span>Save these choices separately from your studio details.</span><button className={styles.primary} disabled={saving}>{saving ? 'Saving…' : 'Save business settings'}</button></div>
    </fieldset>
    {!editable && <p>Only the business owner can change these settings.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.success} role="status">{notice}</p>}
  </form>;
}
