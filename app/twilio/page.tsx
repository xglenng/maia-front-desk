"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session-gate";

type ArtistStatus = { artist: { id: string; displayName: string }; provisioned: boolean; phoneNumber: { phoneNumber: string; active: boolean; complianceStatus: string; lifecycleRole: string } | null };
type PortRequest = { id: string; phoneNumber: string; status: string; numberType?: string | null; pinRequired: boolean; targetPortDate?: string | null; confirmedPortAt?: string | null; rejectionReasonCode?: string | null; rejectionReason?: string | null; supportTicketId?: string | null; lastStatusCheckedAt?: string | null };
type Portability = { portable: boolean; phoneNumber: string; numberType?: string; pinRequired: boolean; reason?: string | null };

const card = { background: "#fff", padding: 22, border: "1px solid #e5e0da", borderRadius: 12, marginTop: 18 };
const field = { display: "block", width: "100%", padding: 11, marginTop: 6, border: "1px solid #ccc", borderRadius: 7, font: "inherit" };
const label = { display: "grid", alignContent: "start", fontSize: 13, fontWeight: 600 };
const button = { padding: "10px 14px", borderRadius: 7, border: "1px solid #aaa", cursor: "pointer" };

function defaultTargetDate() { const date = new Date(); date.setDate(date.getDate() + 14); return date.toISOString().slice(0, 10); }

