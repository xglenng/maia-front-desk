"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useSession } from "@/components/session-gate";
import { LegalCustomerSetup } from "@/components/legal-customer-setup";

type Readiness = { ready: boolean; missing: string[]; completed: number; total: number };
type Profile = { status: string; statusMessage?: string | null; providerErrors?: unknown; readiness: Readiness; hasBusinessRegistrationNumber: boolean; businessRegistrationNumberLast4?: string | null; [key: string]: unknown };
type Event = { id: string; phase: string; action: string; status: string; providerSid?: string | null; details?: { messagingServiceSid?: string; senders?: Array<{ sid?: string; phoneNumber?: string }> } | null; createdAt: string };
type ConsentForm = { artistId: string; artistName: string; mode: string; ready: boolean; publicUrl: string; messageFlow: string; campaign?: { description: string; messageFlow: string; samples: string[]; useCase: string; hasEmbeddedLinks: boolean; hasEmbeddedPhone: boolean; helpMessage: string; optOutMessage: string; optInKeywords: string[] } | null };

const field = { width: "100%", padding: 12, border: "1px solid #ddd7d0", borderRadius: 8, font: "inherit" };
const label = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600 };
const card = { background: "white", border: "1px solid #e8e4df", borderRadius: 12, padding: 22, marginTop: 16 };
const initialForm = {
  businessType: "LLC", businessRegistrationNumber: "", contactFirstName: "", contactLastName: "", contactPhone: "",
  representativeBusinessTitle: "Owner", representativeJobPosition: "Other", addressLine1: "", addressLine2: "", city: "", region: "", postalCode: "",
  industry: "CONSUMER", campaignUseCase: "CUSTOMER_CARE", campaignDescription: "",
  messageFlow: "", sample1: "", sample2: "", optInKeywords: "START, UNSTOP", helpMessage: "", optOutMessage: "",
  hasEmbeddedLinks: false, hasEmbeddedPhoneNumbers: false, subscriberOptIn: true
};

