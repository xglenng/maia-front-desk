"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import "./waivers.css";

type FormRow = { id: string; provider: string; name: string; formUrl: string; category: string; audience: "ANY" | "ADULT" | "MINOR"; artistId: string | null; serviceId: string | null; priority: number; active: boolean; collectsMedicalData: boolean; completionMode: string };
type Setup = { connections: Array<{ id: string; provider: string; label: string; status: string; lastSyncedAt: string | null }>; forms: FormRow[]; artists: Array<{ id: string; name: string }>; services: Array<{ id: string; name: string; artistId: string }> };
type Assignment = { assignment: { id: string; status: string; sentAt: string | null; completedAt: string | null }; formName: string; provider: string };
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
  const [custom, setCustom] = useState({ name: "", formUrl: "", category: "GENERAL", audience: "ANY" });
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
      setCustom({ name: "", formUrl: "", category: "GENERAL", audience: "ANY" }); setMessage("Custom form added."); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to add form"); } finally { setBusy(false); }
  }

  async function sync(connectionId: string) {
    setBusy(true); try { const result = await readJson<{ imported: number }>(await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SYNC", connectionId }) })); setMessage(`${result.imported} forms synchronized.`); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to sync forms"); } finally { setBusy(false); }
  }

  async function rotateWebhook(connectionId: string) {
    setBusy(true); try { const result = await readJson<{ webhookUrl: string }>(await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ROTATE_WEBHOOK", connectionId }) })); setWebhookUrl(result.webhookUrl); setMessage("New webhook URL created. Replace the old URL on every Jotform."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to rotate webhook URL"); } finally { setBusy(false); }
  }

  async function sendWaiver(appointmentId: string, externalWaiverFormId?: string) {
    setBusy(true); try { await readJson(await fetch("/api/waiver-assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId, ...(externalWaiverFormId ? { externalWaiverFormId } : {}) }) })); setMessage("Waiver sent by SMS."); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to send waiver"); } finally { setBusy(false); }
  }

  async function assignmentAction(id: string, action: "MARK_COMPLETE" | "MARK_REVIEWED" | "VOID") {
    setBusy(true); try { await readJson(await fetch(`/api/waiver-assignments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update waiver"); } finally { setBusy(false); }
  }

  return <main className="waiver-admin">
    <header><a href="/settings">← Owner settings</a><h1>Waiver providers</h1><p>Connect forms once, map them to appointment rules, and send the correct consent form to each client.</p></header>
    {message && <div className="waiver-notice">{message}</div>}

    <section className="waiver-grid">
      <form className="waiver-card" onSubmit={connect}>
        <div className="card-title"><div><h2>Connect Jotform</h2><p>API credentials are encrypted and never displayed again.</p></div><span className="provider-pill">Full integration</span></div>
        <label>API region<select value={region} onChange={event => setRegion(event.target.value)}><option value="STANDARD">Standard</option><option value="EU">European Union</option><option value="HIPAA">HIPAA</option></select></label>
        <label>Jotform API key<input type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} required minLength={10} /></label>
        <button disabled={busy || !apiKey}>Connect and import forms</button>
        {setup.connections.map(connection => <div className="connection" key={connection.id}><div><strong>{connection.label}</strong><small>{connection.status} · {connection.lastSyncedAt ? `Synced ${new Date(connection.lastSyncedAt).toLocaleString()}` : "Not synced"}</small></div><div><button type="button" className="secondary" disabled={busy} onClick={() => sync(connection.id)}>Sync</button><button type="button" className="secondary" disabled={busy} onClick={() => rotateWebhook(connection.id)}>New webhook URL</button></div></div>)}
      </form>
      <form className="waiver-card" onSubmit={addCustom}>
        <div className="card-title"><div><h2>Add another provider</h2><p>Works with any provider that gives clients a public form link.</p></div><span className="provider-pill neutral">Custom link</span></div>
        <label>Form name<input value={custom.name} onChange={event => setCustom({ ...custom, name: event.target.value })} required /></label>
        <label>Public form URL<input type="url" value={custom.formUrl} onChange={event => setCustom({ ...custom, formUrl: event.target.value })} required /></label>
        <div className="two-fields"><label>Category<input value={custom.category} onChange={event => setCustom({ ...custom, category: event.target.value })} /></label><label>Audience<select value={custom.audience} onChange={event => setCustom({ ...custom, audience: event.target.value })}><option value="ANY">Any age</option><option value="ADULT">Adult</option><option value="MINOR">Minor</option></select></label></div>
        <button disabled={busy}>Add form link</button>
      </form>
    </section>

    {webhookUrl && <section className="webhook-callout"><h2>Finish Jotform setup</h2><ol><li>Add a hidden field to each form with the unique name <code>waiverToken</code>.</li><li>Add this webhook URL to each imported form, replacing any older waiver webhook URL:</li></ol><input readOnly value={webhookUrl} onFocus={event => event.currentTarget.select()} /><p>Store this URL now. Its secret is intentionally shown only when created.</p></section>}

    <section className="waiver-section"><div className="section-heading"><div><h2>Form routing rules</h2><p>Specific service and artist matches win over general forms. Lower priority numbers win ties.</p></div><strong>{setup.forms.length} forms</strong></div>{setup.forms.length === 0 ? <div className="empty">Connect Jotform or add a custom form to begin.</div> : <div className="form-list">{setup.forms.map(form => <FormEditor key={form.id} form={form} setup={setup} busy={busy} onSaved={refresh} onMessage={setMessage} />)}</div>}</section>

    <section className="waiver-section"><div className="section-heading"><div><h2>Upcoming appointments</h2><p>Auto-select applies the routing rules above. Choose a form manually when needed.</p></div><strong>{appointments.length} appointments</strong></div><div className="appointment-list">{appointments.length === 0 ? <div className="empty">No upcoming appointments.</div> : appointments.map(row => <AppointmentWaivers key={row.appointment.id} row={row} forms={setup.forms} busy={busy} onSend={sendWaiver} onAction={assignmentAction} />)}</div></section>
  </main>;
}

function FormEditor({ form, setup, busy, onSaved, onMessage }: { form: FormRow; setup: Setup; busy: boolean; onSaved: () => Promise<void>; onMessage: (value: string) => void }) {
  const [value, setValue] = useState(form);
  useEffect(() => setValue(form), [form]);
  async function save() { try { await readJson(await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "UPDATE_FORM", formId: value.id, category: value.category, audience: value.audience, artistId: value.artistId, serviceId: value.serviceId, priority: Number(value.priority), active: value.active, collectsMedicalData: value.collectsMedicalData }) })); onMessage("Routing rule saved."); await onSaved(); } catch (error) { onMessage(error instanceof Error ? error.message : "Unable to save form"); } }
  return <article className="form-row"><div className="form-name"><strong>{value.name}</strong><span>{value.provider} · {value.completionMode === "WEBHOOK" ? "Automatic completion" : "Manual completion"}</span></div><label>Audience<select value={value.audience} onChange={event => setValue({ ...value, audience: event.target.value as FormRow["audience"] })}><option value="ANY">Any age</option><option value="ADULT">Adult</option><option value="MINOR">Minor</option></select></label><label>Artist<select value={value.artistId ?? ""} onChange={event => setValue({ ...value, artistId: event.target.value || null })}><option value="">All artists</option>{setup.artists.map(artist => <option key={artist.id} value={artist.id}>{artist.name}</option>)}</select></label><label>Service<select value={value.serviceId ?? ""} onChange={event => setValue({ ...value, serviceId: event.target.value || null })}><option value="">All services</option>{setup.services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label>Priority<input type="number" min="0" max="1000" value={value.priority} onChange={event => setValue({ ...value, priority: Number(event.target.value) })} /></label><label className="check"><input type="checkbox" checked={value.collectsMedicalData} onChange={event => setValue({ ...value, collectsMedicalData: event.target.checked })} />Medical data</label><label className="check"><input type="checkbox" checked={value.active} onChange={event => setValue({ ...value, active: event.target.checked })} />Active</label><button disabled={busy} onClick={save}>Save</button></article>;
}

function AppointmentWaivers({ row, forms, busy, onSend, onAction }: { row: AppointmentRow; forms: FormRow[]; busy: boolean; onSend: (appointmentId: string, formId?: string) => Promise<void>; onAction: (id: string, action: "MARK_COMPLETE" | "MARK_REVIEWED" | "VOID") => Promise<void> }) {
  const [formId, setFormId] = useState("");
  return <article className="appointment-row-waiver"><div><strong>{row.clientName}</strong><span>{new Date(row.appointment.startsAt).toLocaleString()} · {row.artistName} · {row.serviceName ?? "Appointment"}</span><small>{row.clientPhone ?? "No phone"} · {row.clientSmsOptIn ? "SMS opted in" : "Not opted in"} · {row.clientDateOfBirth ? "Birth date available" : "Birth date missing"}</small></div><div className="send-controls"><select value={formId} onChange={event => setFormId(event.target.value)}><option value="">Auto-select form</option>{forms.filter(form => form.active).map(form => <option key={form.id} value={form.id}>{form.name}</option>)}</select><button disabled={busy || !row.clientSmsOptIn} onClick={() => onSend(row.appointment.id, formId || undefined)}>Send waiver</button></div>{row.assignments.length > 0 && <div className="assignment-list">{row.assignments.map(item => <div key={item.assignment.id}><span className={`status ${item.assignment.status.toLowerCase()}`}>{item.assignment.status}</span><strong>{item.formName}</strong><small>{item.provider}</small>{!["COMPLETED", "REVIEWED", "VOID"].includes(item.assignment.status) && <><button onClick={() => onAction(item.assignment.id, "MARK_COMPLETE")}>Mark complete</button><button onClick={() => onAction(item.assignment.id, "VOID")}>Void</button></>}{item.assignment.status === "COMPLETED" && <button onClick={() => onAction(item.assignment.id, "MARK_REVIEWED")}>Mark reviewed</button>}</div>)}</div>}</article>;
}
