'use client';
import KnowledgeSuggestions from '@/components/studio-knowledge-suggestions';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/components/session-gate';
import StudioLogoSetting from './studio-logo-setting';
import IndustrySettings from '@/components/industry-settings';
import { industrySettings, type IndustrySettingsValue } from '@/packages/onboarding/industry';
import styles from './studio-settings.module.css';

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
type ArtistSettings = { artistId: string; displayName: string; bio: string | null; bookingEnabled: boolean; requiresSupervisorApproval: boolean; receptionistEnabled: boolean; receptionistTone: Tone; receptionistGreeting: string | null; receptionistInstructions: string | null; responseLength: ResponseLength };
type Config = { profile: { publicName: string | null; publicPhone: string | null; publicEmail: string | null; website: string | null; timezone: string }; rules: Rule[]; faqs: Faq[]; aftercare: Aftercare[]; artists: ArtistSettings[] };

type LocationDraft = Omit<Location, 'id' | 'hours'> & { id?: string; hours: Hours[] };
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const field = { width: '100%', boxSizing: 'border-box' as const, padding: '12px 14px', border: '1px solid #ded9e5', borderRadius: 11, font: 'inherit' };
const label = { display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 };
const panel = { border: '1px solid #e6e3ec', borderRadius: 20, padding: 26, background: '#fff', marginTop: 16 };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 14 };
const button = { border: 0, borderRadius: 11, padding: '12px 18px', background: '#181716', color: '#fff', fontWeight: 700, cursor: 'pointer' };
const secondary = { border: '1px solid #ded9e5', borderRadius: 11, padding: '11px 16px', background: '#fff', color: '#181716', fontWeight: 600, cursor: 'pointer' };
const emptyLocation: LocationDraft = { name: '', addressLine1: '', addressLine2: '', city: '', region: '', postalCode: '', country: '', phone: '', email: '', timezone: 'America/Denver', businessHoursConfigured: false, isPrimary: true, active: true, hours: [] };