export default function TwilioSetupPage() {
  const user = useSession();
  const organizationId = user?.organization_id ?? "";
  const [artistId, setArtistId] = useState("");
  const [artists, setArtists] = useState<ArtistStatus[]>([]);
  const [choice, setChoice] = useState<"new" | "port">("new");
  const [areaCode, setAreaCode] = useState("");
  const [existingNumber, setExistingNumber] = useState("");
  const [portability, setPortability] = useState<Portability | null>(null);
  const [requests, setRequests] = useState<PortRequest[]>([]);
  const [portMode, setPortMode] = useState("live");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [portForm, setPortForm] = useState({ customerType: "Business", customerName: "", accountNumber: "", accountTelephoneNumber: "", pin: "", billingStreet: "", billingStreet2: "", billingCity: "", billingRegion: "", billingPostalCode: "", representative: "", representativeEmail: "", voiceForwardTo: "", targetPortDate: defaultTargetDate() });
  const selected = useMemo(() => artists.find(row => row.artist.id === artistId), [artists, artistId]);

  async function status(selectedArtistId = artistId) {
    if (!organizationId) return;
    setLoading(true);
    const q = new URLSearchParams({ organizationId }); if (selectedArtistId) q.set("artistId", selectedArtistId);
    const res = await fetch(`/api/twilio/status?${q}`); const data = await res.json();
    if (res.ok) {
      const rows = (data.artists ?? []) as ArtistStatus[];
      if (!selectedArtistId) setArtists(rows); else setArtists(current => current.map(row => rows.find(next => next.artist.id === row.artist.id) ?? row));
      if (!selectedArtistId && rows.length === 1) setArtistId(rows[0].artist.id);
    } else setMessage(data.error ?? "Unable to load phone status.");
    setLoading(false);
  }

  async function loadPorts(selectedArtistId = artistId) {
    if (!organizationId || !selectedArtistId) return;
    const q = new URLSearchParams({ organizationId, artistId: selectedArtistId });
    const res = await fetch(`/api/twilio/port?${q}`); const data = await res.json();
    if (res.ok) { setRequests(data.requests || []); setPortMode(data.mode || "live"); }
  }

  useEffect(() => { if (organizationId) void status(""); }, [organizationId]);
  useEffect(() => { if (artistId) void loadPorts(artistId); }, [artistId]);

  async function provision(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage(""); setResult(null);
    const res = await fetch("/api/twilio/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, artistId, ...(areaCode ? { areaCode } : {}) }) });
    const data = await res.json(); setLoading(false); setResult(data); setMessage(res.ok ? (data.message || "Temporary Twilio number is ready.") : data.error ?? "Provisioning failed.");
    if (res.ok) await status(artistId);
  }

  async function checkNumber() {
    setLoading(true); setMessage(""); setPortability(null);
    const normalized = existingNumber.startsWith("+") ? existingNumber : `+1${existingNumber.replace(/\D/g, "")}`;
    const res = await fetch("/api/twilio/portability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, artistId, phoneNumber: normalized }) });
    const data = await res.json(); setLoading(false); setResult(data);
    if (!res.ok) return setMessage(data.error || "Portability check failed.");
    setExistingNumber(data.phoneNumber); setPortability(data); setMessage(data.portable ? "This number is eligible for automated porting." : `This number cannot be ported automatically: ${data.reason || "not eligible"}.`);
  }

  async function submitPort(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    const form = new FormData(event.currentTarget);
    form.set("organizationId", organizationId); form.set("artistId", artistId); form.set("phoneNumber", existingNumber);
    const res = await fetch("/api/twilio/port", { method: "POST", body: form }); const data = await res.json();
    setLoading(false); setResult(data);
    if (!res.ok) return setMessage(typeof data.error === "string" ? data.error : "Review the porting information and try again.");
    setMessage(portMode === "mock" ? "Mock port submitted. Use the test controls below." : "Port submitted. The authorized representative must sign Twilio's emailed authorization letter within 30 days.");
    setPortability(null); await loadPorts(artistId);
  }

  async function syncPort(requestId: string, mockDecision?: "ADVANCE" | "COMPLETE" | "ACTION_REQUIRED") {
    setLoading(true); setMessage("");
    const res = await fetch("/api/twilio/port/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, artistId, requestId, ...(mockDecision ? { mockDecision } : {}) }) });
    const data = await res.json(); setLoading(false); setResult(data); setMessage(data.message || data.error || "Port status synchronized.");
    if (res.ok) { await loadPorts(artistId); await status(artistId); }
  }

  return <main style={{ maxWidth: 920, margin: "0 auto", padding: "40px 20px 80px", fontFamily: "Arial, sans-serif", color: "#181716" }}>
    <p><a href="/settings">← Owner settings</a></p>
    <h1>Twilio phone setup</h1>
    <p>Choose whether this artist starts with a temporary Twilio number or moves an established business number into the app.</p>

    <section style={card}>
      <label style={label}>Artist<select required value={artistId} onChange={e => { setArtistId(e.target.value); setPortability(null); }} style={field}>
        <option value="">Select an artist</option>{artists.map(row => <option key={row.artist.id} value={row.artist.id}>{row.artist.displayName}{row.phoneNumber ? ` — ${row.phoneNumber.phoneNumber}` : " — no number"}</option>)}
      </select></label>
      {selected?.phoneNumber && <p style={{fontSize:13}}>Primary number: <strong>{selected.phoneNumber.phoneNumber}</strong> · {selected.phoneNumber.lifecycleRole} · {selected.phoneNumber.complianceStatus}</p>}
      <div style={{display:"flex",gap:10,marginTop:16}}><button type="button" style={{...button,background:choice==="new"?"#181716":"#fff",color:choice==="new"?"#fff":"#181716"}} onClick={()=>setChoice("new")}>Get a temporary number</button><button type="button" style={{...button,background:choice==="port"?"#181716":"#fff",color:choice==="port"?"#fff":"#181716"}} onClick={()=>setChoice("port")}>Port an existing number</button></div>
    </section>

    {choice === "new" && <form onSubmit={provision} style={card}>
      <h2 style={{marginTop:0}}>Temporary testing number</h2><p>Use this number while registration and porting are completed. It will not be released automatically.</p>
      <label style={label}>Preferred US area code (optional)<input value={areaCode} onChange={e => setAreaCode(e.target.value.replace(/\D/g, ""))} maxLength={3} inputMode="numeric" style={field} /></label>
      <button disabled={loading || !artistId || Boolean(selected?.provisioned)} style={{...button,marginTop:16}}>Provision temporary number</button>
    </form>}

    {choice === "port" && <>
      <section style={card}><h2 style={{marginTop:0}}>Move the existing business number</h2>
        {!selected?.provisioned && <p style={{color:"#8f2f22"}}>Provision the temporary testing number first. It keeps the studio reachable throughout the carrier transfer.</p>}
        {selected?.provisioned && !["APPROVED","MOCK_APPROVED"].includes(selected.phoneNumber?.complianceStatus || "") && <p style={{color:"#8f2f22"}}>Complete A2P approval and test the temporary number before beginning the port.</p>}
        <label style={label}>Existing US business number<input placeholder="+14355551212" value={existingNumber} onChange={e=>{setExistingNumber(e.target.value);setPortability(null);}} style={field} /></label>
        <button type="button" disabled={loading || !artistId || !selected?.provisioned || !["APPROVED","MOCK_APPROVED"].includes(selected.phoneNumber?.complianceStatus || "") || !existingNumber} onClick={checkNumber} style={{...button,marginTop:16}}>Check portability</button>
      </section>

      {portability?.portable && <form onSubmit={submitPort} style={card}>
        <h2 style={{marginTop:0}}>Carrier account and authorization</h2><p>Every value must match the losing carrier&apos;s bill exactly. The uploaded bill goes directly to Twilio and is not retained by this app.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14}}>
          <label style={label}>Customer type<select name="customerType" value={portForm.customerType} onChange={e=>setPortForm({...portForm,customerType:e.target.value})} style={field}><option>Business</option><option>Individual</option></select></label>
          <label style={label}>Name on carrier account<input name="customerName" required value={portForm.customerName} onChange={e=>setPortForm({...portForm,customerName:e.target.value})} style={field}/></label>
          <label style={label}>Carrier account number<input name="accountNumber" type="password" required value={portForm.accountNumber} onChange={e=>setPortForm({...portForm,accountNumber:e.target.value})} style={field}/></label>
          <label style={label}>Carrier account telephone<input name="accountTelephoneNumber" placeholder="+14355551212" required value={portForm.accountTelephoneNumber} onChange={e=>setPortForm({...portForm,accountTelephoneNumber:e.target.value})} style={field}/></label>
          {portability.pinRequired && <label style={label}>Carrier transfer PIN<input name="pin" type="password" required value={portForm.pin} onChange={e=>setPortForm({...portForm,pin:e.target.value})} style={field}/></label>}
          <label style={label}>Billing street<input name="billingStreet" required value={portForm.billingStreet} onChange={e=>setPortForm({...portForm,billingStreet:e.target.value})} style={field}/></label>
          <label style={label}>Billing address line 2<input name="billingStreet2" value={portForm.billingStreet2} onChange={e=>setPortForm({...portForm,billingStreet2:e.target.value})} style={field}/></label>
          <label style={label}>Billing city<input name="billingCity" required value={portForm.billingCity} onChange={e=>setPortForm({...portForm,billingCity:e.target.value})} style={field}/></label>
          <label style={label}>Billing state<input name="billingRegion" required value={portForm.billingRegion} onChange={e=>setPortForm({...portForm,billingRegion:e.target.value})} style={field}/></label>
          <label style={label}>Billing ZIP<input name="billingPostalCode" required value={portForm.billingPostalCode} onChange={e=>setPortForm({...portForm,billingPostalCode:e.target.value})} style={field}/></label>
          <input name="billingCountry" type="hidden" value="US"/>
          <label style={label}>Authorized representative<input name="representative" required value={portForm.representative} onChange={e=>setPortForm({...portForm,representative:e.target.value})} style={field}/></label>
          <label style={label}>Representative email<input name="representativeEmail" type="email" required value={portForm.representativeEmail} onChange={e=>setPortForm({...portForm,representativeEmail:e.target.value})} style={field}/></label>
          <label style={label}>Forward business calls to<input name="voiceForwardTo" placeholder="+14355551212" required value={portForm.voiceForwardTo} onChange={e=>setPortForm({...portForm,voiceForwardTo:e.target.value})} style={field}/></label>
          <label style={label}>Requested port date<input name="targetPortDate" type="date" required value={portForm.targetPortDate} onChange={e=>setPortForm({...portForm,targetPortDate:e.target.value})} style={field}/></label>
          <label style={label}>Current carrier bill (last 30 days)<input name="utilityBill" type="file" accept="application/pdf,image/jpeg,image/png" required style={field}/></label>
        </div>
        <label style={{display:"block",marginTop:16,fontSize:13}}><input type="checkbox" required/> I am authorized to port this number and understand Twilio will email an electronic authorization letter for signature.</label>
        <button disabled={loading} style={{...button,marginTop:16,background:"#8f2f22",color:"#fff"}}>Submit port request</button>
      </form>}

      {requests.map(request => <section key={request.id} style={card}><h2 style={{marginTop:0}}>{request.phoneNumber}</h2><p>Status: <strong>{request.status}</strong>{request.targetPortDate ? ` · Requested date: ${request.targetPortDate}` : ""}</p>
        {request.status === "WAITING_FOR_SIGNATURE" && <p>The authorized representative must sign Twilio&apos;s emailed authorization letter within 30 days.</p>}
        {request.rejectionReason && <p style={{color:"#8f2f22"}}>Action required: {request.rejectionReason}{request.rejectionReasonCode ? ` (${request.rejectionReasonCode})` : ""}</p>}
        <button disabled={loading} onClick={()=>syncPort(request.id)} style={button}>Sync Twilio status</button>
        {portMode === "mock" && !["COMPLETED","CANCELED"].includes(request.status) && <span style={{marginLeft:8}}><button disabled={loading} onClick={()=>syncPort(request.id,"ADVANCE")} style={button}>Mock advance</button> <button disabled={loading} onClick={()=>syncPort(request.id,"COMPLETE")} style={button}>Mock complete</button> <button disabled={loading} onClick={()=>syncPort(request.id,"ACTION_REQUIRED")} style={button}>Mock reject</button></span>}
      </section>)}
    </>}

    <div style={{...card,fontSize:13}}><strong>Important:</strong> Do not cancel the existing carrier service until Twilio reports the port completed and calls and texts have been tested. Twilio&apos;s Porting API is currently a public beta.</div>
    {message && <div style={{...card,borderColor:"#c9ada4"}}>{message}</div>}
    {result !== null && <details style={card}><summary>Technical status</summary><pre style={{overflow:"auto",whiteSpace:"pre-wrap",fontSize:12}}>{JSON.stringify(result,null,2)}</pre></details>}
  </main>;
}
