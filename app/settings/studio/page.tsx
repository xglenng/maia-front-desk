'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/components/session-gate';

type Visibility = 'CLIENT_VISIBLE' | 'AI_INTERNAL';
type ResponseLength = 'SHORT' | 'STANDARD' | 'DETAILED';
type Tone = 'WARM' | 'PROFESSIONAL' | 'FRIENDLY';
type Hours = { dayOfWeek: number; startMinute: number; endMinute: number };
type Location = {
  id: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  businessHoursConfigured: boolean;
  isPrimary: boolean;
  active: boolean;
  hours: Hours[];
};
type Rule = { id?: string; artistId: string; category: string; rule: string; visibility: Visibility; priority: number; active: boolean };
type Faq = { id?: string; locationId: string | null; category: string | null; question: string; answer: string; active: boolean; sortOrder: number };
type Aftercare = { id?: string; locationId: string | null; serviceType: string | null; category: string | null; title: string; instructions: string; active: boolean; sortOrder: number };
type ArtistSettings = { artistId: string; displayName: string; receptionistEnabled: boolean; receptionistTone: Tone; receptionistGreeting: string | null; receptionistInstructions: string | null; responseLength: ResponseLength };
type Config = { profile: { publicName: string | null; publicPhone: string | null; publicEmail: string | null; website: string | null; timezone: string }; rules: Rule[]; faqs: Faq[]; aftercare: Aftercare[]; artists: ArtistSettings[] };

type LocationDraft = Omit<Location, 'id' | 'hours'> & { id?: string; hours: Hours[] };
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const field = { width: '100%', boxSizing: 'border-box' as const, padding: 10, border: '1px solid #d9d3cc', borderRadius: 7, font: 'inherit' };
const label = { display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 };
const panel = { border: '1px solid #e4dfda', borderRadius: 8, padding: 18, background: '#fff', marginTop: 16 };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 };
const button = { border: 0, borderRadius: 6, padding: '10px 15px', background: '#181716', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const secondary = { border: '1px solid #ccc', borderRadius: 6, padding: '9px 12px', background: '#fff', color: '#181716', fontWeight: 600, cursor: 'pointer' };
const emptyLocation: LocationDraft = { name: '', addressLine1: '', addressLine2: '', city: '', region: '', postalCode: '', country: '', phone: '', email: '', timezone: 'America/Denver', businessHoursConfigured: false, isPrimary: true, active: true, hours: [] };

function minuteTime(value: number) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function timeMinute(value: string) { const [hour, minute] = value.split(':').map(Number); return hour! * 60 + minute!; }
function nullable(value: string | null | undefined) { return value?.trim() || null; }
async function readJson(response: Response) {
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : 'Unable to save studio configuration.');
  return value;
}

