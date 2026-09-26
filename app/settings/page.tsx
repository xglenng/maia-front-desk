'use client';
import { useEffect, useState } from 'react';
import { useSession } from '@/components/session-gate';

const card = { display: 'block', padding: 22, border: '1px solid #e4dfda', borderRadius: 12, background: '#fff', color: '#181716', textDecoration: 'none' };
const field = { width: '100%', boxSizing: 'border-box' as const, padding: 12, border: '1px solid #d9d3cc', borderRadius: 8, font: 'inherit' };
type ResponseLength = 'SHORT' | 'STANDARD' | 'DETAILED';
type ArtistSetting = { id: string; displayName: string; responseLength: ResponseLength };

export default function SettingsPage() {
  const user = useSession();
  const [artists, setArtists] = useState<ArtistSetting[]>([]);
  const [artistId, setArtistId] = useState('');
  const [responseLength, setResponseLength] = useState<ResponseLength>('SHORT');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const organizationId = user?.organization_id || '';

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    fetch(`/api/ai/settings?organizationId=${encodeURIComponent(organizationId)}`, { cache: 'no-store' })
      .then(async response => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || 'Unable to load AI settings.');
        const loaded = value.artists as ArtistSetting[];
        setArtists(loaded);
        setArtistId(loaded[0]?.id || '');
        setResponseLength(loaded[0]?.responseLength || 'SHORT');
      })
      .catch(error => setMessage(error instanceof Error ? error.message : 'Unable to load AI settings.'))
      .finally(() => setLoading(false));
  }, [organizationId]);

  async function saveResponseLength() {
    if (!organizationId || !artistId) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/ai/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, artistId, responseLength })
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Unable to save AI settings.');
      setArtists(current => current.map(artist => artist.id === artistId ? value.artist : artist));
      setMessage('AI response length saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save AI settings.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;
  return <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px 80px', color: '#181716' }}>
    <a href="/">← Dashboard</a><h1>Owner settings</h1>
    <p style={{ color: '#77736e' }}>Manage SMS onboarding for your studio. Your signed-in studio is selected automatically.</p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginTop: 24 }}>
      <a href="/onboarding" style={{...card,borderColor:'#b98b7f'}}><strong>Guided studio activation</strong><p>Follow one production checklist from business profile through tested go-live.</p></a>
      <a href="/compliance" style={card}><strong>Legal pages</strong><p>Business information, Privacy Policy, and Terms required for SMS registration.</p></a>
      <a href="/settings/consent-forms" style={card}><strong>SMS consent workflow</strong><p>Configure client-initiated texting with YES confirmation or a compliant form-based opt-in.</p></a>
      <a href="/compliance/registration" style={card}><strong>SMS campaign registration</strong><p>Campaign use case, opt-in flow, sample messages, and registration readiness.</p></a>
      <a href="/twilio" style={card}><strong>Twilio phone setup and porting</strong><p>Provision a temporary number or move an artist&apos;s existing business number into the app.</p></a>
      <a href="/waivers" style={card}><strong>Waiver providers and delivery</strong><p>Connect Jotform or another provider, map consent forms, and send the correct waiver to clients.</p></a>
      <a href="/channels" style={card}><strong>Instagram and Facebook</strong><p>Connect studio social accounts and route direct messages into the unified inbox.</p></a>
    </div>
    <section style={{ ...card, marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>AI response length</h2>
      <p>Choose how much detail the receptionist uses for each artist. Booking, pricing, consent, and safety rules remain unchanged.</p>
      <label style={{ display: 'grid', gap: 7, fontWeight: 700 }}>Artist
        <select value={artistId} disabled={loading || artists.length === 0} onChange={event => {
          const selected = artists.find(artist => artist.id === event.target.value);
          setArtistId(event.target.value);
          setResponseLength(selected?.responseLength || 'SHORT');
          setMessage('');
        }} style={field}>
          <option value="">{loading ? 'Loading artists…' : 'Choose an artist'}</option>
          {artists.map(artist => <option key={artist.id} value={artist.id}>{artist.displayName}</option>)}
        </select>
      </label>
      <label style={{ display: 'grid', gap: 7, marginTop: 14, fontWeight: 700 }}>Response length
        <select value={responseLength} disabled={!artistId || loading || saving} onChange={event => setResponseLength(event.target.value as ResponseLength)} style={field}>
          <option value="SHORT">Short</option>
          <option value="STANDARD">Standard</option>
          <option value="DETAILED">Detailed</option>
        </select>
      </label>
      <button type="button" onClick={saveResponseLength} disabled={!artistId || loading || saving} style={{ marginTop: 14, padding: '11px 18px', background: '#181716', color: 'white', border: 0, borderRadius: 8, cursor: saving ? 'wait' : 'pointer' }}>
        {saving ? 'Saving…' : 'Save response length'}
      </button>
      {message && <p role="status" style={{ marginBottom: 0 }}>{message}</p>}
    </section>
    <section style={{ ...card, marginTop: 16 }}><strong>Signed-in studio</strong><p>{user.organization_id}</p><small>This is shown for troubleshooting; setup pages no longer require you to paste it.</small></section>
  </main>;
}
