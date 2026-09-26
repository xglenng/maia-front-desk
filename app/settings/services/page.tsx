'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useSession } from '@/components/session-gate';

type Artist = { id: string; displayName: string };
type PricingType = 'FLAT' | 'HOURLY' | 'QUOTE';
type Service = {
  id: string;
  artistId: string;
  serviceType: string;
  category: string | null;
  name: string;
  description: string | null;
  durationMinutes: number;
  pricingType: PricingType;
  basePriceCents: number | null;
  hourlyRateCents: number | null;
  startingAt: boolean;
  requiresConsultation: boolean;
  requiresArtistApproval: boolean;
  active: boolean;
  sortOrder: number;
};
type Draft = {
  serviceType: string;
  category: string;
  name: string;
  description: string;
  durationMinutes: string;
  pricingType: PricingType;
  basePrice: string;
  hourlyRate: string;
  startingAt: boolean;
  requiresConsultation: boolean;
  requiresArtistApproval: boolean;
  active: boolean;
  sortOrder: string;
};

const blankDraft: Draft = {
  serviceType: '', category: '', name: '', description: '', durationMinutes: '30',
  pricingType: 'FLAT', basePrice: '', hourlyRate: '', startingAt: false,
  requiresConsultation: false, requiresArtistApproval: false, active: true, sortOrder: '0',
};
const field = { width: '100%', boxSizing: 'border-box' as const, padding: 10, border: '1px solid #d9d3cc', borderRadius: 7, font: 'inherit' };
const labelStyle = { display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 };
const panel = { border: '1px solid #e4dfda', borderRadius: 8, background: '#fff', padding: 18 };

function centsToInput(cents: number | null) {
  return cents == null ? '' : (cents / 100).toFixed(2);
}

function dollarsToCents(value: string): number | null | undefined {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return undefined;
  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(`${whole}${(fraction + '00').slice(0, 2)}`);
  return Number.isSafeInteger(cents) ? cents : undefined;
}

function formatPrice(service: Service) {
  if (service.pricingType === 'QUOTE') return 'By quote';
  const cents = service.pricingType === 'HOURLY' ? service.hourlyRateCents : service.basePriceCents;
  if (cents == null) return 'Price not configured';
  const amount = `$${(cents / 100).toFixed(2)}${service.pricingType === 'HOURLY' ? '/hr' : ''}`;
  return service.startingAt ? `From ${amount}` : amount;
}

function toDraft(service?: Service): Draft {
  if (!service) return { ...blankDraft };
  return {
    serviceType: service.serviceType,
    category: service.category || '',
    name: service.name,
    description: service.description || '',
    durationMinutes: String(service.durationMinutes),
    pricingType: service.pricingType,
    basePrice: centsToInput(service.basePriceCents),
    hourlyRate: centsToInput(service.hourlyRateCents),
    startingAt: service.startingAt,
    requiresConsultation: service.requiresConsultation,
    requiresArtistApproval: service.requiresArtistApproval,
    active: service.active,
    sortOrder: String(service.sortOrder),
  };
}

async function responseData(response: Response) {
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : 'Request failed. Check the service details and try again.');
  return value;
}