export default function StudioSettingsPage() {
  const user = useSession();
  const organizationId = user?.organization_id || '';
  const [config, setConfig] = useState<Config | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationDraft, setLocationDraft] = useState<LocationDraft>({ ...emptyLocation });
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedArtist, setSelectedArtist] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    if (!organizationId) return;
    setLoading(true);
    setError('');
    try {
      const params = `organizationId=${encodeURIComponent(organizationId)}`;
      const [configuration, locationData] = await Promise.all([
        fetch(`/api/studio/config?${params}`, { cache: 'no-store' }).then(readJson),
        fetch(`/api/studio/locations?${params}`, { cache: 'no-store' }).then(readJson),
      ]);
      setConfig(configuration as Config);
      const loadedLocations = locationData.locations as Location[];
      setLocations(loadedLocations);
      setSelectedArtist(current => configuration.artists.some((artist: ArtistSettings) => artist.artistId === current) ? current : configuration.artists[0]?.artistId || '');
      const nextLocationId = loadedLocations.some(location => location.id === selectedLocation) ? selectedLocation : loadedLocations[0]?.id || '';
      setSelectedLocation(nextLocationId);
      const loaded = loadedLocations.find(location => location.id === nextLocationId);
      setLocationDraft(loaded ? { ...loaded, hours: loaded.hours.map(hour => ({ ...hour })) } : { ...emptyLocation, timezone: configuration.profile.timezone });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load Studio Configuration.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [organizationId]);

  const activeArtist = useMemo(() => config?.artists.find(artist => artist.artistId === selectedArtist), [config, selectedArtist]);

  async function saveConfiguration(event: FormEvent) {
    event.preventDefault();
    if (!config || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await readJson(await fetch('/api/studio/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          profile: { ...config.profile, publicName: nullable(config.profile.publicName), publicPhone: nullable(config.profile.publicPhone), publicEmail: nullable(config.profile.publicEmail), website: nullable(config.profile.website) },
          rules: config.rules,
          faqs: config.faqs.map(faq => ({ ...faq, category: nullable(faq.category) })),
          aftercare: config.aftercare.map(item => ({ ...item, category: nullable(item.category), serviceType: nullable(item.serviceType) })),
          artists: config.artists.map(({ displayName: _displayName, ...artist }) => ({ ...artist, receptionistGreeting: nullable(artist.receptionistGreeting), receptionistInstructions: nullable(artist.receptionistInstructions) })),
        }),
      }));
      setNotice('Studio configuration saved.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save studio configuration.');
    } finally { setSaving(false); }
  }

  function editLocation(id: string) {
    const location = locations.find(item => item.id === id);
    setSelectedLocation(id);
    setLocationDraft(location ? { ...location, hours: location.hours.map(hour => ({ ...hour })) } : { ...emptyLocation, timezone: config?.profile.timezone || 'UTC', isPrimary: locations.length === 0 });
  }

  function setDay(dayOfWeek: number, open: boolean) {
    setLocationDraft(current => {
      const existing = current.hours.filter(hour => hour.dayOfWeek !== dayOfWeek);
      return { ...current, hours: open ? [...existing, { dayOfWeek, startMinute: 600, endMinute: 1020 }].sort((a, b) => a.dayOfWeek - b.dayOfWeek) : existing };
    });
  }

  function setHour(dayOfWeek: number, key: 'startMinute' | 'endMinute', value: string) {
    setLocationDraft(current => ({ ...current, hours: current.hours.map(hour => hour.dayOfWeek === dayOfWeek ? { ...hour, [key]: timeMinute(value) } : hour) }));
  }

  async function saveLocation(event?: Pick<Event, 'preventDefault'>) {
    event?.preventDefault();
    if (!organizationId || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const { id, hours, ...values } = locationDraft;
      const response = await fetch('/api/studio/locations', {
        method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, ...(id ? { locationId: id } : {}), ...values, hours }),
      });
      const result = await readJson(response);
      setNotice('Location and business hours saved.');
      const locationData = await readJson(await fetch(`/api/studio/locations?organizationId=${encodeURIComponent(organizationId)}`, { cache: 'no-store' }));
      setLocations(locationData.locations as Location[]);
      setSelectedLocation(result.location.id);
      setLocationDraft({ ...result.location, hours: result.location.hours.map((hour: Hours) => ({ ...hour })) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save location.');
    } finally { setSaving(false); }
  }

  if (!user) return null;
  if (user.role !== 'OWNER') return <main style={{ maxWidth: 960, margin: '0 auto', padding: 32 }}><h1>Studio Configuration</h1><p>Owner access is required to manage organization settings.</p></main>;
  if (loading && !config) return <main style={{ maxWidth: 960, margin: '0 auto', padding: 32 }}><h1>Studio Configuration</h1><p>Loading studio settings…</p></main>;
  if (!config) return <main style={{ maxWidth: 960, margin: '0 auto', padding: 32 }}><h1>Studio Configuration</h1><p role="alert">{error || 'Studio configuration could not be loaded.'}</p></main>;

  const patchConfig = (update: Partial<Config>) => setConfig(current => current ? { ...current, ...update } : current);
  const updateArtist = (update: Partial<ArtistSettings>) => patchConfig({ artists: config.artists.map(artist => artist.artistId === selectedArtist ? { ...artist, ...update } : artist) });

  return <main style={{ maxWidth: 1040, margin: '0 auto', padding: '32px 20px 72px', color: '#181716' }}>
    <a href="/settings">← Owner settings</a>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', margin: '14px 0 20px' }}>
      <div><h1 style={{ margin: 0 }}>Studio Configuration</h1><p style={{ color: '#706b66', marginBottom: 0 }}>Public studio information and the knowledge Maia may share with clients.</p></div>
      <button type="button" onClick={event => { const form = document.getElementById('studio-config-form') as HTMLFormElement | null; form?.requestSubmit(); }} disabled={saving} style={button}>{saving ? 'Saving…' : 'Save configuration'}</button>
    </header>
    {error && <p role="alert" style={{ background: '#fff0f0', color: '#8b1e1e', padding: 12, borderRadius: 6 }}>{error}</p>}
    {notice && <p role="status" style={{ background: '#eef5ee', color: '#2f7651', padding: 12, borderRadius: 6 }}>{notice}</p>}

    <form id="studio-config-form" onSubmit={saveConfiguration}>
      <section style={panel}>
        <h2 style={{ marginTop: 0 }}>Business profile</h2>
        <div style={grid}>
          <label style={label}>Public business name<input maxLength={120} value={config.profile.publicName || ''} onChange={event => patchConfig({ profile: { ...config.profile, publicName: event.target.value } })} style={field} /></label>
          <label style={label}>Public phone<input maxLength={32} value={config.profile.publicPhone || ''} onChange={event => patchConfig({ profile: { ...config.profile, publicPhone: event.target.value } })} style={field} /></label>
          <label style={label}>Public email<input type="email" maxLength={254} value={config.profile.publicEmail || ''} onChange={event => patchConfig({ profile: { ...config.profile, publicEmail: event.target.value } })} style={field} /></label>
          <label style={label}>Website<input type="url" maxLength={240} value={config.profile.website || ''} onChange={event => patchConfig({ profile: { ...config.profile, website: event.target.value } })} style={field} /></label>
          <label style={label}>Organization timezone<input maxLength={80} value={config.profile.timezone} onChange={event => patchConfig({ profile: { ...config.profile, timezone: event.target.value } })} style={field} /></label>
        </div>
      </section>

      <section style={panel}>
        <div style={sectionHeader}><div><h2 style={{ margin: 0 }}>Locations &amp; business hours</h2><p style={{ color: '#706b66' }}>These are public operating hours, separate from each artist&apos;s bookable availability.</p></div><button type="button" onClick={() => editLocation('')} style={secondary}>Add location</button></div>
        {locations.map(location => <button key={location.id} type="button" onClick={() => editLocation(location.id)} style={{ ...secondary, margin: '0 8px 12px 0', borderColor: selectedLocation === location.id ? '#8f2f22' : '#ccc' }}>{location.name}{location.isPrimary ? ' · Primary' : ''}{!location.active ? ' · Inactive' : ''}</button>)}
        <div style={{ borderTop: '1px solid #eee', paddingTop: 14 }}>
          <div style={grid}>
            <label style={label}>Location name<input required maxLength={120} value={locationDraft.name} onChange={event => setLocationDraft({ ...locationDraft, name: event.target.value })} style={field} /></label>
            <label style={label}>Timezone<input required maxLength={80} value={locationDraft.timezone} onChange={event => setLocationDraft({ ...locationDraft, timezone: event.target.value })} style={field} /></label>
            <label style={label}>Address line 1<input maxLength={160} value={locationDraft.addressLine1 || ''} onChange={event => setLocationDraft({ ...locationDraft, addressLine1: event.target.value })} style={field} /></label>
            <label style={label}>Address line 2<input maxLength={160} value={locationDraft.addressLine2 || ''} onChange={event => setLocationDraft({ ...locationDraft, addressLine2: event.target.value })} style={field} /></label>
            <label style={label}>City<input maxLength={100} value={locationDraft.city || ''} onChange={event => setLocationDraft({ ...locationDraft, city: event.target.value })} style={field} /></label>
            <label style={label}>State / region<input maxLength={100} value={locationDraft.region || ''} onChange={event => setLocationDraft({ ...locationDraft, region: event.target.value })} style={field} /></label>
            <label style={label}>Postal code<input maxLength={24} value={locationDraft.postalCode || ''} onChange={event => setLocationDraft({ ...locationDraft, postalCode: event.target.value })} style={field} /></label>
            <label style={label}>Country<input maxLength={80} value={locationDraft.country || ''} onChange={event => setLocationDraft({ ...locationDraft, country: event.target.value })} style={field} /></label>
            <label style={label}>Location phone<input maxLength={32} value={locationDraft.phone || ''} onChange={event => setLocationDraft({ ...locationDraft, phone: event.target.value })} style={field} /></label>
            <label style={label}>Location email<input type="email" maxLength={254} value={locationDraft.email || ''} onChange={event => setLocationDraft({ ...locationDraft, email: event.target.value })} style={field} /></label>
          </div>
          <div style={toggleRow}>
            <label><input type="checkbox" checked={locationDraft.isPrimary} onChange={event => setLocationDraft({ ...locationDraft, isPrimary: event.target.checked })} /> Primary location</label>
            <label><input type="checkbox" checked={locationDraft.active} onChange={event => setLocationDraft({ ...locationDraft, active: event.target.checked, isPrimary: event.target.checked ? locationDraft.isPrimary : false })} /> Active</label>
          </div>
          <h3>Weekly business hours</h3>
          <p style={{ color: '#706b66', margin: '0 0 10px' }}>{locationDraft.businessHoursConfigured ? (locationDraft.hours.length ? 'Configured operating hours.' : 'Configured as closed all week.') : 'Hours have not been configured; Maia will not infer opening times.'}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {dayNames.map((name, dayOfWeek) => {
              const hours = locationDraft.hours.find(item => item.dayOfWeek === dayOfWeek);
              return <div key={name} style={hoursRow}>
                <label><input type="checkbox" checked={Boolean(hours)} onChange={event => setDay(dayOfWeek, event.target.checked)} /> {name}</label>
                {hours ? <><input aria-label={`${name} opens`} type="time" value={minuteTime(hours.startMinute)} onChange={event => setHour(dayOfWeek, 'startMinute', event.target.value)} style={field} /><span>to</span><input aria-label={`${name} closes`} type="time" value={minuteTime(hours.endMinute)} onChange={event => setHour(dayOfWeek, 'endMinute', event.target.value)} style={field} /></> : <span style={{ color: '#706b66' }}>Closed</span>}
              </div>;
            })}
          </div>
          <button type="button" onClick={() => void saveLocation()} style={{ ...button, marginTop: 14 }}>Save location &amp; hours</button>
        </div>
      </section>

      <section style={panel}>
        <div style={sectionHeader}><div><h2 style={{ margin: 0 }}>Policies</h2><p style={{ color: '#706b66' }}>Only Client-visible policies may be shared as facts. Internal rules guide handling and remain separate.</p></div><button type="button" onClick={() => patchConfig({ rules: [...config.rules, { artistId: selectedArtist || config.artists[0]?.artistId || '', category: '', rule: '', visibility: 'CLIENT_VISIBLE', priority: config.rules.length, active: true }] })} style={secondary}>Add policy</button></div>
        {config.rules.map((rule, index) => <div key={rule.id || `rule-${index}`} style={recordRow}>
          <select aria-label="Policy artist" value={rule.artistId} onChange={event => patchConfig({ rules: config.rules.map((item, i) => i === index ? { ...item, artistId: event.target.value } : item) })} style={field}>{config.artists.map(artist => <option key={artist.artistId} value={artist.artistId}>{artist.displayName}</option>)}</select>
          <input aria-label="Policy category" placeholder="Category" maxLength={80} value={rule.category} onChange={event => patchConfig({ rules: config.rules.map((item, i) => i === index ? { ...item, category: event.target.value } : item) })} style={field} />
          <select aria-label="Policy visibility" value={rule.visibility} onChange={event => patchConfig({ rules: config.rules.map((item, i) => i === index ? { ...item, visibility: event.target.value as Visibility } : item) })} style={field}><option value="CLIENT_VISIBLE">Client visible</option><option value="AI_INTERNAL">AI internal</option></select>
          <label><input type="checkbox" checked={rule.active} onChange={event => patchConfig({ rules: config.rules.map((item, i) => i === index ? { ...item, active: event.target.checked } : item) })} /> Active</label>
          <textarea aria-label="Policy text" rows={2} maxLength={1200} value={rule.rule} onChange={event => patchConfig({ rules: config.rules.map((item, i) => i === index ? { ...item, rule: event.target.value } : item) })} style={{ ...field, gridColumn: '1 / -1' }} />
        </div>)}
      </section>

      <section style={panel}>
        <div style={sectionHeader}><div><h2 style={{ margin: 0 }}>FAQs</h2><p style={{ color: '#706b66' }}>Active answers are considered studio-provided facts.</p></div><button type="button" onClick={() => patchConfig({ faqs: [...config.faqs, { locationId: null, category: null, question: '', answer: '', active: true, sortOrder: config.faqs.length }] })} style={secondary}>Add FAQ</button></div>
        {config.faqs.map((faq, index) => <div key={faq.id || `faq-${index}`} style={recordRow}>
          <input aria-label="FAQ question" placeholder="Question" maxLength={240} value={faq.question} onChange={event => patchConfig({ faqs: config.faqs.map((item, i) => i === index ? { ...item, question: event.target.value } : item) })} style={field} />
          <input aria-label="FAQ category" placeholder="Category" maxLength={80} value={faq.category || ''} onChange={event => patchConfig({ faqs: config.faqs.map((item, i) => i === index ? { ...item, category: event.target.value } : item) })} style={field} />
          <select aria-label="FAQ location" value={faq.locationId || ''} onChange={event => patchConfig({ faqs: config.faqs.map((item, i) => i === index ? { ...item, locationId: event.target.value || null } : item) })} style={field}><option value="">All locations</option>{locations.filter(location => location.active).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
          <label><input type="checkbox" checked={faq.active} onChange={event => patchConfig({ faqs: config.faqs.map((item, i) => i === index ? { ...item, active: event.target.checked } : item) })} /> Active</label>
          <textarea aria-label="FAQ answer" rows={3} maxLength={1200} value={faq.answer} onChange={event => patchConfig({ faqs: config.faqs.map((item, i) => i === index ? { ...item, answer: event.target.value } : item) })} style={{ ...field, gridColumn: '1 / -1' }} />
        </div>)}
      </section>

      <section style={panel}>
        <div style={sectionHeader}><div><h2 style={{ margin: 0 }}>Aftercare</h2><p style={{ color: '#706b66' }}>Use client-specific studio instructions; categories and service types are free-form.</p></div><button type="button" onClick={() => patchConfig({ aftercare: [...config.aftercare, { locationId: null, serviceType: null, category: null, title: '', instructions: '', active: true, sortOrder: config.aftercare.length }] })} style={secondary}>Add aftercare</button></div>
        {config.aftercare.map((item, index) => <div key={item.id || `aftercare-${index}`} style={recordRow}>
          <input aria-label="Aftercare title" placeholder="Title" maxLength={160} value={item.title} onChange={event => patchConfig({ aftercare: config.aftercare.map((entry, i) => i === index ? { ...entry, title: event.target.value } : entry) })} style={field} />
          <input aria-label="Service type" placeholder="Service type" maxLength={80} value={item.serviceType || ''} onChange={event => patchConfig({ aftercare: config.aftercare.map((entry, i) => i === index ? { ...entry, serviceType: event.target.value } : entry) })} style={field} />
          <input aria-label="Aftercare category" placeholder="Category" maxLength={80} value={item.category || ''} onChange={event => patchConfig({ aftercare: config.aftercare.map((entry, i) => i === index ? { ...entry, category: event.target.value } : entry) })} style={field} />
          <label><input type="checkbox" checked={item.active} onChange={event => patchConfig({ aftercare: config.aftercare.map((entry, i) => i === index ? { ...entry, active: event.target.checked } : entry) })} /> Active</label>
          <textarea aria-label="Aftercare instructions" rows={4} maxLength={2000} value={item.instructions} onChange={event => patchConfig({ aftercare: config.aftercare.map((entry, i) => i === index ? { ...entry, instructions: event.target.value } : entry) })} style={{ ...field, gridColumn: '1 / -1' }} />
        </div>)}
      </section>

      <section style={panel}>
        <h2 style={{ marginTop: 0 }}>AI receptionist</h2>
        <label style={label}>Artist profile
          <select value={selectedArtist} onChange={event => setSelectedArtist(event.target.value)} style={field}>{config.artists.map(artist => <option key={artist.artistId} value={artist.artistId}>{artist.displayName}</option>)}</select>
        </label>
        {activeArtist && <>
          <div style={toggleRow}>
            <label><input type="checkbox" checked={activeArtist.receptionistEnabled} onChange={event => updateArtist({ receptionistEnabled: event.target.checked })} /> Receptionist enabled</label>
          </div>
          <div style={{ ...grid, marginTop: 14 }}>
            <label style={label}>Response length<select value={activeArtist.responseLength} onChange={event => updateArtist({ responseLength: event.target.value as ResponseLength })} style={field}><option value="SHORT">Short</option><option value="STANDARD">Standard</option><option value="DETAILED">Detailed</option></select></label>
            <label style={label}>Tone<select value={activeArtist.receptionistTone} onChange={event => updateArtist({ receptionistTone: event.target.value as Tone })} style={field}><option value="WARM">Warm</option><option value="PROFESSIONAL">Professional</option><option value="FRIENDLY">Friendly</option></select></label>
            <label style={{ ...label, gridColumn: '1 / -1' }}>Greeting guidance<textarea maxLength={240} rows={2} value={activeArtist.receptionistGreeting || ''} onChange={event => updateArtist({ receptionistGreeting: event.target.value })} style={field} /></label>
            <label style={{ ...label, gridColumn: '1 / -1' }}>Additional instructions<textarea maxLength={1200} rows={4} value={activeArtist.receptionistInstructions || ''} onChange={event => updateArtist({ receptionistInstructions: event.target.value })} style={field} /><small>Used as bounded configuration data. It cannot override safety, tenant, compliance, or confirmation requirements.</small></label>
          </div>
        </>}
      </section>
      <button type="submit" disabled={saving} style={{ ...button, marginTop: 18 }}>{saving ? 'Saving…' : 'Save configuration'}</button>
    </form>
  </main>;
}

const sectionHeader = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' as const };
const toggleRow = { display: 'flex', gap: 18, flexWrap: 'wrap' as const, marginTop: 14, fontSize: 13 };
const recordRow = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, borderTop: '1px solid #eee', padding: '14px 0' };
const hoursRow = { display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) minmax(100px, 140px) auto minmax(100px, 140px)', gap: 10, alignItems: 'center' };
