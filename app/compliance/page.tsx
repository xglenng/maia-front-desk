"use client";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session-gate";

type Document = { id: string; type: "PRIVACY" | "TERMS"; version: number; status: string; title: string; content: string; effectiveDate: string; publishedAt?: string | null };
type Profile = { organizationId: string; businessName: string; businessAddress: string; contactEmail: string; websiteUrl: string; smsEnabled: boolean; privacyPolicyUrl?: string | null; termsUrl?: string | null; status: string; statusMessage?: string | null };

const card: React.CSSProperties = { marginTop: 24, background: "#fff", border: "1px solid #e5e0da", borderRadius: 16, padding: 24, boxShadow: "0 8px 30px #00000008" };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 12, border: "1px solid #d9d3cc", borderRadius: 8, font: "inherit" };
const button: React.CSSProperties = { border: 0, borderRadius: 8, padding: "11px 16px", background: "#181716", color: "#fff", fontWeight: 700, cursor: "pointer" };
const secondary: React.CSSProperties = { ...button, background: "#fff", color: "#181716", border: "1px solid #cfc8c1" };

export default function CompliancePage() {
  const user = useSession();
  const [form, setForm] = useState({ organizationId: "", businessName: "", businessAddress: "", contactEmail: "", websiteUrl: "", hasWebsite: false, smsEnabled: true });
  const [hostedWebsiteUrl, setHostedWebsiteUrl] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [accept, setAccept] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<Document | null>(null);

  const update = (key: string, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));
  async function load() {
    if (!form.organizationId) return;
    try {
    const res = await fetch(`/api/compliance/documents?organizationId=${encodeURIComponent(form.organizationId)}`);
    const data = await res.json();
    if (res.ok) { setProfile(data.profile); setDocs(data.documents ?? []); const { hostedWebsiteUrl, ...defaults } = data.defaults; setHostedWebsiteUrl(hostedWebsiteUrl); setForm((f) => ({ ...f, ...defaults })); }
    else setMessage(data.error ?? "Unable to load compliance data");
    } catch { setMessage("Unable to load business information. Please refresh and try again."); }
    finally { setInitialLoading(false); }
  }
  useEffect(() => { if (user) setForm(f => ({ ...f, organizationId: user.organization_id })); }, [user]);
  useEffect(() => { if (form.organizationId) void load(); }, [form.organizationId]);

  async function saveBusiness(e: React.FormEvent) { e.preventDefault(); setLoading(true); setMessage(""); const res = await fetch("/api/compliance/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const data = await res.json(); setLoading(false); setMessage(res.ok ? "Business information saved. Maia also ensured each SMS-enabled artist has a hosted consent page." : data.error ?? "Unable to save."); if (res.ok) await load(); }
  async function generate() { if (!profile) return setMessage("Save the business information first."); setLoading(true); setMessage(""); const res = await fetch("/api/compliance/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const data = await res.json(); setLoading(false); setMessage(res.ok ? "New draft legal pages generated. Review and edit them below." : data.error ?? "Unable to generate."); if (res.ok) await load(); }
  function edit(id: string, content: string) { setDocs(all => all.map(d => d.id === id ? { ...d, content } : d)); }
  async function publish() { const drafts = docs.filter(d => d.status === "DRAFT"); if (drafts.length !== 2) return setMessage("You need a Privacy Policy and Terms draft before publishing."); if (!accept) return setMessage("Review both documents and check the acceptance box before publishing."); setLoading(true); setMessage(""); const res = await fetch("/api/compliance/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: form.organizationId, documents: drafts.map(({ id, type, content }) => ({ id, type, content })), acceptLegalPages: accept }) }); const data = await res.json(); setLoading(false); setMessage(res.ok ? "Legal pages published. The public Privacy Policy, Terms, and hosted SMS consent flow are ready for testing." : data.error ?? "Unable to publish."); if (res.ok) { setAccept(false); await load(); } }

  const privacy = docs.find(d => d.type === "PRIVACY" && d.status === "DRAFT");
  const terms = docs.find(d => d.type === "TERMS" && d.status === "DRAFT");
  const hosted = Boolean(profile && profile.websiteUrl.replace(/\/$/, "") === hostedWebsiteUrl);
  const legalReady = Boolean(profile?.privacyPolicyUrl && profile?.termsUrl);

  return <main style={{ minHeight: "100vh", background: "#f7f5f2", color: "#181716", padding: "44px 20px", fontFamily: "Arial, sans-serif" }}><div style={{ maxWidth: 980, margin: "0 auto" }}>
    <p style={{ margin: 0, color: "#8f2f22", fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }}>Maia compliance</p>
    <h1 style={{ fontSize: 38, margin: "8px 0" }}>SMS Compliance Setup</h1>
    <p style={{ color: "#6f6a64", lineHeight: 1.6 }}>Create the business identity, legal pages, and verifiable SMS opt-in surface used for A2P registration.</p>
    <p><a href="/settings">← Settings</a> · <a href="/compliance/registration">SMS campaign registration →</a></p>

    <form onSubmit={saveBusiness} style={card}>
      <h2 style={{ marginTop: 0 }}>1. Business information</h2>
      <fieldset disabled={initialLoading || loading} style={{ display: "grid", gap: 12, border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {([['businessName','Business name'],['businessAddress','Business address'],['contactEmail','Contact email']] as const).map(([key,label]) => <label key={key} style={{ display: "grid", gap: 6, fontWeight: 700 }}>{label}<input required style={input} value={form[key]} onChange={e=>update(key,e.target.value)} /></label>)}
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={form.hasWebsite} onChange={e=>update('hasWebsite',e.target.checked)} /> Use a different business website</label>
        {form.hasWebsite ? <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>Business website<input required style={input} placeholder="https://…" value={form.websiteUrl} onChange={e=>update('websiteUrl',e.target.value)} /></label> : <div style={{ padding: 14, borderRadius: 8, background: "#f7f5f2", color: "#5f5a55" }}>Maia hosts your business website. Use this address for SMS registration.<div style={{ marginTop: 8, overflowWrap: "anywhere", fontWeight: 700 }}>{hostedWebsiteUrl || "Loading your Maia website…"}</div></div>}
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={form.smsEnabled} onChange={e=>update('smsEnabled',e.target.checked)} /> Enable SMS</label>
        <div><button disabled={loading || initialLoading} style={{ ...button, opacity: loading || initialLoading ? .55 : 1 }}>Save business information</button></div>
      </fieldset>
    </form>

    {profile && <section style={card}>
      <h2 style={{ marginTop: 0 }}>2. Generate and review legal pages</h2>
      <p style={{ color: "#6f6a64", lineHeight: 1.6 }}>Maia generates organization-specific drafts. Review the wording before publishing; this software does not provide legal advice.</p>
      <button type="button" onClick={generate} disabled={loading} style={secondary}>Generate new drafts</button>
      {privacy && <LegalEditor title="Privacy Policy draft" doc={privacy} onEdit={edit} onPreview={setPreview} />}
      {terms && <LegalEditor title="Terms & Conditions draft" doc={terms} onEdit={edit} onPreview={setPreview} />}
      {privacy && terms && <div style={{ marginTop: 22, borderTop: "1px solid #e5e0da", paddingTop: 18 }}>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", lineHeight: 1.5 }}><input type="checkbox" checked={accept} onChange={e=>setAccept(e.target.checked)} style={{ marginTop: 4 }} /> I have reviewed these legal pages and approve this version for publication.</label>
        <button type="button" onClick={publish} disabled={loading || !accept} style={{ ...button, marginTop: 14, opacity: loading || !accept ? .45 : 1 }}>Publish legal pages</button>
      </div>}
    </section>}

    {profile && <section style={card}>
      <h2 style={{ marginTop: 0 }}>3. Public compliance surfaces</h2>
      <StatusRow ok={Boolean(profile.websiteUrl)} label="Business web presence" href={profile.websiteUrl} />
      <StatusRow ok={Boolean(profile.privacyPolicyUrl)} label="Privacy Policy" href={profile.privacyPolicyUrl || undefined} />
      <StatusRow ok={Boolean(profile.termsUrl)} label="Terms & Conditions" href={profile.termsUrl || undefined} />
      <StatusRow ok={profile.smsEnabled} label="Hosted SMS consent / appointment form" note={profile.smsEnabled ? "Created automatically for each artist. Open the business page and choose an artist to test it." : "SMS is disabled."} />
      {hosted && <p style={{ marginTop: 18 }}><a href={profile.websiteUrl} target="_blank">Open Maia-hosted business page →</a></p>}
      <p style={{ marginTop: 18, fontWeight: 700 }}>Business compliance status: {profile.status.replaceAll("_", " ").toLowerCase()}</p>
      {!legalReady && <p style={{ color: "#8f2f22" }}>Publish both legal documents before using the hosted SMS consent form for registration evidence.</p>}
    </section>}

    {profile && <section style={card}>
      <h2 style={{ marginTop: 0 }}>Next steps for SMS</h2>
      {!profile.smsEnabled ? <p>Enable SMS and save your business information above to continue.</p>
        : !legalReady ? <p>Generate, review, and publish both legal pages above before continuing to campaign registration.</p>
        : <>
          <p>Your legal pages are published. Continue to complete your campaign details or check the review status.</p>
          <a href="/settings/sms?tab=campaign" style={{ ...button, display: "inline-flex", alignItems: "center", minHeight: 44, textDecoration: "none" }}>
            Continue to campaign registration →
          </a>
        </>}
      <p>A purchased number and campaign approval are separate steps. <a href="/settings/sms?tab=phone">Open Phone setup</a> to see your assigned number and its messaging status.</p>
    </section>}

    {message && <div style={{ ...card, borderColor: "#cfc8c1" }}>{message}</div>}
    {preview && <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "#0008", padding: 24, zIndex: 50, overflow: "auto" }} onClick={()=>setPreview(null)}><article onClick={e=>e.stopPropagation()} style={{ maxWidth: 820, margin: "30px auto", background: "white", borderRadius: 16, padding: 32 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center" }}><h2 style={{ margin: 0 }}>{preview.title} preview</h2><button onClick={()=>setPreview(null)} style={secondary}>Close</button></div><pre style={{ whiteSpace: "pre-wrap", fontFamily: "Arial, sans-serif", lineHeight: 1.65, marginTop: 24 }}>{preview.content}</pre></article></div>}
  </div></main>;
}

function LegalEditor({ title, doc, onEdit, onPreview }: { title: string; doc: Document; onEdit: (id:string, value:string)=>void; onPreview:(doc:Document)=>void }) {
  return <div style={{ marginTop: 24 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}><h3 style={{ margin: 0 }}>{title} <span style={{ color: "#777", fontWeight: 400, fontSize: 14 }}>v{doc.version}</span></h3><button type="button" onClick={()=>onPreview(doc)} style={secondary}>Preview</button></div><textarea aria-label={title} value={doc.content} onChange={e=>onEdit(doc.id,e.target.value)} style={{ ...input, minHeight: 460, marginTop: 10, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, lineHeight: 1.55 }} /></div>;
}
function StatusRow({ ok, label, href, note }: { ok:boolean; label:string; href?:string; note?:string }) {
  return <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderBottom: "1px solid #eee8e2" }}><span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 99, display: "grid", placeItems: "center", background: ok ? "#e7f5ea" : "#f5e9e7", color: ok ? "#246b36" : "#8f2f22", fontWeight: 900 }}>{ok ? "✓" : "!"}</span><div><strong>{href ? <a href={href} target="_blank">{label}</a> : label}</strong>{note && <div style={{ marginTop: 4, color: "#6f6a64", fontSize: 13 }}>{note}</div>}</div></div>;
}