export default function A2pRegistrationPage() {
  const user = useSession();
  const organizationId = user?.organization_id ?? "";
  const loadRequestId = useRef(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"mock" | "live">("live");
  const [events, setEvents] = useState<Event[]>([]);
  const [consentForms, setConsentForms] = useState<ConsentForm[]>([]);
  const [busy, setBusy] = useState(false);
  const [adoptMessagingServiceSid, setAdoptMessagingServiceSid] = useState("");
  const [form, setForm] = useState({ ...initialForm });

  const set = (name: string, value: string | boolean) => setForm((old) => ({ ...old, [name]: value }));

  const artifacts = (profile?.twilioArtifacts || {}) as { adoptedExistingRegistration?: boolean; messagingServiceSid?: string; senderSids?: string[] };
  const adoptedExisting = artifacts.adoptedExistingRegistration === true;
  const adoptionEvent = events.find(event => event.phase === "ADOPTION" && event.action === "ADOPT_EXISTING" && event.status === "SUCCESS");
  const adoptedMessagingServiceSid = artifacts.messagingServiceSid || adoptionEvent?.details?.messagingServiceSid || "";
  const adoptedSenders = adoptionEvent?.details?.senders?.filter(sender => sender.phoneNumber) || [];
  async function load() {
    if (!organizationId) return;
    const requestId = ++loadRequestId.current;
    setBusy(true); setMessage("");
    const res = await fetch(`/api/compliance/registration?organizationId=${encodeURIComponent(organizationId)}`);
    const data = await res.json();
    if (requestId !== loadRequestId.current) return;
    setBusy(false);
    if (!res.ok) return setMessage(data.error || "Unable to load registration.");
    setProfile(data.profile); setMode(data.mode || "live"); setEvents(data.events || []); setConsentForms(data.consentForms || []);
    setForm((old) => ({ ...old, ...Object.fromEntries(Object.entries(data.profile).filter(([key, value]) => key in old && typeof value !== "object")), businessRegistrationNumber: "", sample1: data.profile.sampleMessages?.[0] || old.sample1, sample2: data.profile.sampleMessages?.[1] || old.sample2, optInKeywords: (data.profile.optInKeywords || ["START", "UNSTOP"]).join(", ") }));
  }

  useEffect(() => {
    loadRequestId.current += 1;
    setProfile(null); setMessage(""); setMode("live"); setEvents([]); setConsentForms([]);
    setAdoptMessagingServiceSid(""); setBusy(false); setForm({ ...initialForm });
    if (organizationId) void load();
  }, [organizationId]);

  async function save(event: FormEvent) {
    event.preventDefault(); const requestId = loadRequestId.current; setBusy(true); setMessage("");
    const { sample1, sample2, optInKeywords, businessRegistrationNumber, ...fields } = form;
    const payload = { ...fields, organizationId, ...(businessRegistrationNumber ? { businessRegistrationNumber } : {}), sampleMessages: [sample1, sample2], optInKeywords: optInKeywords.split(",").map(x => x.trim().toUpperCase()).filter(Boolean) };
    const res = await fetch("/api/compliance/registration", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (requestId !== loadRequestId.current) return;
    setBusy(false);
    if (!res.ok) return setMessage(typeof data.error === "string" ? data.error : "Review the highlighted registration fields.");
    setProfile(data.profile); setForm(old => ({
      ...old,
      businessRegistrationNumber: "",
      campaignUseCase: data.profile.campaignUseCase || old.campaignUseCase,
      campaignDescription: data.profile.campaignDescription || "",
      messageFlow: data.profile.messageFlow || "",
      sample1: data.profile.sampleMessages?.[0] || "",
      sample2: data.profile.sampleMessages?.[1] || "",
      optInKeywords: (data.profile.optInKeywords || ["START", "UNSTOP"]).join(", "),
      helpMessage: data.profile.helpMessage || "",
      optOutMessage: data.profile.optOutMessage || "",
      hasEmbeddedLinks: Boolean(data.profile.hasEmbeddedLinks),
      hasEmbeddedPhoneNumbers: Boolean(data.profile.hasEmbeddedPhoneNumbers),
      subscriberOptIn: Boolean(data.profile.subscriberOptIn),
    })); setMessage("Registration intake saved.");
  }

  async function submit() {
    const requestId = loadRequestId.current; setBusy(true); setMessage("");
    const res = await fetch("/api/compliance/registration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId }) });
    const data = await res.json();
    if (requestId !== loadRequestId.current) return;
    setBusy(false);
    if (!res.ok) return setMessage(data.missing?.length ? `Still required: ${data.missing.join(", ")}` : data.error || "Submission failed.");
    setProfile(data.profile); setMessage(data.mode === "mock" ? "Registration submitted in mock mode." : "Customer Profile submitted to Twilio. Use Sync Twilio status as each review stage completes.");
  }

  async function decision(mockDecision: "APPROVED" | "REJECTED") {
    const requestId = loadRequestId.current; setBusy(true);
    const res = await fetch("/api/compliance/registration/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, mockDecision }) });
    const data = await res.json();
    if (requestId !== loadRequestId.current) return;
    setBusy(false); setMessage(data.statusMessage || data.error);
    if (res.ok) setProfile(old => old ? { ...old, status: data.status, statusMessage: data.statusMessage } : old);
  }

  async function adoptExisting() {
    const requestId = loadRequestId.current; setBusy(true); setMessage("");
    const res = await fetch("/api/compliance/registration/adopt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, messagingServiceSid: adoptMessagingServiceSid }) });
    const data = await res.json();
    if (requestId !== loadRequestId.current) return;
    setBusy(false);
    if (!res.ok) return setMessage(data.error || "Unable to adopt existing Twilio registration.");
    setMessage(`${data.message}${data.senders?.length ? ` Sender: ${data.senders.map((s: {phoneNumber?: string}) => s.phoneNumber).filter(Boolean).join(", ")}` : ""}`);
    await load();
  }

  async function sync() {
    const requestId = loadRequestId.current; setBusy(true); setMessage("");
    const res = await fetch("/api/compliance/registration/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId }) });
    const data = await res.json();
    if (requestId !== loadRequestId.current) return;
    setBusy(false); setMessage(data.statusMessage || data.error || "Status synchronized.");
    if (res.ok) await load();
  }

  return <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px 80px", fontFamily: "Arial, sans-serif", color: "#181716" }}>
    <a href="/settings" style={{ color: "#8f2f22" }}>← Owner settings</a> · <a href="/compliance" style={{ color: "#8f2f22" }}>Legal-page setup</a>
    <h1 style={{ marginBottom: 6 }}>A2P campaign registration</h1>
    <p style={{ color: "#77736e", lineHeight: 1.5 }}>Prepare each studio&apos;s SMS campaign for carrier review. Complete legal-page setup before submitting this form.</p>

    {organizationId && user?.role === 'OWNER' && <LegalCustomerSetup organizationId={organizationId} />}
    {!profile && <section style={card}><h2>{message ? 'Registration setup needed' : 'Loading your studio registration…'}</h2><p>{message || "Your signed-in studio is selected automatically."}</p></section>}

    {profile && <>
      {adoptedExisting && profile.status === "APPROVED" ? <section style={{...card,borderColor:"#b9d8c4"}}><h2 style={{marginTop:0}}>Existing Twilio Registration — Approved</h2><p style={{fontSize:14,lineHeight:1.6}}><strong>Outbound messaging is active.</strong> Maia adopted the studio&apos;s existing approved A2P registration and will not create duplicate registration resources.</p><div style={{display:"grid",gap:8,fontSize:13,marginTop:16}}>{Boolean(adoptedMessagingServiceSid) && <div><strong>Messaging Service:</strong> <code>{String(adoptedMessagingServiceSid)}</code></div>}{Boolean(profile.twilioCampaignSid) && <div><strong>Campaign:</strong> <code>{String(profile.twilioCampaignSid)}</code></div>}{Boolean(profile.twilioBrandSid) && <div><strong>Brand:</strong> <code>{String(profile.twilioBrandSid)}</code></div>}{adoptedSenders.length > 0 && <div><strong>Sender:</strong> {adoptedSenders.map(sender => sender.phoneNumber).join(", ")}</div>}<div><strong>Twilio status:</strong> APPROVED · <strong>Mode:</strong> {mode}</div></div>{Boolean(profile.statusMessage) && <p style={{color:"#5f6f64",fontSize:13,marginTop:16}}>{String(profile.statusMessage)}</p>}<button disabled={busy} onClick={sync} style={{marginTop:8,padding:"11px 18px"}}>Sync Twilio status</button></section> : <section style={card}><h2 style={{ marginTop: 0 }}>Readiness</h2><p><strong>{profile.readiness.completed}/{profile.readiness.total}</strong> requirements complete · Status: <strong>{profile.status}</strong> · Mode: <strong>{mode}</strong></p>{Boolean(profile.statusMessage) && <p>{String(profile.statusMessage)}</p>}{profile.readiness.missing.length > 0 && <p style={{ color: "#8f2f22" }}>Still required: {profile.readiness.missing.join(", ")}</p>}{Boolean(profile.providerErrors) && <details open><summary style={{color:"#8f2f22",fontWeight:700}}>Twilio review details</summary><pre style={{whiteSpace:"pre-wrap",fontSize:12}}>{JSON.stringify(profile.providerErrors,null,2)}</pre></details>}</section>}
      <section style={card}><h2 style={{marginTop:0}}>Customer opt-in evidence and campaign preview</h2>{consentForms.length ? consentForms.map(item => {
        const campaign = item.campaign;
        return <div key={item.artistId} style={{borderTop:"1px solid #eee",paddingTop:12,marginTop:12}}>
          <p><strong>{item.artistName}</strong> · {item.ready ? "Ready" : "Action required"} · {item.mode === "INBOUND_SMS_CONFIRMATION" ? "Client texts first; YES confirms subscription" : "Checked form box is affirmative consent"}<br/><a href={item.publicUrl} target="_blank">{item.publicUrl}</a></p>
          {campaign ? <>
            <p><strong>Campaign description</strong><br/>{campaign.description}</p>
            <p><strong>Message flow</strong><br/>{campaign.messageFlow}</p>
            <p><strong>Sample messages</strong><br/>{campaign.samples.map((sample, index) => <span key={index}>{index + 1}. {sample}<br/></span>)}</p>
            <p><strong>Opt-in keywords</strong><br/>{campaign.optInKeywords.join(", ")}</p>
            <p><strong>Opt-in behavior</strong><br/>{item.mode === "INBOUND_SMS_CONFIRMATION" ? "YES confirms only a pending request; START and UNSTOP are explicit opt-in/resubscribe commands." : "The checked web-form box records affirmative consent; no second YES is required. START and UNSTOP are explicit opt-in/resubscribe commands."}</p>
            <p><strong>HELP response</strong><br/>{campaign.helpMessage}</p>
            <p><strong>STOP response</strong><br/>{campaign.optOutMessage}<br/><small>Maia replies only when Twilio has not already handled the keyword.</small></p>
            <p><strong>Twilio use case:</strong> {campaign.useCase} · <strong>Embedded links:</strong> {String(campaign.hasEmbeddedLinks)} · <strong>Embedded phone:</strong> {String(campaign.hasEmbeddedPhone)}</p>
          </> : <p>Campaign preview unavailable. Reload registration details.</p>}
        </div>;
      }) : <p>No provisioned artist has a ready consent workflow. <a href="/settings/consent-forms">Configure SMS consent workflow</a>.</p>}<p style={{fontSize:13,color:"#6f6a64"}}>Campaign copy is generated per artist from this consent workflow and the saved registration settings.</p></section>
      {!adoptedExisting && <form onSubmit={save} style={card}>
        <h2 style={{ marginTop: 0 }}>Business and campaign details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          <label style={label}>Business type<select style={field} value={form.businessType} onChange={e=>set("businessType",e.target.value)}><option value="LLC">LLC</option><option value="SOLE_PROPRIETOR">Sole proprietor</option><option value="PARTNERSHIP">Partnership</option><option value="CORPORATION">Corporation</option><option value="NON_PROFIT">Nonprofit</option></select></label>
          <label style={label}>EIN / registration number<input style={field} type="password" placeholder={profile.hasBusinessRegistrationNumber ? `Saved ending in ${profile.businessRegistrationNumberLast4 || "••••"}` : "Required"} value={form.businessRegistrationNumber} onChange={e=>set("businessRegistrationNumber",e.target.value)} /></label>
          <label style={label}>Contact first name<input style={field} value={form.contactFirstName} onChange={e=>set("contactFirstName",e.target.value)} required /></label>
          <label style={label}>Contact last name<input style={field} value={form.contactLastName} onChange={e=>set("contactLastName",e.target.value)} required /></label>
          <label style={label}>Contact phone<input style={field} value={form.contactPhone} onChange={e=>set("contactPhone",e.target.value)} required /></label>
          <label style={label}>Representative business title<input style={field} value={form.representativeBusinessTitle} onChange={e=>set("representativeBusinessTitle",e.target.value)} required /></label>
          <label style={label}>Representative job position<select style={field} value={form.representativeJobPosition} onChange={e=>set("representativeJobPosition",e.target.value)}><option value="Other">Owner / Other</option><option value="CEO">CEO</option><option value="Director">Director</option><option value="GM">General Manager</option><option value="VP">VP</option><option value="CFO">CFO</option><option value="General Counsel">General Counsel</option></select></label>
          <label style={label}>Industry<select style={field} value={form.industry} onChange={e=>set("industry",e.target.value)}><option value="CONSUMER">Consumer services</option><option value="RETAIL">Retail</option><option value="HEALTHCARE">Healthcare</option><option value="HOSPITALITY">Hospitality</option><option value="ONLINE">Online</option><option value="TECHNOLOGY">Technology</option><option value="JEWELRY">Jewelry</option><option value="NOT_FOR_PROFIT">Not for profit</option></select></label>
          <label style={label}>Street address<input style={field} value={form.addressLine1} onChange={e=>set("addressLine1",e.target.value)} required /></label>
          <label style={label}>Address line 2<input style={field} value={form.addressLine2} onChange={e=>set("addressLine2",e.target.value)} /></label>
          <label style={label}>City<input style={field} value={form.city} onChange={e=>set("city",e.target.value)} required /></label>
          <label style={label}>State / region<input style={field} value={form.region} onChange={e=>set("region",e.target.value)} required /></label>
          <label style={label}>Postal code<input style={field} value={form.postalCode} onChange={e=>set("postalCode",e.target.value)} required /></label>
          <label style={label}>Use case<select style={field} value={form.campaignUseCase} onChange={e=>set("campaignUseCase",e.target.value)}><option value="CUSTOMER_CARE">Customer care</option><option value="APPOINTMENT_REMINDERS">Appointment reminders</option><option value="MARKETING">Marketing</option><option value="MIXED">Mixed</option></select></label>
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 16, fontSize: 13 }}><label><input type="checkbox" checked={form.hasEmbeddedLinks} onChange={e=>set("hasEmbeddedLinks",e.target.checked)} /> Messages contain links</label><label><input type="checkbox" checked={form.hasEmbeddedPhoneNumbers} onChange={e=>set("hasEmbeddedPhoneNumbers",e.target.checked)} /> Messages contain phone numbers</label><label><input type="checkbox" checked={form.subscriberOptIn} onChange={e=>set("subscriberOptIn",e.target.checked)} /> Internal Maia safety acknowledgement: outbound SMS is limited to affirmative consent or permitted contextual replies</label></div>
        <button disabled={busy} style={{ marginTop: 18, padding: "11px 18px", borderRadius: 8, border: 0, background: "#181716", color: "white" }}>Save registration intake</button>
      </form>}
      {!adoptedExisting && <section style={card}><h2 style={{marginTop:0}}>Twilio registration path</h2><h3>New to Twilio</h3><p style={{fontSize:13,color:"#6f6a64",lineHeight:1.5}}>Maia creates a Secondary Customer Profile for this studio under Maia&apos;s approved ISV profile, then advances through A2P Messaging Profile, Brand, and Campaign review. Maia blocks live submission when the business, privacy, or terms URLs are localhost/non-HTTPS.</p><button disabled={busy || !profile.readiness.ready || ["CUSTOMER_PROFILE_PENDING","A2P_PROFILE_PENDING","BRAND_PENDING","CAMPAIGN_PENDING","APPROVED","MOCK_PENDING","MOCK_APPROVED"].includes(profile.status)} onClick={submit} style={{ padding: "11px 18px", borderRadius: 8, border: 0, background: profile.readiness.ready ? "#8f2f22" : "#aaa", color: "white" }}>{mode === "mock" ? "Submit mock registration" : "Start new Twilio registration"}</button>{mode === "live" && Boolean(profile.twilioCustomerProfileSid) && <button disabled={busy} onClick={sync} style={{marginLeft:10,padding:"11px 18px"}}>Sync Twilio status</button>}{mode === "mock" && profile.status === "MOCK_PENDING" && <span style={{marginLeft:10}}><button onClick={()=>decision("APPROVED")}>Mock approve</button> <button onClick={()=>decision("REJECTED")}>Mock reject</button></span>}<hr style={{border:0,borderTop:"1px solid #eee",margin:"24px 0"}}/><h3>Already use Twilio</h3><p style={{fontSize:13,color:"#6f6a64",lineHeight:1.5}}>Adopt an existing approved registration instead of creating duplicates. Maia verifies the Secondary Profile, Brand, Campaign, Messaging Service, and sender directly with Twilio before saving anything.</p><label style={label}>Messaging Service SID (MG)<input style={field} value={adoptMessagingServiceSid} onChange={e=>setAdoptMessagingServiceSid(e.target.value.trim())} placeholder="MG..."/></label><p style={{fontSize:12,color:"#77736e"}}>Maia uses this service to discover the approved Campaign, Brand, Secondary Profile, and sender directly from Twilio. Those IDs are not trusted from manual input.</p><button type="button" disabled={busy || !adoptMessagingServiceSid} onClick={adoptExisting} style={{marginTop:16,padding:"11px 18px",borderRadius:8,border:0,background:"#181716",color:"white"}}>Verify and adopt existing registration</button></section>}
      {events.length > 0 && <section style={card}><h2 style={{marginTop:0}}>Registration history</h2>{events.map(event=><p key={event.id} style={{fontSize:13,borderTop:"1px solid #eee",paddingTop:10}}><strong>{event.phase}</strong> · {event.action} · {event.status}<br/><span style={{color:"#777"}}>{new Date(event.createdAt).toLocaleString()}{event.providerSid ? ` · ${event.providerSid}` : ""}</span></p>)}</section>}
    </>}
    {message && <div style={{...card,borderColor:"#ccb8ad"}}>{message}</div>}
  </main>;
}
