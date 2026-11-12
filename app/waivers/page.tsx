"use client";

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import UiIcon from "@/components/ui-icon";
import "./waivers.css";

type FormRow = { id: string; provider: string; name: string; formUrl: string; category: string; audience: "ANY" | "ADULT" | "MINOR"; artistId: string | null; serviceId: string | null; priority: number; active: boolean; collectsMedicalData: boolean; completionMode: string;canDelete:boolean };
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
  const [provider, setProvider] = useState("LINK");
  const [custom, setCustom] = useState({ name: "", formUrl: "", category: "GENERAL", audience: "ANY", artistId:"" });
  const customDialog = useRef<HTMLDialogElement>(null);
  const [customError,setCustomError]=useState<{field?:string;message:string}|null>(null);
  const [jotFeedback,setJotFeedback]=useState("");
  const [customSaving,setCustomSaving]=useState(false);
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
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load waiver setup"); return false; }
  }, []);
  useEffect(() => { void refresh(); if (new URLSearchParams(window.location.search).get("created") === "1") setMessage("Consent form created. It is now available in Current forms."); }, [refresh]);

  async function connect(event: FormEvent) {
    event.preventDefault(); if(busy)return; setBusy(true);setCustomError(null);
    try {
      const result = await readJson<{ webhookUrl: string; formsImported: number }>(await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CONNECT_JOTFORM", apiKey, region, label: "Jotform" }) }));
      setApiKey(""); setWebhookUrl(result.webhookUrl);customDialog.current?.close();const refreshed=await refresh();setMessage(refreshed?`${result.formsImported} Jotform forms synchronized.`:"Jotform connected, but the form list could not be refreshed. Refresh the page.");
    } catch (error) { setCustomError({message:error instanceof Error ? error.message : "Unable to connect Jotform"}); } finally { setBusy(false); }
  }

  async function addCustom(event: FormEvent) {
    event.preventDefault(); if(customSaving)return; setCustomSaving(true);setCustomError(null);
    try {
      const response=await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ADD_CUSTOM_FORM", ...custom, priority: 100, collectsMedicalData: false }) });
      const data=await response.json();
      if(!response.ok){
        const fields=data.error?.fieldErrors;
        if(fields&&typeof fields==="object"){
          const entry=Object.entries(fields).find(([,messages])=>Array.isArray(messages)&&typeof messages[0]==="string");
          if(entry){setCustomError({field:entry[0],message:(entry[1] as string[])[0]});return;}
        }
        throw new Error(typeof data.error==="string"?data.error:"Unable to add form. Check the form details and try again.");
      }
      customDialog.current?.close();
      setCustom({ name: "", formUrl: "", category: "GENERAL", audience: "ANY", artistId:"" });
      const refreshed=await refresh();
      setMessage(refreshed?"Existing form added.": "Existing form added, but the list could not be refreshed. Refresh the page to see it.");
    } catch (error) { setCustomError({message:error instanceof Error ? error.message : "Unable to add form"}); } finally { setCustomSaving(false); }
  }

  async function sync(connectionId: string) {
    setBusy(true);setCustomError(null);setJotFeedback(""); try { const result = await readJson<{ imported: number }>(await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SYNC", connectionId }) })); const refreshed=await refresh();setJotFeedback(refreshed?`${result.imported} forms synchronized.`:"Forms synchronized, but the list could not be refreshed."); } catch (error) { setCustomError({message:error instanceof Error ? error.message : "Unable to sync forms"}); } finally { setBusy(false); }
  }

  async function rotateWebhook(connectionId: string) {
    setBusy(true);setCustomError(null); try { const result = await readJson<{ webhookUrl: string }>(await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ROTATE_WEBHOOK", connectionId }) })); setWebhookUrl(result.webhookUrl);customDialog.current?.close(); setMessage("New webhook URL created. Replace the old URL on every Jotform."); } catch (error) { setCustomError({message:error instanceof Error ? error.message : "Unable to rotate webhook URL"}); } finally { setBusy(false); }
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

  function customFieldError(field:string) {
    return customError?.field===field?<span id="existing-form-error" className="existing-field-error" role="alert">{customError.message}</span>:null;
  }

  return <main className="waiver-admin">
    <header><a href="/settings">← Settings</a><h1>Consent forms & waivers</h1><p>Manage the consent forms available to your artists and send them to clients.</p><div className="consent-page-actions"><a className="consent-create-link" href="/waivers/new" aria-label="Create form"><span className="create-form-plus" aria-hidden="true">+</span><span className="create-form-text">Create form</span></a><button type="button" className="consent-add-link" disabled={busy||customSaving} onClick={()=>{setCustomError(null);setJotFeedback("");customDialog.current?.showModal();}}>+ Add existing form</button><a href="/waivers/archive">View signed forms →</a></div></header>
    {message && <div className="waiver-notice" role="status">{message}</div>}

    <section className="waiver-section"><div className="section-heading"><div><h2>Current forms</h2><p>Your available consent forms. Edit a form to choose when it is used and whether it is active.</p></div><strong>{setup.forms.length} forms</strong></div>{setup.forms.length === 0 ? <div className="empty">No forms yet. Create a Maia form or add an existing form link.</div> : <div className="form-list">{setup.forms.map(form => <FormEditor key={form.id} form={form} setup={setup} busy={busy} onSaved={refresh} onDeleted={setMessage} />)}</div>}</section>
    <dialog ref={customDialog} className="routing-dialog existing-form-dialog" aria-labelledby="existing-form-title" onCancel={event=>{if(customSaving||busy)event.preventDefault();}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();if(!customSaving&&!busy)customDialog.current?.close();}}}>
      <form className="waiver-card" onSubmit={provider==="JOTFORM_API"?connect:addCustom} onChangeCapture={()=>setCustomError(null)}>
        <div className="routing-dialog-heading"><h2 id="existing-form-title">Add existing form</h2><button type="button" className="routing-edit" aria-label="Close add existing form" disabled={customSaving||busy} onClick={()=>customDialog.current?.close()}>×</button></div>
        <div className="card-title"><div><h3>Bring your existing form</h3><p>Use a public form link, or connect Jotform to import forms and record completion automatically. Linked forms remain with their provider and completion is recorded manually.</p></div></div>
        <label>Provider<select value={provider} disabled={busy||customSaving} onChange={event=>{setProvider(event.target.value);setJotFeedback("");}}><option value="LINK">Other public form link</option><option value="JOTFORM_LINK">Jotform public link</option>{setup.isOwner&&<option value="JOTFORM_API">Jotform integration</option>}<option value="GOOGLE">Google Forms</option><option value="TYPEFORM">Typeform</option><option value="SQUARE">Square</option></select></label>
        {provider==="JOTFORM_API"?<>
        <p>API credentials are encrypted and never displayed again.</p>
        <label>API region<select value={region} onChange={event => setRegion(event.target.value)}><option value="STANDARD">Standard</option><option value="EU">European Union</option><option value="HIPAA">HIPAA</option></select></label>
        <label>Jotform API key<input type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} required minLength={10} /></label>
        {setup.connections.map(connection => <div className="connection" key={connection.id}><div><strong>{connection.label}</strong><small>{connection.status} · {connection.lastSyncedAt ? `Synced ${new Date(connection.lastSyncedAt).toLocaleString()}` : "Not synced"}</small></div><div><button type="button" className="secondary" disabled={busy} onClick={() => sync(connection.id)}>Sync</button><button type="button" className="secondary" disabled={busy} onClick={() => rotateWebhook(connection.id)}>New webhook URL</button></div></div>)}
        {jotFeedback&&<p role="status">{jotFeedback}</p>}
        </>:<>
        <label>Form name<input maxLength={160} value={custom.name} onChange={event => setCustom({ ...custom, name: event.target.value })} required aria-invalid={customError?.field==="name"} aria-describedby={customError?.field==="name"?"existing-form-error":undefined} />{customFieldError("name")}</label>
        <label>Artist<select required value={custom.artistId} onChange={event=>setCustom({...custom,artistId:event.target.value})} aria-invalid={customError?.field==="artistId"} aria-describedby={customError?.field==="artistId"?"existing-form-error":undefined}><option value="">Choose an artist</option>{setup.artists.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>{customFieldError("artistId")}</label>
        <label>Public form URL<input type="url" maxLength={2000} placeholder="https://…" value={custom.formUrl} onChange={event => setCustom({ ...custom, formUrl: event.target.value })} required aria-invalid={customError?.field==="formUrl"} aria-describedby={customError?.field==="formUrl"?"existing-form-error":undefined} />{customFieldError("formUrl")}</label>
        <div className="two-fields"><label>Category<input maxLength={40} value={custom.category} onChange={event => setCustom({ ...custom, category: event.target.value })} aria-invalid={customError?.field==="category"} aria-describedby={customError?.field==="category"?"existing-form-error":undefined} />{customFieldError("category")}</label><label>Audience<select value={custom.audience} onChange={event => setCustom({ ...custom, audience: event.target.value })} aria-invalid={customError?.field==="audience"} aria-describedby={customError?.field==="audience"?"existing-form-error":undefined}><option value="ANY">Any age</option><option value="ADULT">Adult</option><option value="MINOR">Minor</option></select>{customFieldError("audience")}</label></div></>}
        {customError&&!["name","artistId","formUrl","category","audience"].includes(customError.field||"")&&<p className="form-save-feedback error" role="alert">{customError.message}</p>}
        <footer><button type="button" className="routing-edit" disabled={customSaving||busy} onClick={()=>customDialog.current?.close()}>Cancel</button><button type="submit" disabled={customSaving||busy||(provider==="JOTFORM_API"&&!apiKey)}>{busy?"Connecting…":customSaving?"Saving…":provider==="JOTFORM_API"?"Connect and import forms":"Add form link"}</button></footer>
      </form>
    </dialog>

    {webhookUrl && <section className="webhook-callout"><h2>Finish Jotform setup</h2><ol><li>Add a hidden field to each form with the unique name <code>waiverToken</code>.</li><li>Add this webhook URL to each imported form, replacing any older waiver webhook URL:</li></ol><input readOnly value={webhookUrl} onFocus={event => event.currentTarget.select()} /><p>Store this URL now. Its secret is intentionally shown only when created.</p></section>}



    <section className="waiver-section"><div className="section-heading"><div><h2>Upcoming appointments</h2><p>Auto-select applies the routing rules above. Choose a form manually when needed.</p></div><strong>{appointments.length} appointments</strong></div><div className="appointment-list">{appointments.length === 0 ? <div className="empty">No upcoming appointments.</div> : appointments.map(row => <AppointmentWaivers key={row.appointment.id} row={row} formLink={formLinks[row.appointment.id]} notice={appointmentMessages[row.appointment.id]} forms={setup.forms.filter(f=>!f.artistId||f.artistId===row.appointment.artistId)} busy={busy} onSend={sendWaiver} onCreateLink={createLink} onAction={assignmentAction} />)}</div></section>
  </main>;
}

function FormEditor({ form, setup, busy, onSaved, onDeleted }: { form: FormRow; setup: Setup; busy: boolean; onSaved: () => Promise<boolean>;onDeleted:(message:string)=>void }) {
  const [value, setValue] = useState(form);
  const [saving,setSaving]=useState(false);
  const [feedback,setFeedback]=useState<{text:string;error:boolean}|null>(null);
  useEffect(() => setValue(form), [form]);
  async function save() { setSaving(true);setFeedback(null);try { await readJson(await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "UPDATE_FORM", formId: value.id, category: value.category, audience: value.audience, artistId: value.artistId, serviceId: value.serviceId, priority: Number(value.priority), active: value.active, collectsMedicalData: value.collectsMedicalData }) })); await onSaved();dialog.current?.close();setFeedback({text:value.active?"Saved. This form is active.":"Saved. This form is inactive and will not be offered for new appointments.",error:false}); } catch (error) { setFeedback({text:error instanceof Error ? error.message : "Unable to save form",error:true}); } finally {setSaving(false);} }
  const dialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  async function deleteForm(){
    setSaving(true);setFeedback(null);
    try{
      await readJson(await fetch("/api/waiver-integrations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"DELETE_FORM",formId:form.id})}));
      deleteDialog.current?.close();
      const refreshed=await onSaved();
      onDeleted(refreshed?`"${form.name}" removed from Current forms. Signed records and existing links are preserved.`:`"${form.name}" was removed, but the list could not be refreshed. Refresh the page.`);
    }catch(error){setFeedback({text:error instanceof Error?error.message:"Unable to delete form.",error:true});}
    finally{setSaving(false);}
  }
  const artist = setup.artists.find(artist => artist.id === form.artistId)?.name ?? "All artists";
  const service = setup.services.find(service => service.id === form.serviceId)?.name ?? "All services";
  function openEditor() { setValue(form); setFeedback(null); dialog.current?.showModal(); }
  return <article className="routing-rule" aria-busy={saving}>
    <div className="routing-summary"><strong>{form.name}</strong><span>{artist} · {service} · {form.audience === "ANY" ? "Any age" : form.audience === "ADULT" ? "Adult" : "Minor"} · Priority {form.priority}</span></div>
    <span className={`form-state ${form.active ? "active" : "inactive"}`}>{form.active ? "Active" : "Inactive"}</span>
    <button type="button" className="routing-edit" disabled={busy || saving} onClick={openEditor} aria-label={`Edit settings for ${form.name}`}>Edit</button>
    {form.canDelete&&<button type="button" className="routing-edit" disabled={busy || saving} onClick={()=>{setFeedback(null);deleteDialog.current?.showModal();}} aria-label={`Delete ${form.name}`}>Delete form</button>}
    {feedback && !dialog.current?.open && !deleteDialog.current?.open && <p className={`form-save-feedback ${feedback.error ? "error" : "success"}`} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
    <dialog ref={deleteDialog} className="routing-dialog" aria-labelledby={`delete-title-${form.id}`} onCancel={event=>{if(saving)event.preventDefault();}}>
      <div className="delete-form-content"><h2 id={`delete-title-${form.id}`}>Delete {form.name}?</h2><p>This removes the form from Current forms and future selection. Signed records and links already sent to clients remain available. An active routing rule must be turned off first.</p>
        {feedback?.error&&<p className="form-save-feedback error" role="alert">{feedback.text}</p>}
        <footer><button type="button" className="routing-edit" disabled={saving} onClick={()=>deleteDialog.current?.close()}>Cancel</button><button type="button" className="routing-edit" disabled={saving} onClick={()=>void deleteForm()}>{saving?"Deleting…":"Delete form"}</button></footer>
      </div>
    </dialog>
    <dialog ref={dialog} className="routing-dialog" aria-labelledby={`routing-title-${form.id}`} onCancel={event => { if (saving) event.preventDefault(); }}>
      <form onSubmit={event => { event.preventDefault(); void save(); }} onChangeCapture={() => setFeedback(null)}>
        <div className="routing-dialog-heading"><h2 id={`routing-title-${form.id}`}>Edit form settings</h2><button type="button" className="routing-edit" aria-label="Close form settings" disabled={saving} onClick={() => dialog.current?.close()}>×</button></div>
        <div className="form-name"><strong>{form.name}</strong><span>{form.provider} · {form.completionMode === "HOSTED" ? "Signed in Maia" : form.completionMode === "WEBHOOK" ? "Automatic completion" : "Manual completion"}</span>{form.provider !== "MAIA" && /^https:\/\//i.test(form.formUrl) && <a href={form.formUrl} target="_blank" rel="noopener noreferrer">Open form ↗</a>}</div>
        <fieldset disabled={saving || busy} className="routing-fields"><label>Audience<select value={value.audience} onChange={event => setValue({ ...value, audience: event.target.value as FormRow["audience"] })}><option value="ANY">Any age</option><option value="ADULT">Adult</option><option value="MINOR">Minor</option></select></label><label>Artist<select value={value.artistId ?? ""} onChange={event => setValue({ ...value, artistId: event.target.value || null })}>{setup.isOwner&&<option value="">All artists</option>}{setup.artists.map(artist => <option key={artist.id} value={artist.id}>{artist.name}</option>)}</select></label><label>Service<select value={value.serviceId ?? ""} onChange={event => setValue({ ...value, serviceId: event.target.value || null })}><option value="">All services</option>{setup.services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label>Priority<input type="number" min="0" max="1000" value={value.priority} onChange={event => setValue({ ...value, priority: Number(event.target.value) })} /></label><label className="check"><input type="checkbox" checked={value.collectsMedicalData} onChange={event => setValue({ ...value, collectsMedicalData: event.target.checked })} />Medical data</label><label className="check"><input type="checkbox" checked={value.active} onChange={event => setValue({ ...value, active: event.target.checked })} />Active</label></fieldset>
        {feedback?.error && <p className="form-save-feedback error" role="alert">{feedback.text}</p>}
        <footer><button type="button" className="routing-edit" disabled={saving} onClick={() => dialog.current?.close()}>Cancel</button><button type="submit" disabled={busy || saving}>{saving ? "Saving…" : "Save changes"}</button></footer>
      </form>
    </dialog>
  </article>;
}

function AppointmentWaivers({ row, formLink, notice, forms, busy, onSend, onCreateLink, onAction }: { row: AppointmentRow; formLink?:string; notice?:string; forms: FormRow[]; busy: boolean; onSend: (appointmentId: string, formId?: string) => Promise<void>; onCreateLink:(appointmentId:string,formId?:string)=>Promise<void>; onAction: (id: string, action: "MARK_COMPLETE" | "MARK_REVIEWED" | "VOID") => Promise<void> }) {
  const [formId, setFormId] = useState("");
  const sendReason=busy?"Another waiver action is in progress.":!row.clientPhone&&!row.clientSmsOptIn?"The client needs a phone number and SMS consent.":!row.clientPhone?"The client needs a phone number.":!row.clientSmsOptIn?"The client has not opted in to SMS.":"";
  return <article className="appointment-row-waiver"><div><strong>{row.clientName}</strong><span>{new Date(row.appointment.startsAt).toLocaleString()} · {row.artistName} · {row.serviceName ?? "Appointment"}</span><small>{row.clientPhone ?? "No phone"} · {row.clientSmsOptIn ? "SMS opted in" : "Not opted in"} · {row.clientDateOfBirth ? "Birth date available" : "Birth date missing"}</small></div><div className="send-controls"><select aria-label={`Form for ${row.clientName}`} value={formId} onChange={event => setFormId(event.target.value)}><option value="">Auto-select form</option>{forms.filter(form => form.active).map(form => <option key={form.id} value={form.id}>{form.name}</option>)}</select><button disabled={busy} onClick={()=>onCreateLink(row.appointment.id,formId||undefined)}>Create form link</button><button disabled={Boolean(sendReason)} onClick={() => onSend(row.appointment.id, formId || undefined)}>Send waiver</button>{sendReason&&<small className="send-disabled-reason">{sendReason}</small>}</div>{notice&&<p className="appointment-feedback" role="status">{notice}</p>}{formLink&&<FormLink key={formLink} url={formLink} />}{row.assignments.length > 0 && <div className="assignment-list">{row.assignments.map(item => <div key={item.assignment.id}><span className={`status ${item.assignment.status.toLowerCase()}`}>{item.assignment.status}</span><strong>{item.formName}</strong><small>{item.provider}</small>{item.hasPhotoId&&<a href={`/api/waiver-assignments/${item.assignment.id}/photo-id`} target="_blank" rel="noreferrer">Download photo ID</a>}{!["COMPLETED", "REVIEWED", "VOID"].includes(item.assignment.status) && <>{item.provider!=="MAIA"&&<button onClick={() => onAction(item.assignment.id, "MARK_COMPLETE")}>Mark complete</button>}<button onClick={() => onAction(item.assignment.id, "VOID")}>Void</button></>}{item.assignment.status === "COMPLETED" && <button onClick={() => onAction(item.assignment.id, "MARK_REVIEWED")}>Mark reviewed</button>}</div>)}</div>}</article>;
}

function FormLink({url}:{url:string}) {
  const inputId=useId();
  const [feedback,setFeedback]=useState("");
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  async function copy(){
    if(timer.current)clearTimeout(timer.current);
    try {
      if(!navigator.clipboard?.writeText)throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setFeedback("Link copied");
      timer.current=setTimeout(()=>setFeedback(""),3000);
    } catch {setFeedback("Could not copy. Select the link and copy it manually.");}
  }
  return <div className="appointment-form-link"><label htmlFor={inputId}>Client form link</label><div className="form-link-controls"><input id={inputId} readOnly value={url} onFocus={event=>event.currentTarget.select()}/><button type="button" className="copy-form-link" aria-label="Copy form link" onClick={()=>void copy()}><UiIcon name="copy"/></button></div><span className="form-link-feedback" role="status">{feedback}</span><a className="open-form-link" href={url} target="_blank" rel="noopener noreferrer">Open form ↗</a><p>Share only with this client. This appointment-specific link is shown for this session.</p></div>;
}
