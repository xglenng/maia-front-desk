'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/components/session-gate';

type Artist = { id: string; displayName: string };
type MaiaService = { id: string; serviceType: string; category: string | null; name: string; durationMinutes: number; active: boolean };
type SquareLocation = { id: string; name: string; timezone: string };
type SquareTeamMember = { id: string; name: string };
type SquareVariation = { id: string; version: string | null; name: string; durationMinutes: number | null };
type Mapping = { id: string; serviceId: string; locationId: string; serviceVariationId: string; serviceVariationVersion: string | null; teamMemberId: string | null };
type Connection = { id: string; provider: string; externalAccountId: string; accountName: string | null; locationId: string | null; locationTimezone: string | null; teamMemberId: string | null; status: string; lastError: string | null };
type BookingPermissions = {
  enabled: boolean;
  status: 'ENABLED' | 'READ_ONLY' | 'UNKNOWN';
  missingScopes: string[];
};
type SchedulingData = { provider: string; connection: Connection | null; services: MaiaService[]; mappings: Mapping[]; bookingPermissions: BookingPermissions | null };
type Catalog = { locations: SquareLocation[]; teamMembers: SquareTeamMember[]; services: SquareVariation[] };
type MappingDraft = { serviceVariationId: string; teamMemberId: string };

const field = { width: '100%', boxSizing: 'border-box' as const, padding: 11, border: '1px solid #d9d3cc', borderRadius: 7, font: 'inherit' };
const panel = { background: '#fff', border: '1px solid #e4dfda', borderRadius: 8, padding: 18, marginTop: 14 };
const label = { display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 };

async function readJson(response: Response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to complete scheduling request.');
  return payload;
}

