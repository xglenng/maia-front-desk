"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import "./waivers.css";
import NativeEditor from "./native-editor";

type FormRow = { id: string; provider: string; name: string; formUrl: string; category: string; audience: "ANY" | "ADULT" | "MINOR"; artistId: string | null; serviceId: string | null; priority: number; active: boolean; collectsMedicalData: boolean; completionMode: string };
type Setup = { studioBrand?:string; isOwner?:boolean; connections: Array<{ id: string; provider: string; label: string; status: string; lastSyncedAt: string | null }>; forms: FormRow[]; artists: Array<{ id: string; name: string }>; services: Array<{ id: string; name: string; artistId: string }> };
type Assignment = { assignment: { id: string; status: string; sentAt: string | null; completedAt: string | null }; formName: string; provider: string; hasPhotoId?:boolean };
type AppointmentRow = { appointment: { id: string; artistId: string; serviceId: string | null; startsAt: string; status: string }; clientName: string; clientPhone: string | null; clientSmsOptIn: boolean; clientDateOfBirth: string | null; artistName: string; serviceName: string | null; assignments: Assignment[] };

async function readJson<T>(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
  return data as T;
}

export default function WaiversPage() {
  const [setup, setSetup] = useState<Setup>({ connections: [], forms: [], artists: [], services: [] });
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [region, setRegion] = useState("STANDARD");
  const [custom, setCustom] = useState({ name: "", formUrl: "", category: "GENERAL", audience: "ANY", artistId:"" });
  const [formLinks,setFormLinks]=useState<Record<string,string>>({});
  const [appointmentMessages,setAppointmentMessages]=useState<Record<string,string>>({});
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [configuration, schedule] = await Promise.all([
        readJson<Setup>(await fetch("/api/waiver-integrations", { cache: "no-store" })),
        readJson<{ appointments: AppointmentRow[] }>(await fetch("/api/waiver-assignments", { cache: "no-store" })),
      ]);
      setSetup(configuration); setAppointments(schedule.appointments);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load waiver setup"); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function connect(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await readJson<{ webhookUrl: string; formsImported: number }>(await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CONNECT_JOTFORM", apiKey, region, label: "Jotform" }) }));
      setApiKey(""); setWebhookUrl(result.webhookUrl); setMessage(`${result.formsImported} Jotform forms synchronized.`); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to connect Jotform"); } finally { setBusy(false); }
  }

  async function addCustom(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await readJson(await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ADD_CUSTOM_FORM", ...custom, priority: 100, collectsMedicalData: false }) }));
      setCustom({ name: "", formUrl: "", category: "GENERAL", audience: "ANY", artistId:"" }); setMessage("Custom form added."); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to add form"); } finally { setBusy(false); }
  }

  async function sync(connectionId: string) {
    setBusy(true); try { const result = await readJson<{ imported: number }>(await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SYNC", connectionId }) })); setMessage(`${result.imported} forms synchronized.`); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to sync forms"); } finally { setBusy(false); }
  }

  async function rotateWebhook(connectionId: string) {
    setBusy(true); try { const result = await readJson<{ webhookUrl: string }>(await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ROTATE_WEBHOOK", connectionId }) })); setWebhookUrl(result.webhookUrl); setMessage("New webhook URL created. Replace the old URL on every Jotform."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to rotate webhook URL"); } finally { setBusy(false); }
  }

  async function sendWaiver(appointmentId: string, externalWaiverFormId?: string) {
    setBusy(true);
    setAppointmentMessages(previous=>({...previous,[appointmentId]:"Sending…"}));
    try {
      await readJson(await fetch("/api/waiver-assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId, ...(externalWaiverFormId ? { externalWaiverFormId } : {}) }) }));
      setAppointmentMessages(previous=>({...previous,[appointmentId]:"Waiver submitted to the SMS provider. Delivery is not yet confirmed."}));
    } catch (error) {
      setAppointmentMessages(previous=>({...previous,[appointmentId]:error instanceof Error ? error.message : "Unable to send waiver"}));
    } finally { await refresh(); setBusy(false); }
  }

  async function createLink(appointmentId:string,externalWaiverFormId?:string){
    setBusy(true);
    setAppointmentMessages(previous=>({...previous,[appointmentId]:"Creating link…"}));
    try {
      const result=await readJson<{url:string}>(await fetch('/api/waiver-assignments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'CREATE_LINK',appointmentId,...(externalWaiverFormId?{externalWaiverFormId}:{})})}));
      setFormLinks(previous=>({...previous,[appointmentId]:result.url}));
      setAppointmentMessages(previous=>({...previous,[appointmentId]:"Form link created. No message was sent."}));
    } catch(error){setAppointmentMessages(previous=>({...previous,[appointmentId]:error instanceof Error?error.message:'Unable to create link.'}));}
    finally{await refresh();setBusy(false);}
  }
  async function assignmentAction(id: string, action: "MARK_COMPLETE" | "MARK_REVIEWED" | "VOID") {
    setBusy(true); try { await readJson(await fetch(`/api/waiver-assignments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update waiver"); } finally { setBusy(false); }
  }

  return <main className="waiver-admin">
    <header><a href="/settings">← Settings</a><h1>Consent forms & waivers</h1><p>Connect forms once, map them to appointment rules, and send the correct consent form to each client.</p></header>
    {message && <div className="waiver-notice" role="status">{message}</div>}

    <section className="waiver-grid">
      {setup.isOwner&&<form className="waiver-card" onSubmit={connect}>
        <div className="card-title"><div><h2>Connect Jotform</h2><p>API credentials are encrypted and never displayed again.</p></div><span className="provider-pill">Full integration</span></div>
        <label>API region<select value={region} onChange={event => setRegion(event.target.value)}><option value="STANDARD">Standard</option><option value="EU">European Union</option><option value="HIPAA">HIPAA</option></select></label>
        <label>Jotform API key<input type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} required minLength={10} /></label>
        <button disabled={busy || !apiKey}>Connect and import forms</button>
        {setup.connections.map(connection => <div className="connection" key={connection.id}><div><strong>{connection.label}</strong><small>{connection.status} · {connection.lastSyncedAt ? `Synced ${new Date(connection.lastSyncedAt).toLocaleString()}` : "Not synced"}</small></div><div><button type="button" className="secondary" disabled={busy} onClick={() => sync(connection.id)}>Sync</button><button type="button" className="secondary" disabled={busy} onClick={() => rotateWebhook(connection.id)}>New webhook URL</button></div></div>)}
      </form>}
      <form className="waiver-card" onSubmit={addCustom}>
        <div className="card-title"><div><h2>Bring your existing form</h2><p>Paste a Jotform, Google Forms, Typeform, Square, or another public form link. Your form stays with that provider; completion is recorded manually unless a verified integration is connected.</p></div><span className="provider-pill neutral">Custom link</span></div>
        <label>Form name<input value={custom.name} onChange={event => setCustom({ ...custom, name: event.target.value })} required /></label>
        <label>Artist<select required value={custom.artistId} onChange={event=>setCustom({...custom,artistId:event.target.value})}><option value="">Choose an artist</option>{setup.artists.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>Public form URL<input type="url" placeholder="https://…" value={custom.formUrl} onChange={event => setCustom({ ...custom, formUrl: event.target.value })} required /></label>
        <div className="two-fields"><label>Category<input value={custom.category} onChange={event => setCustom({ ...custom, category: event.target.value })} /></label><label>Audience<select value={custom.audience} onChange={event => setCustom({ ...custom, audience: event.target.value })}><option value="ANY">Any age</option><option value="ADULT">Adult</option><option value="MINOR">Minor</option></select></label></div>
        <button disabled={busy}>Add form link</button>
      </form>
    </section>
    <section className="waiver-section"><h2>Signed forms</h2><p>Find completed Maia consent forms, answers, and signatures from past appointments.</p><a href="/waivers/archive">Open signed form archive →</a></section>
    <section className="waiver-section native-create"><NativeEditor studioBrand={setup.studioBrand||''} artists={setup.artists} busy={busy} onSaved={refresh}/></section>

    {webhookUrl && <section className="webhook-callout"><h2>Finish Jotform setup</h2><ol><li>Add a hidden field to each form with the unique name <code>waiverToken</code>.</li><li>Add this webhook URL to each imported form, replacing any older waiver webhook URL:</li></ol><input readOnly value={webhookUrl} onFocus={event => event.currentTarget.select()} /><p>Store this URL now. Its secret is intentionally shown only when created.</p></section>}

    <section className="waiver-section"><div className="section-heading"><div><h2>Form routing rules</h2><p>Specific service and artist matches win over general forms. Lower priority numbers win ties.</p></div><strong>{setup.forms.length} forms</strong></div>{setup.forms.length === 0 ? <div className="empty">Create a Maia form or bring an existing form link to begin.</div> : <div className="form-list">{setup.forms.map(form => <FormEditor key={form.id} form={form} setup={setup} busy={busy} onSaved={refresh} />)}</div>}</section>

    <section className="waiver-section"><div className="section-heading"><div><h2>Upcoming appointments</h2><p>Auto-select applies the routing rules above. Choose a form manually when needed.</p></div><strong>{appointments.length} appointments</strong></div><div className="appointment-list">{appointments.length === 0 ? <div className="empty">No upcoming appointments.</div> : appointments.map(row => <AppointmentWaivers key={row.appointment.id} row={row} formLink={formLinks[row.appointment.id]} notice={appointmentMessages[row.appointment.id]} forms={setup.forms.filter(f=>!f.artistId||f.artistId===row.appointment.artistId)} busy={busy} onSend={sendWaiver} onCreateLink={createLink} onAction={assignmentAction} />)}</div></section>
  </main>;
}

function FormEditor({ form, setup, busy, onSaved }: { form: FormRow; setup: Setup; busy: boolean; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(form);
  const [saving,setSaving]=useState(false);
  const [feedback,setFeedback]=useState<{text:string;error:boolean}|null>(null);
  useEffect(() => setValue(form), [form]);
  async function save() { setSaving(true);setFeedback(null);try { await readJson(await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "UPDATE_FORM", formId: value.id, category: value.category, audience: value.audience, artistId: value.artistId, serviceId: value.serviceId, priority: Number(value.priority), active: value.active, collectsMedicalData: value.collectsMedicalData }) })); await onSaved();setFeedback({text:value.active?"Saved. This form is active.":"Saved. This form is inactive and will not be offered for new appointments.",error:false}); } catch (error) { setFeedback({text:error instanceof Error ? error.message : "Unable to save form",error:true}); } finally {setSaving(false);} }
  return <article className="form-row" aria-busy={saving} onChangeCapture={()=>setFeedback(null)}><div className="form-name"><strong>{value.name} <span className={`form-state ${form.active?"active":"inactive"}`}>{form.active?"Active":"Inactive"}</span></strong><span>{value.provider} · {value.completionMode === "HOSTED" ? "Signed in Maia" : value.completionMode === "WEBHOOK" ? "Automatic completion" : "Manual completion"}</span>{value.provider !== "MAIA" && /^https:\/\//i.test(value.formUrl) && <a className="open-form-link" href={value.formUrl} target="_blank" rel="noopener noreferrer">Open form ↗</a>}</div><label>Audience<select value={value.audience} onChange={event => setValue({ ...value, audience: event.target.value as FormRow["audience"] })}><option value="ANY">Any age</option><option value="ADULT">Adult</option><option value="MINOR">Minor</option></select></label><label>Artist<select value={value.artistId ?? ""} onChange={event => setValue({ ...value, artistId: event.target.value || null })}>{setup.isOwner&&<option value="">All artists</option>}{setup.artists.map(artist => <option key={artist.id} value={artist.id}>{artist.name}</option>)}</select></label><label>Service<select value={value.serviceId ?? ""} onChange={event => setValue({ ...value, serviceId: event.target.value || null })}><option value="">All services</option>{setup.services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label>Priority<input type="number" min="0" max="1000" value={value.priority} onChange={event => setValue({ ...value, priority: Number(event.target.value) })} /></label><label className="check"><input type="checkbox" checked={value.collectsMedicalData} onChange={event => setValue({ ...value, collectsMedicalData: event.target.checked })} />Medical data</label><label className="check"><input type="checkbox" checked={value.active} onChange={event => setValue({ ...value, active: event.target.checked })} />Active</label><button type="button" disabled={busy||saving} onClick={save}>{saving?"Saving…":"Save"}</button>{feedback&&<p className={`form-save-feedback ${feedback.error?"error":"success"}`} role={feedback.error?"alert":"status"}>{feedback.text}</p>}</article>;
}

function AppointmentWaivers({ row, formLink, notice, forms, busy, onSend, onCreateLink, onAction }: { row: AppointmentRow; formLink?:string; notice?:string; forms: FormRow[]; busy: boolean; onSend: (appointmentId: string, formId?: string) => Promise<void>; onCreateLink:(appointmentId:string,formId?:string)=>Promise<void>; onAction: (id: string, action: "MARK_COMPLETE" | "MARK_REVIEWED" | "VOID") => Promise<void> }) {
  const [formId, setFormId] = useState("");
  return <article className="appointment-row-waiver"><div><strong>{row.clientName}</strong><span>{new Date(row.appointment.startsAt).toLocaleString()} · {row.artistName} · {row.serviceName ?? "Appointment"}</span><small>{row.clientPhone ?? "No phone"} · {row.clientSmsOptIn ? "SMS opted in" : "Not opted in"} · {row.clientDateOfBirth ? "Birth date available" : "Birth date missing"}</small></div><div className="send-controls"><select value={formId} onChange={event => setFormId(event.target.value)}><option value="">Auto-select form</option>{forms.filter(form => form.active).map(form => <option key={form.id} value={form.id}>{form.name}</option>)}</select><button disabled={busy} onClick={()=>onCreateLink(row.appointment.id,formId||undefined)}>Create form link</button><button disabled={busy || !row.clientSmsOptIn} onClick={() => onSend(row.appointment.id, formId || undefined)}>Send waiver</button></div>{notice&&<p className="appointment-feedback" role="status">{notice}</p>}{formLink&&<div className="appointment-form-link"><label>Client form link<input readOnly value={formLink} onFocus={event=>event.currentTarget.select()}/></label><a className="open-form-link" href={formLink} target="_blank" rel="noopener noreferrer">Open form ↗</a><p>Share only with this client. This appointment-specific link is shown for this session.</p></div>}{row.assignments.length > 0 && <div className="assignment-list">{row.assignments.map(item => <div key={item.assignment.id}><span className={`status ${item.assignment.status.toLowerCase()}`}>{item.assignment.status}</span><strong>{item.formName}</strong><small>{item.provider}</small>{item.hasPhotoId&&<a href={`/api/waiver-assignments/${item.assignment.id}/photo-id`} target="_blank" rel="noreferrer">Download photo ID</a>}{!["COMPLETED", "REVIEWED", "VOID"].includes(item.assignment.status) && <>{item.provider!=="MAIA"&&<button onClick={() => onAction(item.assignment.id, "MARK_COMPLETE")}>Mark complete</button>}<button onClick={() => onAction(item.assignment.id, "VOID")}>Void</button></>}{item.assignment.status === "COMPLETED" && <button onClick={() => onAction(item.assignment.id, "MARK_REVIEWED")}>Mark reviewed</button>}</div>)}</div>}</article>;
}
