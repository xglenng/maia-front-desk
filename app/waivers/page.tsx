"use client";

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import FormNotificationSettings from "./form-notification-settings";
import UiIcon from "@/components/ui-icon";
import type {SavedRequestForm} from "./native-editor";
import {requestTypeLabel} from "@/packages/waivers/request-starters";
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
  const settingsDialog=useRef<HTMLDialogElement>(null);
  const [library,setLibrary]=useState<'YOUR'|'SENT'>('YOUR');
  const [search,setSearch]=useState('');
  const [statusFilter,setStatusFilter]=useState('ALL');
  const [formType, setFormType] = useState<'ALL' | 'CONSENT' | 'REQUEST'>('ALL');
  const [setup, setSetup] = useState<Setup>({ connections: [], forms: [], artists: [], services: [] });
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [requestForms,setRequestForms]=useState<SavedRequestForm[]>([]);
  const [requestError,setRequestError]=useState("");
  const [requestLoading,setRequestLoading]=useState(true);
  
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  
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
  const [message, setMessage] = useState<{text:string;created?:boolean} | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('setup') === 'connect') {
      setProvider('LINK');
      customDialog.current?.showModal();
    }
  }, []);

  const refreshSetup = useCallback(async () => {
    setSetupLoading(true);
    setSetupError(null);
    try {
      const configuration = await readJson<Setup>(await fetch("/api/waiver-integrations", { cache: "no-store" }));
      setSetup(configuration);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Couldn't load forms";
      setSetupError(msg);
      return false;
    } finally {
      setSetupLoading(false);
    }
  }, []);

  const refreshAppointments = useCallback(async () => {
    setAppointmentsLoading(true);
    setAppointmentsError(null);
    try {
      const schedule = await readJson<{ appointments: AppointmentRow[] }>(await fetch("/api/waiver-assignments", { cache: "no-store" }));
      setAppointments(schedule.appointments);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Couldn't load appointments";
      setAppointmentsError(msg);
      return false;
    } finally {
      setAppointmentsLoading(false);
    }
  }, []);

  const refreshRequests = useCallback(async () => {
    setRequestLoading(true);setRequestError("");
    try {
      const data=await readJson<{forms:SavedRequestForm[]}>(await fetch('/api/request-forms',{cache:'no-store'}));
      setRequestForms(data.forms);
      return true;
    } catch (error) {
      setRequestError(error instanceof Error?error.message:'Unable to load request forms.');
      return false;
    } finally {setRequestLoading(false);}
  }, []);

  const refresh = useCallback(async () => {
    const setupResult = await refreshSetup();
    const appointmentsResult = await refreshAppointments();
    const requestResult = await refreshRequests();
    return setupResult && appointmentsResult && requestResult;
  }, [refreshSetup, refreshAppointments, refreshRequests]);

  useEffect(() => {
    void refresh();
    if (new URLSearchParams(window.location.search).get("created") === "1") {
      setMessage({text:"Consent form created. It is now available in Current forms.",created:true});
    } else if (new URLSearchParams(window.location.search).get("created") === "request") {
      setMessage({text:"Request form saved. Share its reusable link with clients.",created:true});
    }
  }, [refresh]);

  async function connect(event: FormEvent) {
    event.preventDefault(); if(busy)return; setBusy(true);setCustomError(null);
    try {
      const result = await readJson<{ webhookUrl: string; formsImported: number }>(await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CONNECT_JOTFORM", apiKey, region, label: "Jotform" }) }));
      setApiKey(""); setWebhookUrl(result.webhookUrl);customDialog.current?.close();const refreshed=await refresh();setMessage({text:refreshed?`${result.formsImported} Jotform forms synchronized.`:"Jotform connected, but the form list could not be refreshed. Refresh the page."});
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
      setMessage({text:refreshed?"Existing form added.": "Existing form added, but the list could not be refreshed. Refresh the page to see it."});
    } catch (error) { setCustomError({message:error instanceof Error ? error.message : "Unable to add form"}); } finally { setCustomSaving(false); }
  }

  async function sync(connectionId: string) {
    setBusy(true);setCustomError(null);setJotFeedback(""); try { const result = await readJson<{ imported: number }>(await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SYNC", connectionId }) })); const refreshed=await refresh();setJotFeedback(refreshed?`${result.imported} forms synchronized.`:"Forms synchronized, but the list could not be refreshed."); } catch (error) { setCustomError({message:error instanceof Error ? error.message : "Unable to sync forms"}); } finally { setBusy(false); }
  }

  async function rotateWebhook(connectionId: string) {
    setBusy(true);setCustomError(null); try { const result = await readJson<{ webhookUrl: string }>(await fetch("/api/waiver-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ROTATE_WEBHOOK", connectionId }) })); setWebhookUrl(result.webhookUrl);customDialog.current?.close(); setMessage({text:"New webhook URL created. Replace the old URL on every Jotform."}); } catch (error) { setCustomError({message:error instanceof Error ? error.message : "Unable to rotate webhook URL"}); } finally { setBusy(false); }
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
    setBusy(true); try { await readJson(await fetch(`/api/waiver-assignments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })); await refresh(); } catch (error) { setMessage({text:error instanceof Error ? error.message : "Unable to update waiver"}); } finally { setBusy(false); }
  }

  useEffect(()=>{if(window.location.hash==='#issued-consent-forms')setLibrary('SENT');},[]);
  const matchesForm=(name:string,active:boolean)=>name.toLowerCase().includes(search.toLowerCase())&&(statusFilter==='ALL'||(statusFilter==='ACTIVE')===active);
  function customFieldError(field:string) {
    return customError?.field===field?<span id="existing-form-error" className="existing-field-error" role="alert">{customError.message}</span>:null;
  }

  return <main className="waiver-admin">
    <header><a href="/settings">← Settings</a><h1>Forms</h1><button className="forms-settings" aria-label="Form notification settings" onClick={()=>settingsDialog.current?.showModal()}><UiIcon name="settings"/></button><p>Manage consent forms and client request forms.</p><div className="consent-page-actions"><a className="consent-create-link" href="/waivers/new" aria-label="Create form"><span className="create-form-plus" aria-hidden="true">+</span><span className="create-form-text">Create new</span></a><button type="button" className="consent-add-link" disabled={busy||customSaving} onClick={()=>{setCustomError(null);setJotFeedback("");setProvider("LINK");customDialog.current?.showModal();}}>Attach URL</button><a className="consent-archive-link" href="/waivers/archive"><UiIcon name="document"/>View signed forms</a><a className="consent-archive-link" href="/requests"><UiIcon name="inbox"/>View submitted requests</a></div></header>
    {message && <div className={`waiver-notice${message.created ? " success" : ""}`} role="status">{message.text}</div>}

    <div className="forms-library-tabs" role="group" aria-label="Form library"><button aria-pressed={library==='SENT'} onClick={()=>setLibrary('SENT')}>Sent forms</button><button aria-pressed={library==='YOUR'} onClick={()=>setLibrary('YOUR')}>Your forms</button></div>
    {library==='YOUR'&&<label className="forms-search">Search forms<input type="search" placeholder="Search forms" value={search} onChange={e=>setSearch(e.target.value)}/></label>}
    <div className="form-library-filters" hidden={library==='SENT'} role="group" aria-label="Form type">
      {([
        { value: 'ALL', label: 'All forms' },
        { value: 'CONSENT', label: 'Consent forms' },
        { value: 'REQUEST', label: 'Request forms' },
      ] as const).map(filter => <button key={filter.value} type="button" aria-pressed={formType === filter.value}
        onClick={() => setFormType(filter.value)}>{filter.label}</button>)}
    </div>
    {library==='YOUR'&&<label className="forms-status-filter">Status<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>}

    <section className="waiver-section" hidden={library!=='YOUR'||formType === 'REQUEST'}><div className="section-heading"><div><h2>Consent forms</h2><p>Edit consent wording, preview a form, or manage when it is used. Publishing changes creates a new version.</p></div><strong>{!setupLoading && setup.forms.length > 0 ? setup.forms.length : (setupLoading ? "-" : "0")} forms</strong></div>{setupLoading ? <div className="loading">Loading…</div> : setupError ? <div className="error-state"><p role="alert">Couldn't load forms. {setupError}</p><button type="button" onClick={() => refreshSetup()}>Retry</button></div> : setup.forms.length === 0 ? <div className="empty">No forms yet. Create a Maia form or add an existing form link.</div> : <div className="form-list">{setup.forms.filter(form=>matchesForm(form.name,form.active)).map(form => <FormEditor key={form.id} form={form} setup={setup} busy={busy} onSaved={refresh} onDeleted={text=>setMessage({text})} />)}</div>}</section>

    <section className="waiver-section" hidden={library!=='YOUR'||formType === 'CONSENT'}><div className="section-heading"><div><h2>Request forms</h2><p>Share reusable inquiry links. Requests do not book appointments or collect deposits.</p></div><strong>{requestLoading?'–':requestForms.length} forms</strong></div>
      {requestLoading?<div className="loading">Loading…</div>:requestError?<div className="error-state"><p role="alert">{requestError}</p><button type="button" onClick={()=>void refreshRequests()}>Retry</button></div>:!requestForms.length?<div className="empty">No request forms yet.</div>:<div className="form-list">{requestForms.filter(form=>matchesForm(form.name,form.active)).map(form=><article key={form.id} className="routing-rule request-form-row"><div className="routing-summary"><strong>{form.name}</strong><span>{requestTypeLabel(form.requestType)}</span></div><span className={`form-state ${form.active?'active':'inactive'}`}>{form.active?'Active':'Inactive'}</span><div className="request-form-actions"><a className="request-row-action form-icon-action" href={`/waivers/requests/${form.id}`} aria-label={`Edit ${form.name}`} title="Edit form"><UiIcon name="edit"/></a>{form.active&&<FormLink url={form.url} reusable/>}</div></article>)}</div>}
    </section>

    <section id="issued-consent-forms" className="waiver-section" hidden={library!=='SENT'}><div className="section-heading"><div><h2>Sent forms & upcoming appointments</h2><p>Auto-select applies the routing rules above. Choose a form manually when needed.</p></div><strong>{!appointmentsLoading && appointments.length > 0 ? appointments.length : (appointmentsLoading ? "-" : "0")} appointments</strong></div><div className="appointment-list">{appointmentsLoading ? <div className="loading">Loading…</div> : appointmentsError ? <div className="error-state"><p role="alert">Couldn't load appointments. {appointmentsError}</p><button type="button" onClick={() => refreshAppointments()}>Retry</button></div> : appointments.length === 0 ? <div className="empty">No upcoming appointments.</div> : appointments.map(row => <AppointmentWaivers key={row.appointment.id} row={row} formLink={formLinks[row.appointment.id]} notice={appointmentMessages[row.appointment.id]} forms={setup.forms.filter(f=>!f.artistId||f.artistId===row.appointment.artistId)} busy={busy} onSend={sendWaiver} onCreateLink={createLink} onAction={assignmentAction} />)}</div></section>

    <dialog ref={settingsDialog} className="routing-dialog forms-settings-dialog" aria-labelledby="forms-settings-title"><div className="routing-dialog-heading"><h2 id="forms-settings-title">Form settings</h2><button aria-label="Close form settings" onClick={()=>settingsDialog.current?.close()}>×</button></div><FormNotificationSettings/></dialog>
    <dialog ref={customDialog} className="routing-dialog" aria-labelledby="custom-form-title" onCancel={event => { if (customSaving || busy) event.preventDefault(); }}>
      <div className="routing-dialog-heading"><h2 id="custom-form-title">Connect to existing form</h2><button type="button" className="routing-edit" aria-label="Close dialog" disabled={customSaving || busy} onClick={() => customDialog.current?.close()}>×</button></div>
      
      <div className="custom-form-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={provider === "LINK"} aria-controls="form-link-panel" disabled={customSaving || busy} onClick={() => { setProvider("LINK"); setCustomError(null); }} className="tab-button">External form link</button>
        <button type="button" role="tab" aria-selected={provider === "JOTFORM"} aria-controls="form-jotform-panel" disabled={customSaving || busy} onClick={() => { setProvider("JOTFORM"); setCustomError(null); setJotFeedback(""); }} className="tab-button">Jotform</button>
      </div>

      {provider === "LINK" && <form id="form-link-panel" role="tabpanel" onSubmit={addCustom} onChangeCapture={() => setCustomError(null)}>
        <fieldset disabled={customSaving || busy} className="routing-fields">
          <label>Form name<input type="text" placeholder="e.g., Adult tattoo consent" value={custom.name} onChange={event => setCustom({ ...custom, name: event.target.value })} required /></label>
          {customFieldError("name")}
          <label>Form URL<input type="url" placeholder="https://example.com/form" value={custom.formUrl} onChange={event => setCustom({ ...custom, formUrl: event.target.value })} required /></label>
          {customFieldError("formUrl")}
          <label>Category<select value={custom.category} onChange={event => setCustom({ ...custom, category: event.target.value })}><option value="GENERAL">General consent</option><option value="MEDICAL">Medical history</option><option value="LIABILITY">Liability waiver</option><option value="AFTERCARE">Aftercare instructions</option></select></label>
          <label>Audience<select value={custom.audience} onChange={event => setCustom({ ...custom, audience: event.target.value as FormRow["audience"] })}><option value="ANY">Any age</option><option value="ADULT">Adult</option><option value="MINOR">Minor</option></select></label>
          <label>Artist<select value={custom.artistId ?? ""} onChange={event => setCustom({ ...custom, artistId: event.target.value || "" })}><option value="">All artists</option>{setup.artists.map(artist => <option key={artist.id} value={artist.id}>{artist.name}</option>)}</select></label>
        </fieldset>
        {customError && customError.field && customError.message && <p className="form-save-feedback error" role="alert">{customError.message}</p>}
        {customError && !customError.field && <p className="form-save-feedback error" role="alert">{customError.message}</p>}
        <footer><button type="button" className="routing-edit" disabled={customSaving} onClick={() => { customDialog.current?.close(); setCustom({ name: "", formUrl: "", category: "GENERAL", audience: "ANY", artistId: "" }); setCustomError(null); }}>Cancel</button><button type="submit" disabled={customSaving || busy}>{customSaving ? "Adding…" : "Add form"}</button></footer>
      </form>}

      {provider === "JOTFORM" && <form id="form-jotform-panel" role="tabpanel" onSubmit={connect} onChangeCapture={() => setCustomError(null)}>
        <fieldset disabled={customSaving || busy} className="routing-fields">
          <label>Jotform API key<input type="password" placeholder="Enter your Jotform API key" value={apiKey} onChange={event => setApiKey(event.target.value)} required /></label>
          {customFieldError("apiKey")}
          <label>Region<select value={region} onChange={event => setRegion(event.target.value)}><option value="STANDARD">Standard (US)</option><option value="EU">Europe</option></select></label>
        </fieldset>
        {customError && <p className="form-save-feedback error" role="alert">{customError.message}</p>}
        {jotFeedback && <p className="form-save-feedback" role="status">{jotFeedback}</p>}
        <footer><button type="button" className="routing-edit" disabled={customSaving} onClick={() => { customDialog.current?.close(); setApiKey(""); setCustomError(null); setJotFeedback(""); }}>Cancel</button><button type="submit" disabled={customSaving || busy}>{customSaving ? "Connecting…" : "Connect Jotform"}</button></footer>
      </form>}
    </dialog>
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
  return <article className="routing-rule consent-form-row" aria-busy={saving}>
    <div className="routing-summary"><strong>{form.name}</strong><span>{artist} · {service} · {form.audience === "ANY" ? "Any age" : form.audience === "ADULT" ? "Adult" : "Minor"} · Priority {form.priority}</span>{form.provider !== "MAIA" && <span>Content is edited {form.provider === "JOTFORM" ? "in Jotform" : "with the external form provider"}.</span>}</div>
    <span className={`form-state ${form.active ? "active" : "inactive"}`}>{form.active ? "Active" : "Inactive"}</span>
    <div className="request-form-actions">
    {form.provider==='MAIA'&&<><a className="request-row-action form-icon-action" href={`/waivers/consent/${form.id}`} aria-label={`Edit ${form.name}`} title="Edit form"><UiIcon name="edit"/></a><a className="request-row-action form-icon-action" href={`/waivers/consent/${form.id}/preview`} target="_blank" rel="noreferrer" aria-label={`Preview ${form.name}`} title="Preview form"><UiIcon name="eye"/></a></>}
    <button type="button" className="request-row-action form-icon-action" disabled={busy || saving} onClick={openEditor} aria-label={`Settings for ${form.name}`} title="Form settings"><UiIcon name="settings"/></button>
    {form.canDelete&&<button type="button" className="request-row-action form-icon-action" disabled={busy || saving} onClick={()=>{setFeedback(null);deleteDialog.current?.showModal();}} aria-label={`Delete ${form.name}`} title="Delete form"><UiIcon name="trash"/></button>}
    </div>
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
        <div className="form-name"><strong>{form.name}</strong><span>{form.provider} · {form.completionMode === "HOSTED" ? "Signed in Maia" : form.completionMode === "WEBHOOK" ? "Automatic completion" : "Manual completion"}</span>{form.provider !== "MAIA" && /^https:\/\//i.test(form.formUrl) && <a href={form.formUrl} target="_blank" rel="noopener noreferrer">Open form</a>}</div>
        {form.provider === "MAIA" && <p>Change the audience through Edit form and publish a new version. Existing issued links retain their original version; unresolved legacy links must be reviewed first.</p>}
        <fieldset disabled={saving || busy} className="routing-fields"><label>Audience<select disabled={form.provider==='MAIA'} value={value.audience} onChange={event => setValue({ ...value, audience: event.target.value as FormRow["audience"] })}><option value="ANY">Any age</option><option value="ADULT">Adult</option><option value="MINOR">Minor</option></select></label><label>Artist<select value={value.artistId ?? ""} onChange={event => setValue({ ...value, artistId: event.target.value || null })}>{setup.isOwner&&<option value="">All artists</option>}{setup.artists.map(artist => <option key={artist.id} value={artist.id}>{artist.name}</option>)}</select></label><label>Service<select value={value.serviceId ?? ""} onChange={event => setValue({ ...value, serviceId: event.target.value || null })}><option value="">All services</option>{setup.services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label>Priority<input type="number" min="0" max="1000" value={value.priority} onChange={event => setValue({ ...value, priority: Number(event.target.value) })} /></label><label className="check"><input type="checkbox" checked={value.collectsMedicalData} onChange={event => setValue({ ...value, collectsMedicalData: event.target.checked })} />Medical data</label><label className="check"><input type="checkbox" checked={value.active} onChange={event => setValue({ ...value, active: event.target.checked })} />Active</label></fieldset>
        {feedback?.error && <p className="form-save-feedback error" role="alert">{feedback.text}</p>}
        <footer><button type="button" className="routing-edit" disabled={saving} onClick={() => dialog.current?.close()}>Cancel</button><button type="submit" disabled={busy || saving}>{saving ? "Saving…" : "Save changes"}</button></footer>
      </form>
    </dialog>
  </article>;
}

function AppointmentWaivers({ row, formLink, notice, forms, busy, onSend, onCreateLink, onAction }: { row: AppointmentRow; formLink?:string; notice?:string; forms: FormRow[]; busy: boolean; onSend: (appointmentId: string, formId?: string) => Promise<void>; onCreateLink:(appointmentId:string,formId?:string)=>Promise<void>; onAction: (id: string, action: "MARK_COMPLETE" | "MARK_REVIEWED" | "VOID") => Promise<void> }) {
  const [formId, setFormId] = useState("");
  const sendReason=busy?"Another waiver action is in progress.":!row.clientPhone&&!row.clientSmsOptIn?"The client needs a phone number and SMS consent.":!row.clientPhone?"The client needs a phone number.":!row.clientSmsOptIn?"The client has not opted in to SMS.":"";
  return <article className="appointment-row-waiver"><div><strong>{row.clientName}</strong><span>{new Date(row.appointment.startsAt).toLocaleString()} · {row.artistName} · {row.serviceName ?? "Appointment"}</span><small>{row.clientPhone ?? "No phone"} · {row.clientSmsOptIn ? "SMS opted in" : "Not opted in"} · {row.clientDateOfBirth ? "Birth date available" : "Birth date missing"}</small></div><div className="send-controls"><select aria-label={`Form for ${row.clientName}`} value={formId} onChange={event => setFormId(event.target.value)}><option value="">Auto-select form</option>{forms.filter(form => form.active).map(form => <option key={form.id} value={form.id}>{form.name}</option>)}</select><button disabled={busy} onClick={()=>onCreateLink(row.appointment.id,formId||undefined)}>Create form link</button><button disabled={Boolean(sendReason)} onClick={() => onSend(row.appointment.id, formId || undefined)}>Send waiver</button>{sendReason&&<small className="send-disabled-reason">{sendReason}</small>}</div>{notice&&<p className="appointment-feedback" role="status">{notice}</p>}{formLink&&<FormLink key={formLink} url={formLink} />}{row.assignments.length > 0 && <div className="assignment-list">{row.assignments.map(item => <div key={item.assignment.id}><span className={`status ${item.assignment.status.toLowerCase()}`}>{item.assignment.status}</span><strong>{item.formName}</strong><small>{item.provider}</small>{item.assignment.sentAt&&<small>Sent {new Date(item.assignment.sentAt).toLocaleString()}</small>}{item.assignment.completedAt&&<small>Completed {new Date(item.assignment.completedAt).toLocaleString()}</small>}{item.hasPhotoId&&<a href={`/api/waiver-assignments/${item.assignment.id}/photo-id`} target="_blank" rel="noreferrer">Download photo ID</a>}{!["COMPLETED", "REVIEWED", "VOID"].includes(item.assignment.status) && <>{item.provider!=="MAIA"&&<button onClick={() => onAction(item.assignment.id, "MARK_COMPLETE")}>Mark complete</button>}<button onClick={() => onAction(item.assignment.id, "VOID")}>Void</button></>}{item.assignment.status === "COMPLETED" && <button onClick={() => onAction(item.assignment.id, "MARK_REVIEWED")}>Mark reviewed</button>}</div>)}</div>}</article>;
}

function FormLink({url,reusable=false}:{url:string;reusable?:boolean}) {
  const inputId=useId();
  const [feedback,setFeedback]=useState("");
  const [copyFailed,setCopyFailed]=useState(false);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  async function copy(){
    if(timer.current)clearTimeout(timer.current);
    try {
      if(!navigator.clipboard?.writeText)throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopyFailed(false);
      setFeedback("Link copied");
      timer.current=setTimeout(()=>setFeedback(""),3000);
    } catch {setCopyFailed(true);setFeedback("Could not copy. Select the link and copy it manually.");}
  }
  if (reusable) return <div className="request-link-actions">
    <button type="button" className="request-row-action form-icon-action" onClick={() => void copy()} aria-label="Copy form link" title="Copy link"><UiIcon name="copy"/></button>
    <a className="request-row-action form-icon-action" href={url} target="_blank" rel="noopener noreferrer" aria-label="Open form" title="Open form"><UiIcon name="eye"/></a>
    <span className="request-link-feedback" role="status">{feedback}</span>
    {copyFailed && <label className="request-link-fallback" htmlFor={inputId}>Client form link<input id={inputId} readOnly value={url} onFocus={event => event.currentTarget.select()}/></label>}
  </div>;
  return <div className="appointment-form-link"><label htmlFor={inputId}>Client form link</label><div className="form-link-controls"><input id={inputId} readOnly value={url} onFocus={event=>event.currentTarget.select()}/><button type="button" className="copy-form-link" aria-label="Copy form link" onClick={()=>void copy()}><UiIcon name="copy"/></button></div><span className="form-link-feedback" role="status">{feedback}</span><a className="open-form-link" href={url} target="_blank" rel="noopener noreferrer">Open form</a><p>Share only with this client. This appointment-specific link is shown for this session.</p></div>;
}