export default function ServicesSettingsPage() {
  const user = useSession();
  const organizationId = user?.organization_id || '';
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistId, setArtistId] = useState('');
  const [services, setServices] = useState<Service[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...blankDraft });
  const [loadingArtists, setLoadingArtists] = useState(true);
  const [loadingServices, setLoadingServices] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!organizationId) return;
    let current = true;
    setLoadingArtists(true);
    fetch(`/api/ai/settings?organizationId=${encodeURIComponent(organizationId)}`, { cache: 'no-store' })
      .then(responseData)
      .then(data => {
        if (!current) return;
        const loaded = data.artists as Artist[];
        setArtists(loaded);
        setArtistId(existing => loaded.some(artist => artist.id === existing) ? existing : loaded[0]?.id || '');
      })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'Unable to load artists.'); })
      .finally(() => { if (current) setLoadingArtists(false); });
    return () => { current = false; };
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || !artistId) {
      setServices([]);
      return;
    }
    let current = true;
    setLoadingServices(true);
    setError('');
    fetch(`/api/services?organizationId=${encodeURIComponent(organizationId)}&artistId=${encodeURIComponent(artistId)}&includeInactive=true`, { cache: 'no-store' })
      .then(responseData)
      .then(data => { if (current) setServices(data.services as Service[]); })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'Unable to load services.'); })
      .finally(() => { if (current) setLoadingServices(false); });
    return () => { current = false; };
  }, [organizationId, artistId]);

  function startNew() {
    setEditingId(null);
    setEditorOpen(true);
    setDraft({ ...blankDraft });
    setError('');
    setNotice('');
  }

  function edit(service: Service) {
    setEditingId(service.id);
    setEditorOpen(true);
    setDraft(toDraft(service));
    setError('');
    setNotice('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!organizationId || !artistId || saving) return;
    const priceValue = draft.pricingType === 'FLAT' ? draft.basePrice : draft.pricingType === 'HOURLY' ? draft.hourlyRate : '';
    const priceCents = dollarsToCents(priceValue);
    if (priceCents === undefined) {
      setError('Enter a valid dollar amount with no more than two decimal places.');
      return;
    }
    const body = {
      organizationId,
      ...(editingId ? {} : { artistId }),
      serviceType: draft.serviceType.trim().toUpperCase(),
      category: draft.category.trim() || null,
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      durationMinutes: Number(draft.durationMinutes),
      pricingType: draft.pricingType,
      basePriceCents: draft.pricingType === 'FLAT' ? priceCents : null,
      hourlyRateCents: draft.pricingType === 'HOURLY' ? priceCents : null,
      startingAt: draft.startingAt,
      requiresConsultation: draft.requiresConsultation,
      requiresArtistApproval: draft.requiresArtistApproval,
      active: draft.active,
      sortOrder: Number(draft.sortOrder),
    };

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(editingId ? `/api/services/${editingId}` : '/api/services', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await responseData(response);
      const updated = data.service as Service;
      setServices(current => {
        const next = editingId ? current.map(service => service.id === updated.id ? updated : service) : [...current, updated];
        return next.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      });
      setEditorOpen(false);
      setEditingId(null);
      setDraft({ ...blankDraft });
      setNotice(editingId ? 'Service updated.' : 'Service created.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save service.');
    } finally {
      setSaving(false);
    }
  }

  async function setActive(service: Service) {
    if (!organizationId || pendingId) return;
    setPendingId(service.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/services/${service.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, active: !service.active }),
      });
      const data = await responseData(response);
      setServices(current => current.map(item => item.id === service.id ? data.service as Service : item));
      setNotice(service.active ? 'Service deactivated. Existing appointments are unchanged.' : 'Service activated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update service.');
    } finally {
      setPendingId(null);
    }
  }

  if (!user || user.role !== 'OWNER') return null;
  const groups = new Map<string, Service[]>();
  for (const service of services) {
    const key = `${service.serviceType}\u0000${service.category || ''}`;
    groups.set(key, [...(groups.get(key) || []), service]);
  }

  return <main style={{ maxWidth: 1060, margin: '0 auto', padding: '36px 20px 80px', color: '#181716' }}>
    <a href="/settings">← Owner settings</a>
    <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap', margin: '14px 0 22px' }}>
      <div><h1 style={{ margin: 0 }}>Services &amp; Pricing</h1><p style={{ color: '#706b66', margin: '7px 0 0' }}>Manage the active services and pricing Maia can share with clients.</p></div>
      <button type="button" onClick={startNew} disabled={!artistId || loadingArtists} style={primaryButton}>+ Add service</button>
    </header>

    <section style={panel}>
      <label style={labelStyle}>Artist / provider
        <select value={artistId} disabled={loadingArtists || artists.length === 0 || saving} onChange={event => { setArtistId(event.target.value); setEditorOpen(false); setEditingId(null); setDraft({ ...blankDraft }); }} style={field}>
          <option value="">{loadingArtists ? 'Loading providers…' : 'Select a provider'}</option>
          {artists.map(artist => <option key={artist.id} value={artist.id}>{artist.displayName}</option>)}
        </select>
      </label>
    </section>

    {error && <p role="alert" style={alert}>{error}</p>}
    {notice && <p role="status" style={noticeStyle}>{notice}</p>}

    {editorOpen && <form onSubmit={save} style={{ ...panel, marginTop: 16 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>{editingId ? 'Edit service' : 'New service'}</h2>
      <div style={formGrid}>
        <label style={labelStyle}>Service type
          <input list="service-type-suggestions" required maxLength={40} value={draft.serviceType} onChange={event => setDraft({ ...draft, serviceType: event.target.value })} placeholder="e.g. TATTOO, HAIR, LASER" style={field} />
          <datalist id="service-type-suggestions">{['TATTOO', 'PIERCING', 'HAIR', 'NAILS', 'LASER', 'LASHES', 'BROWS', 'ESTHETICS'].map(type => <option key={type} value={type} />)}</datalist>
        </label>
        <label style={labelStyle}>Category
          <input maxLength={80} value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })} placeholder="Optional" style={field} />
        </label>
        <label style={labelStyle}>Service name
          <input required maxLength={120} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} style={field} />
        </label>
        <label style={labelStyle}>Duration (minutes)
          <input required type="number" min={1} max={1440} step={1} value={draft.durationMinutes} onChange={event => setDraft({ ...draft, durationMinutes: event.target.value })} style={field} />
        </label>
        <label style={labelStyle}>Pricing type
          <select value={draft.pricingType} onChange={event => setDraft({ ...draft, pricingType: event.target.value as PricingType })} style={field}>
            <option value="FLAT">Flat price</option><option value="HOURLY">Hourly</option><option value="QUOTE">Quote</option>
          </select>
        </label>
        {draft.pricingType === 'FLAT' && <label style={labelStyle}>Base price (USD)
          <input type="number" min="0" step="0.01" inputMode="decimal" value={draft.basePrice} onChange={event => setDraft({ ...draft, basePrice: event.target.value })} placeholder="60.00" style={field} />
        </label>}
        {draft.pricingType === 'HOURLY' && <label style={labelStyle}>Hourly rate (USD)
          <input type="number" min="0" step="0.01" inputMode="decimal" value={draft.hourlyRate} onChange={event => setDraft({ ...draft, hourlyRate: event.target.value })} placeholder="100.00" style={field} />
        </label>}
        <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Description
          <textarea maxLength={500} rows={3} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} style={field} />
        </label>
      </div>
      <div style={toggleRow}>
        {draft.pricingType !== 'QUOTE' && <label><input type="checkbox" checked={draft.startingAt} onChange={event => setDraft({ ...draft, startingAt: event.target.checked })} /> Starting at</label>}
        <label><input type="checkbox" checked={draft.requiresConsultation} onChange={event => setDraft({ ...draft, requiresConsultation: event.target.checked })} /> Requires consultation</label>
        <label><input type="checkbox" checked={draft.requiresArtistApproval} onChange={event => setDraft({ ...draft, requiresArtistApproval: event.target.checked })} /> Requires provider approval</label>
        <label><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} /> Active</label>
        <label style={{ ...labelStyle, maxWidth: 150 }}>Sort order
          <input type="number" step={1} value={draft.sortOrder} onChange={event => setDraft({ ...draft, sortOrder: event.target.value })} style={field} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button type="submit" disabled={saving} style={primaryButton}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Create service'}</button>
        <button type="button" disabled={saving} onClick={() => { setEditorOpen(false); setEditingId(null); setDraft({ ...blankDraft }); }} style={secondaryButton}>Cancel</button>
      </div>
    </form>}

    <section style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}><h2 style={{ margin: 0, fontSize: 18 }}>Configured services</h2><span style={{ color: '#706b66', fontSize: 13 }}>{services.filter(service => service.active).length} active · {services.length} total</span></div>
      {loadingServices ? <p>Loading services…</p> : !artistId ? <section style={panel}>Select an artist/provider to manage its services.</section> : services.length === 0 ? <section style={panel}>No services are configured for this provider yet.</section> : [...groups.entries()].map(([key, group]) => {
        const [type, category] = key.split('\u0000');
        return <section key={key} style={{ ...panel, marginBottom: 12 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>{type}{category ? ` · ${category}` : ''}</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {group.map(service => <article key={service.id} style={serviceRow}>
              <div style={{ minWidth: 0 }}>
                <strong>{service.name}</strong><div style={{ color: '#706b66', fontSize: 13, marginTop: 4 }}>{service.durationMinutes} min · {service.pricingType} · {formatPrice(service)}{service.requiresConsultation ? ' · Consultation required' : ''}{service.requiresArtistApproval ? ' · Approval required' : ''}</div>
                {service.description && <p style={{ margin: '5px 0 0', color: '#706b66', fontSize: 13 }}>{service.description}</p>}
              </div>
              <span style={{ ...statusLabel, background: service.active ? '#e6f2ea' : '#eee', color: service.active ? '#2f7651' : '#68635e' }}>{service.active ? 'Active' : 'Inactive'}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" disabled={Boolean(pendingId) || saving} onClick={() => edit(service)} style={secondaryButton}>Edit</button>
                <button type="button" disabled={pendingId === service.id || saving} onClick={() => void setActive(service)} style={secondaryButton}>{pendingId === service.id ? 'Saving…' : service.active ? 'Deactivate' : 'Activate'}</button>
              </div>
            </article>)}
          </div>
        </section>;
      })}
    </section>
  </main>;
}

const primaryButton = { border: 0, borderRadius: 7, padding: '10px 15px', background: '#181716', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const secondaryButton = { border: '1px solid #ccc', borderRadius: 7, padding: '9px 12px', background: '#fff', color: '#181716', fontWeight: 600, cursor: 'pointer' };
const formGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 };
const toggleRow = { display: 'flex', flexWrap: 'wrap' as const, gap: 16, alignItems: 'center', marginTop: 14, fontSize: 13 };
const serviceRow = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', gap: 12, borderTop: '1px solid #eee', padding: '12px 0' };
const statusLabel = { fontSize: 12, fontWeight: 700, padding: '5px 8px', borderRadius: 4, whiteSpace: 'nowrap' as const };
const alert = { background: '#fff0f0', color: '#8b1e1e', padding: 12, borderRadius: 6 };
const noticeStyle = { background: '#eef5ee', color: '#2f7651', padding: 12, borderRadius: 6 };