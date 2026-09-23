"use client";
import { FormEvent, useEffect, useState } from "react";
import { useSession } from "@/components/session-gate";

type Readiness = { ready: boolean; missing: string[]; completed: number; total: number };
type Profile = { status: string; statusMessage?: string | null; providerErrors?: unknown; readiness: Readiness; hasBusinessRegistrationNumber: boolean; businessRegistrationNumberLast4?: string | null; [key: string]: unknown };
type Event = { id: string; phase: string; action: string; status: string; providerSid?: string | null; createdAt: string };
type ConsentForm = { artistId: string; artistName: string; mode: string; ready: boolean; publicUrl: string; messageFlow: string };

const field = { width: "100%", padding: 12, border: "1px solid #ddd7d0", borderRadius: 8, font: "inherit" };
const label = { display: "grid", gap: 6, fontSize: 13, fontWeight: 600 };
const card = { background: "white", border: "1px solid #e8e4df", borderRadius: 12, padding: 22, marginTop: 16 };

export default function A2pRegistrationPage() {
  const user = useSession();
  const organizationId = user?.organization_id ?? "";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"mock" | "live">("live");
  const [events, setEvents] = useState<Event[]>([]);
  const [consentForms, setConsentForms] = useState<ConsentForm[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    businessType: "LLC", businessRegistrationNumber: "", contactFirstName: "", contactLastName: "", contactPhone: "",
    representativeBusinessTitle: "Owner", representativeJobPosition: "Owner", addressLine1: "", addressLine2: "", city: "", region: "", postalCode: "",
    industry: "Tattoo studio", campaignUseCase: "CUSTOMER_CARE", campaignDescription: "",
    messageFlow: "Clients initiate a conversation by texting the studio number or opt in through the studio booking form. The first automated response identifies the studio and explains that STOP opts out and HELP provides help.",
    sample1: "Embellished Studios: Thanks for contacting us. How can we help with your tattoo appointment? Reply STOP to opt out.",
    sample2: "Embellished Studios: Your appointment request was received. We will follow up shortly. Reply STOP to opt out.",
    optInKeywords: "START, YES", helpMessage: "Embellished Studios: Reply with your booking question or contact the studio directly. Reply STOP to opt out.",
    optOutMessage: "Embellished Studios: You have been opted out and will receive no further messages. Reply START to opt back in.",
    hasEmbeddedLinks: false, hasEmbeddedPhoneNumbers: false, subscriberOptIn: true
  });

  const set = (name: string, value: string | boolean) => setForm((old) => ({ ...old, [name]: value }));

  async function load() {
    if (!organizationId) return;
    setBusy(true); setMessage("");
    const res = await fetch(`/api/compliance/registration?organizationId=${encodeURIComponent(organizationId)}`);
    const data = await res.json(); setBusy(false);
    if (!res.ok) return setMessage(data.error || "Unable to load registration.");
    setProfile(data.profile); setMode(data.mode || "live"); setEvents(data.events || []); setConsentForms(data.consentForms || []);
    setForm((old) => ({ ...old, ...Object.fromEntries(Object.entries(data.profile).filter(([key, value]) => key in old && typeof value !== "object")), businessRegistrationNumber: "", sample1: data.profile.sampleMessages?.[0] || old.sample1, sample2: data.profile.sampleMessages?.[1] || old.sample2, optInKeywords: (data.profile.optInKeywords || ["START", "YES"]).join(", ") }));
  }

  useEffect(() => { if (organizationId) void load(); }, [organizationId]);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const { sample1, sample2, optInKeywords, businessRegistrationNumber, ...fields } = form;
    const payload = { ...fields, organizationId, ...(businessRegistrationNumber ? { businessRegistrationNumber } : {}), sampleMessages: [sample1, sample2], optInKeywords: optInKeywords.split(",").map(x => x.trim().toUpperCase()).filter(Boolean) };
    const res = await fetch("/api/compliance/registration", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json(); setBusy(false);
    if (!res.ok) return setMessage(typeof data.error === "string" ? data.error : "Review the highlighted registration fields.");
    setProfile(data.profile); setForm(old => ({ ...old, businessRegistrationNumber: "" })); setMessage("Registration intake saved.");
  }

  async function submit() {
    setBusy(true); setMessage("");
    const res = await fetch("/api/compliance/registration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId }) });
    const data = await res.json(); setBusy(false);
    if (!res.ok) return setMessage(data.missing?.length ? `Still required: ${data.missing.join(", ")}` : data.error || "Submission failed.");
    setProfile(data.profile); setMessage(data.mode === "mock" ? "Registration submitted in mock mode." : "Customer Profile submitted to Twilio. Use Sync Twilio status as each review stage completes.");
  }

  async function decision(mockDecision: "APPROVED" | "REJECTED") {
    setBusy(true);
    const res = await fetch("/api/compliance/registration/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, mockDecision }) });
    const data = await res.json(); setBusy(false); setMessage(data.statusMessage || data.error);
    if (res.ok) setProfile(old => old ? { ...old, status: data.status, statusMessage: data.statusMessage } : old);
  }

  async function sync() {
    setBusy(true); setMessage("");
    const res = await fetch("/api/compliance/registration/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId }) });
    const data = await res.json(); setBusy(false); setMessage(data.statusMessage || data.error || "Status synchronized.");
    if (res.ok) await load();
  }

  return <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 20px 80px", fontFamily: "Arial, sans-serif", color: "#181716" }}>
    <a href="/settings" style={{ color: "#8f2f22" }}>← Owner settings</a> · <a href="/compliance" style={{ color: "#8f2f22" }}>Legal-page setup</a>
    <h1 style={{ marginBottom: 6 }}>A2P campaign registration</h1>
    <p style={{ color: "#77736e", lineHeight: 1.5 }}>Prepare each studio&apos;s SMS campaign for carrier review. Complete legal-page setup before submitting this form.</p>

    {!profile && <section style={card}><h2>Loading your studio registration…</h2><p>{message || "Your signed-in studio is selected automatically."}</p></section>}

    {profile && <>
      <section style={card}><h2 style={{ marginTop: 0 }}>Readiness</h2><p><strong>{profile.readiness.completed}/{profile.readiness.total}</strong> requirements complete · Status: <strong>{profile.status}</strong> · Mode: <strong>{mode}</strong></p>{profile.statusMessage && <p>{profile.statusMessage}</p>}{profile.readiness.missing.length > 0 && <p style={{ color: "#8f2f22" }}>Still required: {profile.readiness.missing.join(", ")}</p>}{Boolean(profile.providerErrors) && <details open><summary style={{color:"#8f2f22",fontWeight:700}}>Twilio review details</summary><pre style={{whiteSpace:"pre-wrap",fontSize:12}}>{JSON.stringify(profile.providerErrors,null,2)}</pre></details>}</section>
      <section style={card}><h2 style={{marginTop:0}}>Customer opt-in evidence</h2>{consentForms.length ? consentForms.map(item => <p key={item.artistId}><strong>{item.artistName}</strong> · {item.ready ? "Ready" : "Action required"} · {item.mode === "INBOUND_SMS_CONFIRMATION" ? "Client texts first + YES confirmation" : "Form checkbox"}<br/><a href={item.publicUrl} target="_blank">{item.publicUrl}</a></p>) : <p>No provisioned artist has a ready consent workflow. <a href="/settings/consent-forms">Configure SMS consent workflow</a>.</p>}<p style={{fontSize:13,color:"#6f6a64"}}>Maia submits each artist&apos;s exact public URL and generated two-stage or form-based opt-in flow to Twilio.</p></section>
      <form onSubmit={save} style={card}>
        <h2 style={{ marginTop: 0 }}>Business and campaign details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          <label style={label}>Business type<select style={field} value={form.businessType} onChange={e=>set("businessType",e.target.value)}><option value="LLC">LLC</option><option value="SOLE_PROPRIETOR">Sole proprietor</option><option value="PARTNERSHIP">Partnership</option><option value="CORPORATION">Corporation</option><option value="NON_PROFIT">Nonprofit</option></select></label>
          <label style={label}>EIN / registration number<input style={field} type="password" placeholder={profile.hasBusinessRegistrationNumber ? `Saved ending in ${profile.businessRegistrationNumberLast4 || "••••"}` : "Required"} value={form.businessRegistrationNumber} onChange={e=>set("businessRegistrationNumber",e.target.value)} /></label>
          <label style={label}>Contact first name<input style={field} value={form.contactFirstName} onChange={e=>set("contactFirstName",e.target.value)} required /></label>
          <label style={label}>Contact last name<input style={field} value={form.contactLastName} onChange={e=>set("contactLastName",e.target.value)} required /></label>
          <label style={label}>Contact phone<input style={field} value={form.contactPhone} onChange={e=>set("contactPhone",e.target.value)} required /></label>
          <label style={label}>Representative business title<input style={field} value={form.representativeBusinessTitle} onChange={e=>set("representativeBusinessTitle",e.target.value)} required /></label>
          <label style={label}>Representative job position<input style={field} value={form.representativeJobPosition} onChange={e=>set("representativeJobPosition",e.target.value)} required /></label>
          <label style={label}>Industry<input style={field} value={form.industry} onChange={e=>set("industry",e.target.value)} required /></label>
          <label style={label}>Street address<input style={field} value={form.addressLine1} onChange={e=>set("addressLine1",e.target.value)} required /></label>
          <label style={label}>Address line 2<input style={field} value={form.addressLine2} onChange={e=>set("addressLine2",e.target.value)} /></label>
          <label style={label}>City<input style={field} value={form.city} onChange={e=>set("city",e.target.value)} required /></label>
          <label style={label}>State / region<input style={field} value={form.region} onChange={e=>set("region",e.target.value)} required /></label>
          <label style={label}>Postal code<input style={field} value={form.postalCode} onChange={e=>set("postalCode",e.target.value)} required /></label>
          <label style={label}>Use case<select style={field} value={form.campaignUseCase} onChange={e=>set("campaignUseCase",e.target.value)}><option value="CUSTOMER_CARE">Customer care</option><option value="APPOINTMENT_REMINDERS">Appointment reminders</option><option value="MARKETING">Marketing</option><option value="MIXED">Mixed</option></select></label>
        </div>
        {[["campaignDescription","Campaign description"],["messageFlow","How clients opt in"],["sample1","Sample message 1"],["sample2","Sample message 2"],["helpMessage","HELP response"],["optOutMessage","STOP response"]].map(([key,title]) => <label key={key} style={{...label,marginTop:14}}>{title}<textarea style={{...field,minHeight:key.includes("Description")||key==="messageFlow"?110:75}} value={String(form[key as keyof typeof form])} onChange={e=>set(key,e.target.value)} required /></label>)}
        <label style={{...label,marginTop:14}}>Opt-in keywords<input style={field} value={form.optInKeywords} onChange={e=>set("optInKeywords",e.target.value)} /></label>
        <div style={{ display: "grid", gap: 8, marginTop: 16, fontSize: 13 }}><label><input type="checkbox" checked={form.hasEmbeddedLinks} onChange={e=>set("hasEmbeddedLinks",e.target.checked)} /> Messages contain links</label><label><input type="checkbox" checked={form.hasEmbeddedPhoneNumbers} onChange={e=>set("hasEmbeddedPhoneNumbers",e.target.checked)} /> Messages contain phone numbers</label><label><input type="checkbox" checked={form.subscriberOptIn} onChange={e=>set("subscriberOptIn",e.target.checked)} /> I confirm Maia will send SMS only to recipients with recorded affirmative consent or a permitted inbound conversation</label></div>
        <button disabled={busy} style={{ marginTop: 18, padding: "11px 18px", borderRadius: 8, border: 0, background: "#181716", color: "white" }}>Save registration intake</button>
      </form>
      <section style={card}><h2 style={{marginTop:0}}>Submission</h2><button disabled={busy || !profile.readiness.ready || ["CUSTOMER_PROFILE_PENDING","A2P_PROFILE_PENDING","BRAND_PENDING","CAMPAIGN_PENDING","APPROVED","MOCK_PENDING","MOCK_APPROVED"].includes(profile.status)} onClick={submit} style={{ padding: "11px 18px", borderRadius: 8, border: 0, background: profile.readiness.ready ? "#8f2f22" : "#aaa", color: "white" }}>{mode === "mock" ? "Submit mock registration" : "Start live registration"}</button>{mode === "live" && Boolean(profile.twilioCustomerProfileSid) && <button disabled={busy} onClick={sync} style={{marginLeft:10,padding:"11px 18px"}}>Sync Twilio status</button>}{mode === "mock" && profile.status === "MOCK_PENDING" && <span style={{marginLeft:10}}><button onClick={()=>decision("APPROVED")}>Mock approve</button> <button onClick={()=>decision("REJECTED")}>Mock reject</button></span>}</section>
      {events.length > 0 && <section style={card}><h2 style={{marginTop:0}}>Registration history</h2>{events.map(event=><p key={event.id} style={{fontSize:13,borderTop:"1px solid #eee",paddingTop:10}}><strong>{event.phase}</strong> · {event.action} · {event.status}<br/><span style={{color:"#777"}}>{new Date(event.createdAt).toLocaleString()}{event.providerSid ? ` · ${event.providerSid}` : ""}</span></p>)}</section>}
    </>}
    {message && <div style={{...card,borderColor:"#ccb8ad"}}>{message}</div>}
  </main>;
}