function minuteTime(value: number) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }
function timeMinute(value: string) { const [hour, minute] = value.split(':').map(Number); return hour! * 60 + minute!; }
function nullable(value: string | null | undefined) { return value?.trim() || null; }
async function readJson(response: Response) {
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.message === 'string' ? value.message : typeof value.error === 'string' ? value.error : 'Unable to save studio configuration.');
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
  const [addingArtist, setAddingArtist] = useState(false);
  const [newArtistName, setNewArtistName] = useState('');
  const [newArtistBio, setNewArtistBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [industry, setIndustry] = useState<IndustrySettingsValue | null>(null);
  const [savedIndustry, setSavedIndustry] = useState<IndustrySettingsValue | null>(null);
  const [industryError, setIndustryError] = useState('');
  const [industryRefresh, setIndustryRefresh] = useState(0);
  const [industrySaveVersion, setIndustrySaveVersion] = useState(0);

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
  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    setIndustry(null); setSavedIndustry(null); setIndustryError('');
    fetch('/api/studio/industry', { cache: 'no-store', signal: controller.signal }).then(readJson).then(data => {
      if (!controller.signal.aborted) { setIndustry(data.settings); setSavedIndustry(data.settings); }
    }).catch(reason => {
      if (!controller.signal.aborted) setIndustryError(reason instanceof Error ? reason.message : 'Unable to load specialties and forms.');
    });
    return () => controller.abort();
  }, [organizationId, industryRefresh]);

  const activeArtist = useMemo(() => config?.artists.find(artist => artist.artistId === selectedArtist), [config, selectedArtist]);

  async function saveConfiguration(event: FormEvent) {
    event.preventDefault();
    if (!config || saving) return;
    setError(''); setNotice('');
    if (user?.role === 'OWNER' && (!industry || !savedIndustry)) {
      setError('Load specialties and forms before saving. Retry loading the section.');
      return;
    }
    const changedIndustry = user?.role === 'OWNER' && JSON.stringify(industry) !== JSON.stringify(savedIndustry);
    const validatedIndustry = changedIndustry ? industrySettings.safeParse(industry) : null;
    if (validatedIndustry && !validatedIndustry.success) {
      const issue = validatedIndustry.error.issues[0];
      setError(issue.path[0] === 'industries' ? 'Select at least one valid business specialty.' : `Check staff terminology: ${issue.message}`);
      return;
    }
    setSaving(true);
    try {
      const result = await readJson(await fetch('/api/studio/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          profile: { ...config.profile, publicName: nullable(config.profile.publicName), publicPhone: nullable(config.profile.publicPhone), publicEmail: nullable(config.profile.publicEmail), website: nullable(config.profile.website) },
          rules: config.rules,
          faqs: config.faqs.map(faq => ({ ...faq, category: nullable(faq.category) })),
          aftercare: config.aftercare.map(item => ({ ...item, category: nullable(item.category), serviceType: nullable(item.serviceType) })),
          artists: config.artists.map(artist => ({ ...artist, bio: nullable(artist.bio), receptionistGreeting: nullable(artist.receptionistGreeting), receptionistInstructions: nullable(artist.receptionistInstructions) })),
          ...(validatedIndustry?.success ? { industry: validatedIndustry.data } : {}),
        }),
      }));
      const attachIds = <T extends { id?: string }>(items: T[], ids: string[]) => {
        let index = 0;
        return items.map(item => item.id ? item : { ...item, id: ids[index++] });
      };
      setConfig(current => current ? { ...current, rules: attachIds(current.rules, result.created.rules), faqs: attachIds(current.faqs, result.created.faqs), aftercare: attachIds(current.aftercare, result.created.aftercare) } : current);
      if (validatedIndustry?.success) {
        setIndustry(validatedIndustry.data); setSavedIndustry(validatedIndustry.data);
        window.dispatchEvent(new Event('maia-industry-settings'));
      }
      setIndustrySaveVersion(version => version + 1);
      setNotice('Studio configuration saved.');
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
      const { id, hours } = locationDraft;
      const payload = {
        organizationId,
        ...(id ? { locationId: id } : {}),
        name: locationDraft.name,
        addressLine1: locationDraft.addressLine1,
        addressLine2: locationDraft.addressLine2,
        city: locationDraft.city,
        region: locationDraft.region,
        postalCode: locationDraft.postalCode,
        country: locationDraft.country,
        phone: locationDraft.phone,
        email: locationDraft.email,
        timezone: locationDraft.timezone,
        isPrimary: locationDraft.isPrimary,
        active: locationDraft.active,
        hours,
      };
      const response = await fetch('/api/studio/locations', {
        method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  async function createArtist(event: FormEvent) {
    event.preventDefault();
    if (!organizationId || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await readJson(await fetch('/api/studio/artists', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, displayName: newArtistName, bio: nullable(newArtistBio), bookingEnabled: true }),
      }));
      await load();
      setSelectedArtist(result.artist.artistId);
      setAddingArtist(false);
      setNewArtistName(''); setNewArtistBio('');
      setNotice('Artist profile created.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create artist profile.');
    } finally { setSaving(false); }
  }

  if (!user) return null;
  if (loading && !config) return <main style={{ maxWidth: 960, margin: '0 auto', padding: 32 }}><h1>Studio Configuration</h1><p>Loading studio settings…</p></main>;
  if (!config) return <main style={{ maxWidth: 960, margin: '0 auto', padding: 32 }}><h1>Studio Configuration</h1><p role="alert">{error || 'Studio configuration could not be loaded.'}</p></main>;

  const patchConfig = (update: Partial<Config>) => { setNotice(''); setConfig(current => current ? { ...current, ...update } : current); };
  const updateArtist = (update: Partial<ArtistSettings>) => patchConfig({ artists: config.artists.map(artist => artist.artistId === selectedArtist ? { ...artist, ...update } : artist) });

  return <main className={styles.page}>
    <a href="/settings">← Settings</a>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>Your business, your way</span><h1>Studio settings</h1><p>Manage your public details, business specialties, and the knowledge Maia uses.</p></div>
      <button type="submit" form="studio-config-form" disabled={saving || (user.role === 'OWNER' && !industry)} style={button}>{saving ? 'Saving…' : 'Save configuration'}</button>
    </header>
    {error && <p role="alert" style={{ background: '#fff0f0', color: '#8b1e1e', padding: 12, borderRadius: 6 }}>{error}</p>}
    {notice && <p role="status" style={{ background: '#eef5ee', color: '#2f7651', padding: 12, borderRadius: 6 }}>{notice}</p>}

    {industry ? <IndustrySettings mode="embedded" settings={industry} onChange={value => { setIndustry(value); setNotice(''); }} disabled={user.role !== 'OWNER' || saving} saveVersion={industrySaveVersion} /> : <p role={industryError ? 'alert' : 'status'}>{industryError || 'Loading specialties and forms…'} {industryError && <button type="button" onClick={() => setIndustryRefresh(value => value + 1)}>Retry</button>}</p>}
    {industry && user.role !== 'OWNER' && <p>Only the business owner can change specialties and form settings.</p>}
    <StudioLogoSetting />
    <form id="artist-create-form" onSubmit={createArtist} />
    <form id="studio-config-form" noValidate onSubmit={saveConfiguration}>
      <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <section id="business-profile" style={panel}>
        <div className={styles.sectionTitle}><div><span className={styles.eyebrow}>Public website</span><h2>Business profile</h2><p>These details appear on your studio website. Leave phone or email blank to hide it.</p></div>{user.organization_slug && <a className={styles.previewLink} href={`/a/${encodeURIComponent(user.organization_slug)}`} target="_blank" rel="noreferrer">Preview website</a>}</div>
        <div style={grid}>
          <label style={label}>Public business name<input maxLength={120} value={config.profile.publicName || ''} onChange={event => patchConfig({ profile: { ...config.profile, publicName: event.target.value } })} style={field} /></label>
          <label style={label}>Public phone<input type="tel" autoComplete="tel" maxLength={32} value={config.profile.publicPhone || ''} onChange={event => patchConfig({ profile: { ...config.profile, publicPhone: event.target.value } })} style={field} /></label>
          <label style={label}>Public email<input autoComplete="email" type="email" maxLength={254} value={config.profile.publicEmail || ''} onChange={event => patchConfig({ profile: { ...config.profile, publicEmail: event.target.value } })} style={field} /></label>
          <label style={label}>External website (optional)<input type="url" maxLength={240} value={config.profile.website || ''} onChange={event => patchConfig({ profile: { ...config.profile, website: event.target.value } })} style={field} /></label>
          <label style={label}>Organization timezone<input maxLength={80} value={config.profile.timezone} onChange={event => patchConfig({ profile: { ...config.profile, timezone: event.target.value } })} style={field} /></label>
        </div>
      </section>

      <details id="locations" style={panel}><summary>Locations &amp; hours<span className={styles.summaryNote}>Addresses and operating hours</span></summary>
        <div style={sectionHeader}><div><h2 style={{ margin: 0 }}>Locations &amp; business hours</h2><p style={{ color: '#706b66' }}>Locations provide the address on your website. Website phone and email come only from the Business profile above. Operating hours are separate from bookable availability.</p></div><button type="button" onClick={() => editLocation('')} style={secondary}>Add location</button></div>
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
            <label style={label}>Location phone (for Maia)<input type="tel" maxLength={32} value={locationDraft.phone || ''} onChange={event => setLocationDraft({ ...locationDraft, phone: event.target.value })} style={field} /></label>
            <label style={label}>Location email (for Maia)<input type="email" maxLength={254} value={locationDraft.email || ''} onChange={event => setLocationDraft({ ...locationDraft, email: event.target.value })} style={field} /></label>
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
              return <div key={name} className={styles.hoursRow}>
                <label><input type="checkbox" checked={Boolean(hours)} onChange={event => setDay(dayOfWeek, event.target.checked)} /> {name}</label>
                {hours ? <><input aria-label={`${name} opens`} type="time" value={minuteTime(hours.startMinute)} onChange={event => setHour(dayOfWeek, 'startMinute', event.target.value)} style={field} /><span>to</span><input aria-label={`${name} closes`} type="time" value={minuteTime(hours.endMinute)} onChange={event => setHour(dayOfWeek, 'endMinute', event.target.value)} style={field} /></> : <span style={{ color: '#706b66' }}>Closed</span>}
              </div>;
            })}
          </div>
          <button type="button" onClick={() => void saveLocation()} style={{ ...button, marginTop: 14 }}>Save location &amp; hours</button>
        </div>
      </details>

      <section id="knowledge" style={{ ...panel, scrollMarginTop: 100 }}>
        <h2 style={{ marginTop: 0 }}>Studio knowledge</h2><p>Tell Maia how you work, in your own words. No separate setup is needed for every question. Prices, deposits, hours, and booking permissions stay in their dedicated settings.</p>
        <label style={label}>Knowledge for artist<select value={selectedArtist} onChange={event=>setSelectedArtist(event.target.value)} style={field}>{config.artists.map(artist=><option key={artist.artistId} value={artist.artistId}>{artist.displayName}</option>)}</select></label>
        {config.rules.map((rule,index)=>rule.artistId===selectedArtist&&rule.visibility==='CLIENT_VISIBLE'?<div key={rule.id||`note-${index}`} style={{marginTop:14}}><textarea aria-label="Studio knowledge note" rows={3} maxLength={1200} value={rule.rule} onChange={event=>patchConfig({rules:config.rules.map((item,i)=>i===index?{...item,rule:event.target.value}:item)})} style={field}/><label><input type="checkbox" checked={rule.active} onChange={event=>patchConfig({rules:config.rules.map((item,i)=>i===index?{...item,active:event.target.checked}:item)})}/> Use this note in future replies</label></div>:null)}
        <button type="button" style={{...secondary,marginTop:12}} onClick={()=>patchConfig({rules:[...config.rules,{artistId:selectedArtist,category:'STUDIO_KNOWLEDGE',rule:'',visibility:'CLIENT_VISIBLE',priority:100,active:true}]})}>Add a note</button>
        <KnowledgeSuggestions artistId={selectedArtist} onApproved={rule=>setConfig(current=>current?{...current,rules:[...current.rules.filter(item=>item.id!==rule.id),rule]}:current)}/>
      </section>

      <details style={panel}><summary style={{fontWeight:700,cursor:'pointer'}}>Advanced knowledge controls · optional</summary>
        <div style={sectionHeader}><div><h2 style={{ margin: 0 }}>Policies</h2><p style={{ color: '#706b66' }}>Only Client-visible policies may be shared as facts. Internal rules guide handling and remain separate.</p></div><button type="button" onClick={() => patchConfig({ rules: [...config.rules, { artistId: selectedArtist || config.artists[0]?.artistId || '', category: '', rule: '', visibility: 'CLIENT_VISIBLE', priority: config.rules.length, active: true }] })} style={secondary}>Add policy</button></div>
        {config.rules.map((rule, index) => <div key={rule.id || `rule-${index}`} style={recordRow}>
          <select aria-label="Policy artist" value={rule.artistId} onChange={event => patchConfig({ rules: config.rules.map((item, i) => i === index ? { ...item, artistId: event.target.value } : item) })} style={field}>{config.artists.map(artist => <option key={artist.artistId} value={artist.artistId}>{artist.displayName}</option>)}</select>
          <input aria-label="Policy category" placeholder="Category" maxLength={80} value={rule.category} onChange={event => patchConfig({ rules: config.rules.map((item, i) => i === index ? { ...item, category: event.target.value } : item) })} style={field} />
          <select aria-label="Policy visibility" value={rule.visibility} onChange={event => patchConfig({ rules: config.rules.map((item, i) => i === index ? { ...item, visibility: event.target.value as Visibility } : item) })} style={field}><option value="CLIENT_VISIBLE">Client visible</option><option value="AI_INTERNAL">AI internal</option></select>
          <label><input type="checkbox" checked={rule.active} onChange={event => patchConfig({ rules: config.rules.map((item, i) => i === index ? { ...item, active: event.target.checked } : item) })} /> Active</label>
          <textarea aria-label="Policy text" rows={2} maxLength={1200} value={rule.rule} onChange={event => patchConfig({ rules: config.rules.map((item, i) => i === index ? { ...item, rule: event.target.value } : item) })} style={{ ...field, gridColumn: '1 / -1' }} />
        </div>)}
      </details>

      <details id="studio-faqs" style={panel}><summary>FAQs<span className={styles.summaryNote}>Answers for your website &amp; Maia</span></summary>
        <div style={sectionHeader}><div><h2 style={{ margin: 0 }}>FAQs</h2><p style={{ color: '#706b66' }}>Active questions appear on your public website and help Maia answer clients. Save configuration to publish changes.</p></div><button type="button" onClick={() => patchConfig({ faqs: [...config.faqs, { locationId: null, category: null, question: '', answer: '', active: true, sortOrder: config.faqs.length }] })} style={secondary}>Add FAQ</button></div>
        {config.faqs.map((faq, index) => <div key={faq.id || `faq-${index}`} style={recordRow}>
          <input aria-label="FAQ question" placeholder="Question" maxLength={240} value={faq.question} onChange={event => patchConfig({ faqs: config.faqs.map((item, i) => i === index ? { ...item, question: event.target.value } : item) })} style={field} />
          <input aria-label="FAQ category" placeholder="Category" maxLength={80} value={faq.category || ''} onChange={event => patchConfig({ faqs: config.faqs.map((item, i) => i === index ? { ...item, category: event.target.value } : item) })} style={field} />
          <select aria-label="FAQ location" value={faq.locationId || ''} onChange={event => patchConfig({ faqs: config.faqs.map((item, i) => i === index ? { ...item, locationId: event.target.value || null } : item) })} style={field}><option value="">All locations</option>{locations.filter(location => location.active).map(location => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
          <label><input type="checkbox" checked={faq.active} onChange={event => patchConfig({ faqs: config.faqs.map((item, i) => i === index ? { ...item, active: event.target.checked } : item) })} /> Active</label>
          <textarea aria-label="FAQ answer" rows={3} maxLength={1200} value={faq.answer} onChange={event => patchConfig({ faqs: config.faqs.map((item, i) => i === index ? { ...item, answer: event.target.value } : item) })} style={{ ...field, gridColumn: '1 / -1' }} />
        </div>)}
      </details>

      <details style={panel}><summary style={{fontWeight:700,cursor:'pointer'}}>Aftercare instructions · optional</summary>
        <div style={sectionHeader}><div><h2 style={{ margin: 0 }}>Aftercare</h2><p style={{ color: '#706b66' }}>Use client-specific studio instructions; categories and service types are free-form.</p></div><button type="button" onClick={() => patchConfig({ aftercare: [...config.aftercare, { locationId: null, serviceType: null, category: null, title: '', instructions: '', active: true, sortOrder: config.aftercare.length }] })} style={secondary}>Add aftercare</button></div>
        {config.aftercare.map((item, index) => <div key={item.id || `aftercare-${index}`} style={recordRow}>
          <input aria-label="Aftercare title" placeholder="Title" maxLength={160} value={item.title} onChange={event => patchConfig({ aftercare: config.aftercare.map((entry, i) => i === index ? { ...entry, title: event.target.value } : entry) })} style={field} />
          <input aria-label="Service type" placeholder="Service type" maxLength={80} value={item.serviceType || ''} onChange={event => patchConfig({ aftercare: config.aftercare.map((entry, i) => i === index ? { ...entry, serviceType: event.target.value } : entry) })} style={field} />
          <input aria-label="Aftercare category" placeholder="Category" maxLength={80} value={item.category || ''} onChange={event => patchConfig({ aftercare: config.aftercare.map((entry, i) => i === index ? { ...entry, category: event.target.value } : entry) })} style={field} />
          <label><input type="checkbox" checked={item.active} onChange={event => patchConfig({ aftercare: config.aftercare.map((entry, i) => i === index ? { ...entry, active: event.target.checked } : entry) })} /> Active</label>
          <textarea aria-label="Aftercare instructions" rows={4} maxLength={2000} value={item.instructions} onChange={event => patchConfig({ aftercare: config.aftercare.map((entry, i) => i === index ? { ...entry, instructions: event.target.value } : entry) })} style={{ ...field, gridColumn: '1 / -1' }} />
        </div>)}
      </details>

      <details id="receptionist" style={{...panel,scrollMarginTop:100}} ref={node=>{if(node && window.location.hash==='#receptionist'){node.open=true;node.scrollIntoView();}}}><summary style={{fontWeight:700,cursor:'pointer'}}>Artist permissions &amp; Maia preferences</summary>
        <div style={sectionHeader}><div><h2 style={{ margin: 0 }}>Artist &amp; AI receptionist</h2><p style={{ color: '#706b66' }}>Artist ownership and receptionist settings remain artist-scoped.</p></div><button type="button" onClick={() => setAddingArtist(value => !value)} style={secondary}>{addingArtist ? 'Cancel' : 'Add artist'}</button></div>
        {addingArtist && <div style={{ ...panel, padding: 14 }}><div style={grid}><label style={label}>Artist display name<input form="artist-create-form" required minLength={2} maxLength={120} value={newArtistName} onChange={event => setNewArtistName(event.target.value)} style={field} /></label><label style={label}>Public bio<textarea form="artist-create-form" maxLength={1200} rows={2} value={newArtistBio} onChange={event => setNewArtistBio(event.target.value)} style={field} /></label></div><button form="artist-create-form" type="submit" disabled={saving} style={{ ...button, marginTop: 10 }}>{saving ? 'Creating…' : 'Create artist'}</button></div>}
        <label style={label}>Artist profile
          <select value={selectedArtist} onChange={event => setSelectedArtist(event.target.value)} style={field}>{config.artists.map(artist => <option key={artist.artistId} value={artist.artistId}>{artist.displayName}</option>)}</select>
        </label>
        {activeArtist && <>

          <div style={toggleRow}>
            <label><input type="checkbox" disabled={user.role!=='OWNER'} checked={activeArtist.requiresSupervisorApproval} onChange={event => updateArtist({ requiresSupervisorApproval: event.target.checked })} /> Requires owner approval (apprentice)</label>
            <label><input type="checkbox" checked={activeArtist.bookingEnabled} onChange={event => updateArtist({ bookingEnabled: event.target.checked })} /> Booking enabled</label>
            <label><input type="checkbox" checked={activeArtist.receptionistEnabled} onChange={event => updateArtist({ receptionistEnabled: event.target.checked })} /> Receptionist enabled</label>
          </div>
          <div style={{ ...grid, marginTop: 14 }}>
            <label style={label}>Artist display name<input maxLength={120} value={activeArtist.displayName} onChange={event => updateArtist({ displayName: event.target.value })} style={field} /></label>
            <label style={{ ...label, gridColumn: '1 / -1' }}>Public bio<textarea maxLength={1200} rows={3} value={activeArtist.bio || ''} onChange={event => updateArtist({ bio: event.target.value })} style={field} /></label>
            <label style={label}>Response length<select value={activeArtist.responseLength} onChange={event => updateArtist({ responseLength: event.target.value as ResponseLength })} style={field}><option value="SHORT">Short</option><option value="STANDARD">Standard</option><option value="DETAILED">Detailed</option></select></label>
            <label style={label}>Tone<select value={activeArtist.receptionistTone} onChange={event => updateArtist({ receptionistTone: event.target.value as Tone })} style={field}><option value="WARM">Warm</option><option value="PROFESSIONAL">Professional</option><option value="FRIENDLY">Friendly</option></select></label>
            <label style={{ ...label, gridColumn: '1 / -1' }}>Greeting guidance<textarea maxLength={240} rows={2} value={activeArtist.receptionistGreeting || ''} onChange={event => updateArtist({ receptionistGreeting: event.target.value })} style={field} /></label>
            <label style={{ ...label, gridColumn: '1 / -1' }}>Additional instructions<textarea maxLength={1200} rows={4} value={activeArtist.receptionistInstructions || ''} onChange={event => updateArtist({ receptionistInstructions: event.target.value })} style={field} /><small>Used as bounded configuration data. It cannot override safety, tenant, compliance, or confirmation requirements.</small></label>
          </div>
        </>}
      </details>
      <button type="submit" disabled={saving || (user.role === 'OWNER' && !industry)} style={{ ...button, marginTop: 18 }}>{saving ? 'Saving…' : 'Save configuration'}</button>
      </fieldset>
    </form>
  </main>;
}

const sectionHeader = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' as const };
const toggleRow = { display: 'flex', gap: 18, flexWrap: 'wrap' as const, marginTop: 14, fontSize: 13 };
const recordRow = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, borderTop: '1px solid #eee', padding: '14px 0' };
