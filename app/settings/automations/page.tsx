'use client';
import { useEffect, useState } from 'react';
import { useSession } from '@/components/session-gate';

type ArtistSettings = {
  id: string;
  displayName: string;
  smsResponseDelaySeconds: number;
  metaResponseDelaySeconds: number;
  venmoEnabled: boolean;
  venmoUsername: string | null;
  venmoPaymentUrl: string | null;
  venmoPaymentInstructions: string | null;
  appointmentReminderEnabled: boolean;
  appointmentReminderMinutes: number;
  appointmentReminderShortNoticeMode: 'SKIP' | 'SEND_AFTER_DELAY';
  appointmentWaiverSendEnabled: boolean;
  appointmentWaiverSendMinutes: number;
  aftercareFollowupEnabled: boolean;
  aftercareFollowupHours: number;
  reviewFollowupEnabled: boolean;
  reviewFollowupHours: number;
  googleReviewUrl: string | null;
  reviewFollowupMessage: string | null;
};
type Field = keyof Omit<ArtistSettings, 'id' | 'displayName'>;
const panel = { borderTop: '1px solid #e4dfda', padding: '20px 0' };
const fieldStyle = { width: '100%', maxWidth: 480, boxSizing: 'border-box' as const, padding: 11, border: '1px solid #d9d3cc', borderRadius: 6, font: 'inherit', background: '#fff' };
const labelStyle = { display: 'grid', gap: 7, fontWeight: 700 as const };
const choice = (values: Array<[number, string]>) => values.map(([value, label]) => <option key={value} value={value}>{label}</option>);

