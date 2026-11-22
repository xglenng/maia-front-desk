'use client';

import { useEffect, useState } from 'react';
import { useSession } from './session-gate';
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
  return <form onSubmit={save} style={{ border: '1px solid #e4dfda', borderRadius: 10, padding: 18, margin: '18px 0' }}>
    <h3>What services does your business offer?</h3>
    <p>Select all that apply. These choices suggest starting options; they do not replace saved services, policies, forms, or integrations.</p>
    <fieldset disabled={!editable || saving} style={{ border: 0, padding: 0 }}>
      <legend>Business specialties</legend>
      {industryOptions.map(option => <label key={option.value} style={{ display: 'inline-flex', gap: 6, margin: '8px 18px 8px 0' }}>
        <input type="checkbox" checked={settings.industries.includes(option.value)} onChange={event => {
          const industries = event.target.checked ? [...settings.industries, option.value] : settings.industries.filter(item => item !== option.value);
          const suggest = autoTerm || (!settings.industries.length && settings.staffTerm === 'artist');
          const staffTerm = suggest ? suggestedStaffTerm(industries) : settings.staffTerm;
          setAutoTerm(suggest);
          setSettings({ ...settings, industries, staffTerm });
        }}/>{option.label}
      </label>)}
      <label style={{ display: 'block', marginTop: 16 }}>Staff terminology (editable suggestion)
        <input value={settings.staffTerm} maxLength={60} onChange={event => { setAutoTerm(false); setSettings({ ...settings, staffTerm: event.target.value }); }} style={{ display: 'block', padding: 8, marginTop: 6 }}/>
      </label>
      <button type="button" onClick={() => { setAutoTerm(false); setSettings({ ...settings, staffTerm: suggestedStaffTerm(settings.industries) }); }}>Use suggested term</button>
      <h3>Optional forms</h3>
      <label style={{ display: 'block', margin: '10px 0' }}><input type="checkbox" checked={settings.consentFormsEnabled} onChange={event => setSettings({ ...settings, consentFormsEnabled: event.target.checked })}/> Enable consent forms</label>
      <label style={{ display: 'block', margin: '10px 0' }}><input type="checkbox" checked={settings.requestFormsEnabled} onChange={event => setSettings({ ...settings, requestFormsEnabled: event.target.checked })}/> Enable request forms</label>
      <p>Disabling a capability prevents creating new forms and hides its starter options. Existing forms, submissions, and public links remain available until individually deactivated. Disabling consent forms also stops automated consent sending; manual access remains available.</p>
      <button disabled={saving}>{saving ? 'Saving…' : 'Save business settings'}</button>
    </fieldset>
    {!editable && <p>Only the business owner can change these settings.</p>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </form>;
}