export default function SchedulingSettingsPage() {
  const user = useSession();
  const organizationId = user?.organization_id || '';
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistId, setArtistId] = useState('');
  const [data, setData] = useState<SchedulingData | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [locationId, setLocationId] = useState('');
  const [teamMemberId, setTeamMemberId] = useState('');
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, MappingDraft>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!organizationId) return;
    fetch(`/api/ai/settings?organizationId=${encodeURIComponent(organizationId)}`, { cache: 'no-store' })
      .then(readJson)
      .then(result => {
        const available = result.artists as Artist[];
        setArtists(available);
        setArtistId(current => available.some(artist => artist.id === current) ? current : available[0]?.id || '');
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load artists.'));
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || !artistId) {
      setData(null);
      setCatalog(null);
      return;
    }
    let current = true;
    setLoading(true);
    setError('');
    const query = `organizationId=${encodeURIComponent(organizationId)}&artistId=${encodeURIComponent(artistId)}`;
    fetch(`/api/scheduling?${query}`, { cache: 'no-store' })
      .then(readJson)
      .then(async result => {
        if (!current) return;
        const next = result as SchedulingData;
        setData(next);
        setLocationId(next.connection?.locationId || '');
        setTeamMemberId(next.connection?.teamMemberId || '');
        if (next.connection?.provider === 'SQUARE' && next.connection.status === 'CONNECTED') {
          const squareCatalog = await readJson(await fetch(`/api/scheduling/square/catalog?${query}`, { cache: 'no-store' })) as Catalog;
          if (!current) return;
          setCatalog(squareCatalog);
          const drafts: Record<string, MappingDraft> = {};
          for (const service of next.services) {
            const mapping = next.mappings.find(item => item.serviceId === service.id && item.locationId === next.connection?.locationId);
            drafts[service.id] = { serviceVariationId: mapping?.serviceVariationId || '', teamMemberId: mapping?.teamMemberId || '' };
          }
          setMappingDrafts(drafts);
        } else {
          setCatalog(null);
          setMappingDrafts({});
        }
      })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'Unable to load scheduling settings.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [organizationId, artistId]);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('square');
    if (!result) return;
    const messages: Record<string, string> = {
      connected: 'Square connected. Select a location and map services.',
      denied: 'Square connection was cancelled.',
      'not-configured': 'Square OAuth is not configured on the server.',
      'invalid-state': 'Square connection could not be verified. Start again from Settings.',
      failed: 'Square connection could not be completed. Check the server logs and try again.',
    };
    if (messages[result]) setNotice(messages[result]);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  async function patch(body: Record<string, unknown>) {
    if (!organizationId || !artistId) return null;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      return await readJson(await fetch('/api/scheduling', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, artistId, ...body }),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save scheduling settings.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveProviderSettings() {
    const result = await patch({ action: 'UPDATE_SETTINGS', locationId: locationId || null, teamMemberId: teamMemberId || null });
    if (result?.connection) {
      setData(current => current ? { ...current, connection: { ...current.connection, ...result.connection } } : current);
      setNotice('Square scheduling settings saved.');
    }
  }

  async function saveMapping(service: MaiaService) {
    const draft = mappingDrafts[service.id];
    if (!draft?.serviceVariationId || !data?.connection?.locationId) return;
    const result = await patch({ action: 'SAVE_MAPPING', serviceId: service.id, locationId: data.connection.locationId, serviceVariationId: draft.serviceVariationId, teamMemberId: draft.teamMemberId || null });
    if (result?.mapping) {
      setData(current => current ? { ...current, mappings: [...current.mappings.filter(item => !(item.serviceId === service.id && item.locationId === result.mapping.locationId)), result.mapping] } : current);
      setNotice(`${service.name} mapping saved.`);
    }
  }

  async function removeMapping(service: MaiaService) {
    const location = data?.connection?.locationId;
    if (!location) return;
    const result = await patch({ action: 'REMOVE_MAPPING', serviceId: service.id, locationId: location });
    if (result?.removed) {
      setData(current => current ? { ...current, mappings: current.mappings.filter(item => !(item.serviceId === service.id && item.locationId === location)) } : current);
      setMappingDrafts(current => ({ ...current, [service.id]: { serviceVariationId: '', teamMemberId: '' } }));
      setNotice(`${service.name} mapping removed.`);
    }
  }

  async function disconnectSquare() {
    if (!window.confirm('Switch this provider back to Maia scheduling? Square credentials and saved mappings will be retained.')) return;
    const result = await patch({ action: 'DISCONNECT' });
    if (result?.disconnected) {
      setData(current => current ? { ...current, provider: 'MAIA', connection: current.connection ? { ...current.connection, status: 'DISCONNECTED', locationId: null, locationTimezone: null, teamMemberId: null } : null } : current);
      setCatalog(null);
      setNotice('Maia scheduling is active. Existing Square setup was retained.');
    }
  }

  if (!user || user.role !== 'OWNER') return null;
  const connected = data?.connection?.provider === 'SQUARE' && data.connection.status === 'CONNECTED';
  const bookingEnabled = connected && data?.bookingPermissions?.status === 'ENABLED';
  const bookingPermissionUnknown = connected && data?.bookingPermissions?.status === 'UNKNOWN';
  const locationSaved = Boolean(locationId && locationId === data?.connection?.locationId);

  return <main style={{ maxWidth: 1000, margin: '0 auto', padding: '38px 20px 80px', color: '#181716' }}>
    <a href="/settings">← Owner settings</a>
    <header style={{ margin: '14px 0 22px' }}><h1 style={{ margin: 0 }}>Scheduling</h1><p style={{ color: '#706b66' }}>Choose how Maia checks availability for each provider.</p></header>
    <section style={panel}>
      <label style={label}>Artist / provider
        <select value={artistId} disabled={!artists.length || busy} onChange={event => { setArtistId(event.target.value); setNotice(''); }} style={field}>
          <option value="">Select a provider</option>{artists.map(artist => <option key={artist.id} value={artist.id}>{artist.displayName}</option>)}
        </select>
      </label>
    </section>
    {error && <p role="alert" style={alert}>{error}</p>}
    {notice && <p role="status" style={noticeStyle}>{notice}</p>}
    {loading && <p>Loading scheduling settings…</p>}
    {data && data.provider === 'MAIA' && <section style={panel}>
      <div style={providerHead}><div><strong>Maia scheduling</strong><p style={muted}>Internal availability rules and appointments remain the active fallback.</p></div><span style={pill}>Active</span></div>
      <a href={`/api/scheduling/square/connect?organizationId=${encodeURIComponent(organizationId)}&artistId=${encodeURIComponent(artistId)}`} style={buttonLink}>Connect Square</a>
    </section>}
    {data && data.provider === 'SQUARE' && !connected && <section style={panel}>
      <div style={providerHead}><div><strong>Square connection needs attention</strong><p style={muted}>Availability will not fall back to Maia scheduling while an external provider connection is in an error state.</p></div><span style={{ ...pill, background: '#fff0f0', color: '#8b1e1e' }}>Action required</span></div>
      <a href={`/api/scheduling/square/connect?organizationId=${encodeURIComponent(organizationId)}&artistId=${encodeURIComponent(artistId)}`} style={buttonLink}>Reconnect Square</a>
    </section>}
    {connected && data?.connection && <>
      <section style={panel}>
        <div style={providerHead}>
          <div>
            <strong>Square connected</strong>
            <p style={muted}>Merchant: {data.connection.accountName || data.connection.externalAccountId}</p>
          </div>
          <span style={{
            ...pill,
            ...(!bookingEnabled ? { background: '#fff4df', color: '#7a4b00' } : {}),
          }}>
            {bookingEnabled
              ? 'Connected · booking enabled'
              : bookingPermissionUnknown
                ? 'Connected · permissions unknown'
                : 'Connected · read-only'}
          </span>
        </div>
        {!bookingEnabled && (
          <div style={{ marginTop: 12 }}>
            <p style={muted}>
              {bookingPermissionUnknown
                ? 'Maia could not verify Square booking permissions. Reconnect Square to authorize booking access.'
                : 'Square is connected for availability, but Maia needs booking permissions before it can create appointments.'}
            </p>
            <a
              href={`/api/scheduling/square/connect?organizationId=${encodeURIComponent(organizationId)}&artistId=${encodeURIComponent(artistId)}`}
              style={buttonLink}
            >
              Reconnect Square
            </a>
          </div>
        )}
        <div style={formGrid}>
          <label style={label}>Square location
            <select value={locationId} onChange={event => { setLocationId(event.target.value); setTeamMemberId(''); }} disabled={!catalog || busy} style={field}>
              <option value="">Select a location</option>{catalog?.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <label style={label}>Default team member
            <select value={teamMemberId} onChange={event => setTeamMemberId(event.target.value)} disabled={!locationId || busy} style={field}>
              <option value="">Any eligible team member</option>{catalog?.teamMembers.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => void saveProviderSettings()} disabled={busy || !locationId} style={button}>Save location &amp; team member</button>
          <button type="button" onClick={() => void disconnectSquare()} disabled={busy} style={secondaryButton}>Use Maia scheduling</button>
        </div>
        {data.connection.lastError && <p style={alert}>{data.connection.lastError}</p>}
      </section>
      <section style={panel}>
        <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Service mappings</h2>
        <p style={muted}>Map each active Maia service to a Square bookable service. Maia checks availability only for saved mappings.</p>
        {!locationSaved ? <p>Select and save a Square location to manage mappings.</p> : data.services.length === 0 ? <p>No active Maia services are configured. Add services under Services &amp; Pricing first.</p> : data.services.map(service => {
          const mapping = data.mappings.find(item => item.serviceId === service.id && item.locationId === locationId);
          const draft = mappingDrafts[service.id] || { serviceVariationId: mapping?.serviceVariationId || '', teamMemberId: mapping?.teamMemberId || '' };
          return <div key={service.id} style={mappingRow}>
            <div><strong>{service.name}</strong><div style={muted}>{[service.serviceType, service.category].filter(Boolean).join(' · ') || service.serviceType} · {service.durationMinutes} min</div></div>
            <label style={label}>Square service
              <select value={draft.serviceVariationId} disabled={!catalog || busy} onChange={event => setMappingDrafts(current => ({ ...current, [service.id]: { ...draft, serviceVariationId: event.target.value } }))} style={field}>
                <option value="">Choose a bookable service</option>{catalog?.services.map(item => <option key={item.id} value={item.id}>{item.name}{item.durationMinutes ? ` · ${item.durationMinutes} min` : ''}</option>)}
              </select>
            </label>
            <label style={label}>Team member override
              <select value={draft.teamMemberId} disabled={!catalog || busy} onChange={event => setMappingDrafts(current => ({ ...current, [service.id]: { ...draft, teamMemberId: event.target.value } }))} style={field}>
                <option value="">Use provider default</option>{catalog?.teamMembers.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={() => void saveMapping(service)} disabled={busy || !locationSaved || !draft.serviceVariationId} style={button}>{mapping ? 'Save mapping' : 'Map service'}</button>
              {mapping && <button type="button" onClick={() => void removeMapping(service)} disabled={busy} style={secondaryButton}>Remove</button>}
            </div>
          </div>;
        })}
      </section>
    </>}
  </main>;
}

const formGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginTop: 16 };
const providerHead = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, marginBottom: 14 };
const mappingRow = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'end', padding: '14px 0', borderTop: '1px solid #eee' };
const muted = { color: '#706b66', fontSize: 13, margin: '5px 0 0' };
const pill = { background: '#e6f2ea', color: '#2f7651', borderRadius: 4, padding: '6px 9px', fontSize: 12, fontWeight: 700 as const, whiteSpace: 'nowrap' as const };
const button = { border: 0, borderRadius: 7, padding: '10px 14px', background: '#181716', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const secondaryButton = { border: '1px solid #ccc', borderRadius: 7, padding: '9px 12px', background: '#fff', color: '#181716', fontWeight: 600, cursor: 'pointer' };
const buttonLink = { ...button, display: 'inline-block', textDecoration: 'none' };
const alert = { background: '#fff0f0', color: '#8b1e1e', padding: 12, borderRadius: 6 };
const noticeStyle = { background: '#eef5ee', color: '#2f7651', padding: 12, borderRadius: 6 };