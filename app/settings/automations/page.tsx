'use client';
import { useEffect, useState } from 'react';
import { useSession } from '@/components/session-gate';

type ArtistAutomationSettings = { id: string; displayName: string; smsResponseDelaySeconds: number; metaResponseDelaySeconds: number };
const delays = [{ value: 0, label: 'Immediate' }, { value: 60, label: '1 minute' }, { value: 120, label: '2 minutes' }, { value: 300, label: '5 minutes' }];
const panel = { borderTop: '1px solid #e4dfda', padding: '20px 0' };
const selectStyle = { width: '100%', maxWidth: 420, boxSizing: 'border-box' as const, padding: 11, border: '1px solid #d9d3cc', borderRadius: 6, font: 'inherit', background: '#fff' };

export default function AutomationsSettingsPage() {
  const user = useSession();
  const [artists, setArtists] = useState<ArtistAutomationSettings[]>([]);
  const [artistId, setArtistId] = useState('');
  const [smsDelay, setSmsDelay] = useState(0);
  const [metaDelay, setMetaDelay] = useState(0);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'OWNER') return;
    void fetch('/api/automations/settings').then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load settings.');
      setArtists(data.artists);
      if (data.selected) {
        setArtistId(data.selected.id);
        setSmsDelay(data.selected.smsResponseDelaySeconds);
        setMetaDelay(data.selected.metaResponseDelaySeconds);
      }
    }).catch(error => setMessage(error instanceof Error ? error.message : 'Unable to load settings.'));
  }, [user]);

  function selectArtist(id: string) {
    const selected = artists.find(artist => artist.id === id);
    setArtistId(id);
    setSmsDelay(selected?.smsResponseDelaySeconds ?? 0);
    setMetaDelay(selected?.metaResponseDelaySeconds ?? 0);
    setMessage('');
  }

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/automations/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId, smsResponseDelaySeconds: smsDelay, metaResponseDelaySeconds: metaDelay }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Unable to save settings.');
      setArtists(current => current.map(artist => artist.id === data.artist.id ? data.artist : artist));
      setMessage('Response timing saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;
  if (user.role !== 'OWNER') return <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px' }}><a href="/settings">← Owner settings</a><p>Owner access is required.</p></main>;
  return <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 80px', color: '#181716' }}>
    <a href="/settings">← Owner settings</a>
    <h1>Automated response timing</h1>
    <p style={{ color: '#77736e' }}>Choose how long Maia waits after the latest client message before preparing an SMS or social reply.</p>
    <section style={panel}>
      <label style={{ display: 'grid', gap: 7, fontWeight: 700 }}>Artist
        <select style={selectStyle} value={artistId} onChange={event => selectArtist(event.target.value)}>
          <option value="">Choose an artist</option>
          {artists.map(artist => <option key={artist.id} value={artist.id}>{artist.displayName}</option>)}
        </select>
      </label>
    </section>
    {artistId && <>
      <section style={panel}>
        <label style={{ display: 'grid', gap: 7, fontWeight: 700 }}>SMS reply delay
          <select style={selectStyle} value={smsDelay} onChange={event => setSmsDelay(Number(event.target.value))}>
            {delays.map(delay => <option key={delay.value} value={delay.value}>{delay.label}</option>)}
          </select>
        </label>
      </section>
      <section style={panel}>
        <label style={{ display: 'grid', gap: 7, fontWeight: 700 }}>Facebook and Instagram reply delay
          <select style={selectStyle} value={metaDelay} onChange={event => setMetaDelay(Number(event.target.value))}>
            {delays.map(delay => <option key={delay.value} value={delay.value}>{delay.label}</option>)}
          </select>
        </label>
      </section>
      <section style={panel}>
        <p style={{ margin: 0 }}><strong>Web replies:</strong> Immediate</p>
        <button type="button" onClick={save} disabled={saving} style={{ marginTop: 18, padding: '10px 16px', border: 0, borderRadius: 6, background: '#181716', color: '#fff', font: 'inherit', cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Saving…' : 'Save timing'}</button>
      </section>
    </>}
    {message && <p role="status" aria-live="polite">{message}</p>}
  </main>;
}