export default function AutomationsSettingsPage() {
  const user = useSession();
  const [artists, setArtists] = useState<ArtistSettings[]>([]);
  const [settings, setSettings] = useState<ArtistSettings | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'OWNER') return;
    void fetch('/api/automations/settings').then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load settings.');
      setArtists(data.artists);
      setSettings(data.selected);
    }).catch(error => setMessage(error instanceof Error ? error.message : 'Unable to load settings.'));
  }, [user]);

  function update<K extends Field>(key: K, value: ArtistSettings[K]) {
    setSettings(current => current ? { ...current, [key]: value } : current);
    setMessage('');
  }

  async function save() {
    if (!settings || saving) return;
    setSaving(true);
    setMessage('');
    const { id: artistId, displayName: _displayName, ...body } = settings;
    try {
      const response = await fetch('/api/automations/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artistId, ...body }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Unable to save settings.');
      setSettings(data.artist);
      setArtists(current => current.map(artist => artist.id === data.artist.id ? data.artist : artist));
      setMessage('Automation settings saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;
  if (user.role !== 'OWNER') return <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px' }}><a href="/settings">← Owner settings</a><p>Owner access is required.</p></main>;
  return <main style={{ maxWidth: 820, margin: '0 auto', padding: '36px 20px 80px', color: '#181716' }}>
    <a href="/settings">← Owner settings</a>
    <h1>Automations</h1>
    <p style={{ color: '#77736e' }}>Set client communication timing and payment instructions for each artist.</p>
    <section style={panel}><label style={labelStyle}>Artist
      <select style={fieldStyle} value={settings?.id ?? ''} onChange={event => setSettings(artists.find(artist => artist.id === event.target.value) ?? null)}>
        <option value="">Choose an artist</option>{artists.map(artist => <option key={artist.id} value={artist.id}>{artist.displayName}</option>)}
      </select>
    </label></section>
    {settings && <>
      <section style={panel}>
        <h2>AI responses</h2>
        <div style={{ display: 'grid', gap: 16 }}>
          <label style={labelStyle}>SMS response delay<select style={fieldStyle} value={settings.smsResponseDelaySeconds} onChange={event => update('smsResponseDelaySeconds', Number(event.target.value))}>{choice([[0, 'Immediate'], [60, '1 minute'], [120, '2 minutes'], [300, '5 minutes']])}</select></label>
          <label style={labelStyle}>Facebook and Instagram response delay<select style={fieldStyle} value={settings.metaResponseDelaySeconds} onChange={event => update('metaResponseDelaySeconds', Number(event.target.value))}>{choice([[0, 'Immediate'], [60, '1 minute'], [120, '2 minutes'], [300, '5 minutes']])}</select></label>
          <p style={{ margin: 0 }}>Web replies: Immediate</p>
        </div>
      </section>
      <section style={panel}>
        <h2>Venmo deposits</h2>
        <p style={{ color: '#77736e' }}>Venmo payments stay pending until an authorized team member confirms receipt.</p>
        <label><input type="checkbox" checked={settings.venmoEnabled} onChange={event => update('venmoEnabled', event.target.checked)} /> Enable manual Venmo deposits</label>
        {settings.venmoEnabled && <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
          <label style={labelStyle}>Venmo username<input style={fieldStyle} maxLength={33} value={settings.venmoUsername ?? ''} onChange={event => update('venmoUsername', event.target.value)} placeholder="studio-handle" /></label>
          <label style={labelStyle}>Venmo profile/payment URL (optional)<input style={fieldStyle} type="url" maxLength={300} value={settings.venmoPaymentUrl ?? ''} onChange={event => update('venmoPaymentUrl', event.target.value)} placeholder="https://venmo.com/u/studio-handle" /></label>
          <label style={labelStyle}>Client payment instructions<textarea style={fieldStyle} rows={3} maxLength={500} value={settings.venmoPaymentInstructions ?? ''} onChange={event => update('venmoPaymentInstructions', event.target.value)} placeholder="Send the deposit and include your appointment date." /></label>
        </div>}
      </section>
      <section style={panel}>
        <h2>Appointment reminder</h2>
        <label><input type="checkbox" checked={settings.appointmentReminderEnabled} onChange={event => update('appointmentReminderEnabled', event.target.checked)} /> Send an appointment reminder</label>
        {settings.appointmentReminderEnabled && <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
          <label style={labelStyle}>Timing before appointment<select style={fieldStyle} value={settings.appointmentReminderMinutes} onChange={event => update('appointmentReminderMinutes', Number(event.target.value))}>{choice([[120, '2 hours'], [360, '6 hours'], [720, '12 hours'], [1440, '24 hours'], [2880, '48 hours']])}</select></label>
          <label style={labelStyle}>Appointments booked inside that window<select style={fieldStyle} value={settings.appointmentReminderShortNoticeMode} onChange={event => update('appointmentReminderShortNoticeMode', event.target.value as ArtistSettings['appointmentReminderShortNoticeMode'])}><option value="SKIP">Skip the reminder</option><option value="SEND_AFTER_DELAY">Send an upcoming reminder after 5 minutes</option></select></label>
        </div>}
      </section>
      <section style={panel}>
        <h2>Day-of waiver</h2>
        <label><input type="checkbox" checked={settings.appointmentWaiverSendEnabled} onChange={event => update('appointmentWaiverSendEnabled', event.target.checked)} /> Send an applicable waiver before the appointment</label>
        {settings.appointmentWaiverSendEnabled && <label style={{ ...labelStyle, marginTop: 14 }}>Timing before appointment<select style={fieldStyle} value={settings.appointmentWaiverSendMinutes} onChange={event => update('appointmentWaiverSendMinutes', Number(event.target.value))}>{choice([[120, '2 hours'], [240, '4 hours'], [360, '6 hours'], [720, '12 hours']])}</select></label>}
      </section>
      <section style={panel}>
        <h2>Aftercare follow-up</h2>
        <label><input type="checkbox" checked={settings.aftercareFollowupEnabled} onChange={event => update('aftercareFollowupEnabled', event.target.checked)} /> Send configured aftercare after an appointment is marked complete</label>
        {settings.aftercareFollowupEnabled && <label style={{ ...labelStyle, marginTop: 14 }}>Timing after completion<select style={fieldStyle} value={settings.aftercareFollowupHours} onChange={event => update('aftercareFollowupHours', Number(event.target.value))}>{choice([[12, '12 hours'], [24, 'Next day (24 hours)'], [48, '2 days'], [72, '3 days']])}</select></label>}
      </section>
      <section style={panel}>
        <h2>Google review follow-up</h2>
        <label><input type="checkbox" checked={settings.reviewFollowupEnabled} onChange={event => update('reviewFollowupEnabled', event.target.checked)} /> Send a review link after an appointment is marked complete</label>
        {settings.reviewFollowupEnabled && <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
          <label style={labelStyle}>Google review URL<input style={fieldStyle} type="url" maxLength={500} value={settings.googleReviewUrl ?? ''} onChange={event => update('googleReviewUrl', event.target.value)} placeholder="https://g.page/r/.../review" /></label>
          <label style={labelStyle}>Client message<textarea style={fieldStyle} rows={3} maxLength={500} value={settings.reviewFollowupMessage ?? ''} onChange={event => update('reviewFollowupMessage', event.target.value)} placeholder="We appreciate your visit. Share feedback with the studio here:" /></label>
          <label style={labelStyle}>Timing after completion<select style={fieldStyle} value={settings.reviewFollowupHours} onChange={event => update('reviewFollowupHours', Number(event.target.value))}>{choice([[24, 'Next day (24 hours)'], [48, '2 days'], [72, '3 days'], [168, '1 week']])}</select></label>
        </div>}
      </section>
      <button type="button" onClick={save} disabled={saving} style={{ marginTop: 20, padding: '10px 16px', border: 0, borderRadius: 6, background: '#181716', color: '#fff', font: 'inherit', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Saving…' : 'Save settings'}</button>
    </>}
    {message && <p role="status" aria-live="polite">{message}</p>}
  </main>;
}
