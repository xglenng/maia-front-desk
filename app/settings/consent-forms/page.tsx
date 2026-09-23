"use client";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session-gate";

type Artist = { id: string; displayName: string };
type ConsentMode = "HOSTED" | "EXTERNAL" | "INBOUND_SMS_CONFIRMATION";
type FormData = { form: { id: string; mode: ConsentMode; externalUrl?: string | null; publicCallToActionUrl?: string | null; externalVerifiedAt?: string | null; inboundFlowVerifiedAt?: string | null; disclosureText: string; confirmationText?: string | null } | null; publicUrl: string | null; ready: boolean; artistName: string; organizationName: string };
const field = { width: "100%", boxSizing: "border-box" as const, padding: 12, border: "1px solid #d9d3cc", borderRadius: 8, font: "inherit" };
const card = { background: "white", border: "1px solid #e4dfda", borderRadius: 12, padding: 22, marginTop: 16 };

export default function ConsentFormsPage() {
  const user = useSession(); const organizationId = user?.organization_id || "";
  const [artists, setArtists] = useState<Artist[]>([]); const [artistId, setArtistId] = useState("");
  const [data, setData] = useState<FormData | null>(null); const [mode, setMode] = useState<ConsentMode>("HOSTED");
  const [externalUrl, setExternalUrl] = useState(""); const [publicCallToActionUrl, setPublicCallToActionUrl] = useState(""); const [attested, setAttested] = useState(false); const [message, setMessage] = useState(""); const [token, setToken] = useState<{ token: string; endpoint: string } | null>(null);
  async function load(selected = artistId) {
    if (!organizationId) return;
    const response = await fetch(`/api/consent-forms?organizationId=${organizationId}${selected ? `&artistId=${selected}` : ""}`); const value = await response.json();
    if (!response.ok) return setMessage(value.error || "Unable to load forms.");
    setArtists(value.artists || artists); const nextId = selected || value.selectedArtistId || ""; if (!selected && nextId) { setArtistId(nextId); return void load(nextId); }
    if (selected) { setData(value); setMode(value.form.mode); setExternalUrl(value.form.externalUrl || ""); setPublicCallToActionUrl(value.form.publicCallToActionUrl || ""); setAttested(value.form.mode === "INBOUND_SMS_CONFIRMATION" ? Boolean(value.form.inboundFlowVerifiedAt) : Boolean(value.form.externalVerifiedAt)); }
  }
  useEffect(() => { void load(""); }, [organizationId]);
  async function save() {
    setMessage(""); setToken(null); const response = await fetch("/api/consent-forms", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, artistId, mode, externalUrl, externalAttested: mode === "EXTERNAL" && attested, publicCallToActionUrl, inboundFlowAttested: mode === "INBOUND_SMS_CONFIRMATION" && attested }) }); const value = await response.json();
    if (!response.ok) return setMessage(typeof value.error === "string" ? value.error : "Complete the required form settings."); setData(value); setMessage("SMS consent form saved.");
  }
  async function rotateToken() {
    const response = await fetch("/api/consent-forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, artistId, action: "ROTATE_EXTERNAL_TOKEN" }) }); const value = await response.json();
    if (!response.ok) return setMessage(value.error || "Unable to create token."); setToken(value);
  }
  if (!user) return null;
  return <main style={{ maxWidth: 850, margin: "0 auto", padding: "40px 20px 80px", color: "#181716" }}><a href="/settings">← Owner settings</a><h1>SMS consent workflow</h1><p>Configure how each artist obtains and records permission for appointment-related text messages.</p>
    <section style={card}><label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Artist<select style={field} value={artistId} onChange={event => { setArtistId(event.target.value); void load(event.target.value); }}><option value="">Choose an artist</option>{artists.map(artist => <option key={artist.id} value={artist.id}>{artist.displayName}</option>)}</select></label></section>
    {data?.form && <section style={card}><h2 style={{ marginTop: 0 }}>{data.artistName}</h2><p>Status: <strong>{data.ready ? "Ready for Twilio review" : "Action required"}</strong></p>
      <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Consent method<select value={mode} onChange={event => { setMode(event.target.value as ConsentMode); setAttested(false); }} style={field}><option value="INBOUND_SMS_CONFIRMATION">Client texts first, then replies YES (recommended for this studio)</option><option value="HOSTED">Maia-hosted booking form checkbox</option><option value="EXTERNAL">Verified external form checkbox</option></select></label>
      {mode === "HOSTED" && <div><p><strong>Public opt-in URL</strong></p><p style={{ overflowWrap: "anywhere" }}><a href={data.publicUrl || "#"} target="_blank">{data.publicUrl}</a></p><p>The checkbox is separate, optional, and unchecked by default. Booking still works without SMS consent.</p></div>}
      {mode === "EXTERNAL" && <div style={{ display: "grid", gap: 12, marginTop: 14 }}><label style={{ fontWeight: 700 }}>Public external form URL<input type="url" value={externalUrl} onChange={event => { setExternalUrl(event.target.value); setAttested(false); }} placeholder="https://…" style={field} /></label><label style={{ display: "flex", gap: 9, alignItems: "flex-start" }}><input type="checkbox" checked={attested} onChange={event => setAttested(event.target.checked)} /><span>I verified this page has a separate SMS checkbox that is visible and unchecked by default, displays the disclosure below with Privacy Policy and Terms links, allows submission without SMS consent, and records the customer&apos;s choice.</span></label></div>}
      {mode === "INBOUND_SMS_CONFIRMATION" && <div style={{ display: "grid", gap: 12, marginTop: 14 }}><label style={{ fontWeight: 700 }}>Public page displaying the shop number and SMS disclosure<input type="url" value={publicCallToActionUrl} onChange={event => { setPublicCallToActionUrl(event.target.value); setAttested(false); }} placeholder="https://www.example.com/contact" style={field} /></label><label style={{ display: "flex", gap: 9, alignItems: "flex-start" }}><input type="checkbox" checked={attested} onChange={event => setAttested(event.target.checked)} /><span>I verified this public page invites clients to text the studio and displays message purpose, variable frequency, message/data rates, STOP, HELP, consent-not-required wording, and Privacy Policy and Terms links. Maia will require an affirmative YES before booking, deposit, reminder, or waiver-link messages.</span></label></div>}
      {mode === "INBOUND_SMS_CONFIRMATION" && <details style={{ marginTop: 16 }} open><summary>Disclosure to display beside the shop phone number</summary><p style={{ padding: 12, background: "#f7f4f1", lineHeight: 1.5 }}>{data.form.disclosureText}</p><p style={{fontSize:13}}>Place visible Privacy Policy and Terms links beside this disclosure.</p></details>}
      <details style={{ marginTop: 16 }}><summary>{mode === "INBOUND_SMS_CONFIRMATION" ? "YES confirmation sent before booking" : "Required disclosure"}</summary><p style={{ padding: 12, background: "#f7f4f1", lineHeight: 1.5 }}>{mode === "INBOUND_SMS_CONFIRMATION" ? data.form.confirmationText : data.form.disclosureText}</p></details>
      <button onClick={save} style={{ marginTop: 16, padding: "11px 18px", background: "#181716", color: "white", border: 0, borderRadius: 8 }}>Save form setup</button>
      {mode === "EXTERNAL" && data.ready && <button onClick={rotateToken} style={{ marginLeft: 10, padding: "11px 18px" }}>Create integration token</button>}
      {token && <div style={{ marginTop: 16, background: "#fff3cd", padding: 14 }}><strong>Copy now—this token will not be shown again.</strong><p>Endpoint: <code>{token.endpoint}</code></p><p>Bearer token: <code style={{ overflowWrap: "anywhere" }}>{token.token}</code></p></div>}
    </section>}
    {message && <section style={card}>{message}</section>}
  </main>;
}
