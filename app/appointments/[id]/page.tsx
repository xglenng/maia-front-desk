'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import {CheckoutTipReview} from '@/components/checkout-tip-review';
import {checkoutTip,type TipChoice} from '@/packages/integrations/checkout-tip';
import {StudioCardEntry} from '@/components/studio-card-entry';
import {paymentSummary} from '@/packages/integrations/payment-summary';
import {localDateString} from '@/packages/booking/src/time';
import {calendarMinute} from '@/packages/studio/calendar-layout';
import '@/components/native-calendar.css';
import { useSession } from '@/components/session-gate';

type Payment = { tipCents:number; refundedCents:number; purpose: string; id: string; provider: string; amountCents: number; status: string; confirmationMethod: string | null; confirmedAt: string | null };
type ExternalWaiver = { id: string; status: string; sentAt: string | null; completedAt: string | null; formName: string; provider: string };
type SignedWaiver = { id: string; submissionId: string; signedAt: string; templateName: string };
type AppointmentDetail = {
  location:{name:string;addressLine1:string|null;addressLine2:string|null;city:string|null;region:string|null;postalCode:string|null}|null;organization:{name:string;timezone:string};
  appointment: { artistId:string;schedulingProvider:string|null;providerBookingId:string|null;calendarEventId:string|null;scheduleRevision:number; notes:string|null; id: string; startsAt: string; endsAt: string; status: string; holdExpiresAt:string|null; priceCents:number|null; depositCents: number | null; depositStatus: string; paymentProvider: string | null; completedAt: string | null; isWalkIn: boolean };
  client: { firstName: string; lastName: string | null; phone: string | null; email: string | null };
  service: { name: string; paymentProvider: string; depositType: string } | null;
  payments: Payment[];
  refundAudit:{paymentId:string;requestedBy:string;requestedAt:string}[];
  externalWaivers: ExternalWaiver[];
  signedWaivers: SignedWaiver[];
  availableWaiverForms: { id: string; name: string; audience: string }[];
  confirmation: { status: string; errorCode: string | null; providerStatus: string | null } | null;
};
const section = { borderTop: '1px solid #e4dfda', padding: '18px 0' };
const action = { border: 0, borderRadius: 6, padding: '10px 14px', background: '#181716', color: '#fff', font: 'inherit', cursor: 'pointer' };
const secondary = { border: '1px solid #d7d1cb', borderRadius: 6, padding: '9px 12px', background: '#fff', color: '#181716', font: 'inherit', cursor: 'pointer' };

function paymentLabel(payment: Payment) { return payment.purpose === 'BALANCE' ? 'Remaining balance' : payment.purpose === 'DEPOSIT' ? 'Deposit' : 'Payment'; }

function money(cents: number | null) { return cents == null ? 'No deposit' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100); }

export default function AppointmentDetailPage() {
  const user = useSession();
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<AppointmentDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [nativePayments,setNativePayments]=useState(false);
  const [waiverDialogOpen, setWaiverDialogOpen] = useState(false);
  const waiverDialog = useRef<HTMLDialogElement>(null);
  const [waiverFormId, setWaiverFormId] = useState('');
  useEffect(() => {
    if (waiverDialogOpen && !waiverDialog.current?.open) waiverDialog.current?.showModal();
  }, [waiverDialogOpen]);
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const clientDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (clientDialogOpen && !clientDialog.current?.open) clientDialog.current?.showModal();
  }, [clientDialogOpen]);
  const [viewingSignedWaiverId, setViewingSignedWaiverId] = useState<string | null>(null);
  const [signedWaiverData, setSignedWaiverData] = useState<Record<string, unknown> | null>(null);
  const signedWaiverDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (viewingSignedWaiverId && !signedWaiverDialog.current?.open) signedWaiverDialog.current?.showModal();
  }, [viewingSignedWaiverId]);
  async function openSignedWaiver(submissionId: string) {
    setBusy(true);
    setError('');
    setSignedWaiverData(null);
    try {
      const response = await fetch(`/api/waivers/${submissionId}/view?appointmentId=${params.id}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to open form.');
      setSignedWaiverData(data.form);
      setViewingSignedWaiverId(submissionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to open form.');
    } finally {
      setBusy(false);
    }
  }
  const [waiverFormLink, setWaiverFormLink] = useState<string | null>(null);
  const [clientEditData, setClientEditData] = useState<{ firstName: string; phone: string; email: string } | null>(null);
  useEffect(()=>{setNativePayments(Boolean((window as unknown as {webkit?:{messageHandlers?:{maiaTapToPay?:unknown}}}).webkit?.messageHandlers?.maiaTapToPay));},[]);
  function openNativePayment(){(window as unknown as {webkit:{messageHandlers:{maiaTapToPay:{postMessage:(body:{appointmentId:string})=>void}}}}).webkit.messageHandlers.maiaTapToPay.postMessage({appointmentId:params.id});}
  const [receiptUrls,setReceiptUrls]=useState<Record<string,string>>({});
  async function receipt(paymentId:string){setBusy(true);setError('');try{const r=await fetch('/api/payments/connect/receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appointmentId:params.id,paymentId}),cache:'no-store'});const body=await r.json();if(!r.ok)throw Error(body.error);setReceiptUrls(prev=>({...prev,[paymentId]:body.receiptUrl}));}catch{setError('Receipt unavailable. Refresh payment status and try again.');}finally{setBusy(false);}}
  const [tipInput,setTipInput]=useState('0');
  const [tipChoice,setTipChoice]=useState<TipChoice>(0);
  const [cardEntry,setCardEntry]=useState(false);
  const [extraMinutes,setExtraMinutes]=useState(15);


  async function refund(payment:Payment){
    if(!window.confirm(`Refund the ${money(payment.amountCents)} test ${paymentLabel(payment).toLowerCase()}? The appointment will stay booked.`))return;
    await runAction('/api/payments/connect/refund','POST',{appointmentId:params.id,paymentId:payment.id});
  }

  async function createWaiverLink(formId?: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/waiver-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_LINK',
          appointmentId: params.id,
          ...(formId ? { externalWaiverFormId: formId } : {}),
        }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Unable to create waiver link.');
      setWaiverFormLink(value.url);
      setWaiverDialogOpen(false);
      await load();
      setNotice('Waiver link created. You can share or copy the link.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create waiver link.');
    } finally {
      setBusy(false);
    }
  }

  async function sendWaiverBySms(formId?: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/waiver-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SEND',
          appointmentId: params.id,
          ...(formId ? { externalWaiverFormId: formId } : {}),
        }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Unable to send waiver.');
      setWaiverDialogOpen(false);
      await load();
      setNotice('Waiver sent via SMS.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to send waiver.');
    } finally {
      setBusy(false);
    }
  }

  async function updateClientDetails() {
    if (!clientEditData) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/appointment-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: params.id,
          firstName: clientEditData.firstName,
          phone: clientEditData.phone || null,
          email: clientEditData.email || null,
        }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Unable to update client details.');
      setClientDialogOpen(false);
      await load();
      setNotice('Client details updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update client details.');
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    const response = await fetch(`/api/appointments/${params.id}`, { cache: 'no-store' });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Unable to load appointment.');
    setData(value);
  }
  useEffect(() => {
    if (!user || !params.id) return;
    void load().catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load appointment.'));
  }, [user, params.id]);

  async function runAction(url: string, method: string, body?: object) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, ...(body ? { body: JSON.stringify(body) } : {}) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || 'Action could not be completed.');
      await load();
      setNotice(value.confirmation ? `Appointment confirmed. ${value.confirmation.status === 'QUEUED' ? 'Confirmation text queued.' : value.confirmation.status === 'SENDING' ? 'Confirmation text is being sent.' : value.confirmation.status === 'SUBMITTED' ? 'Confirmation text was submitted to the provider; delivery is not confirmed.' : `Confirmation text could not be queued: ${value.confirmation.reason}`}` : value.duplicate ? 'This action was already recorded.' : url.endsWith('/refund') ? 'Refund requested. Check payment history for its status.' : 'Appointment updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Action could not be completed.');
      await load().catch(() => undefined);
    } finally { setBusy(false); }
  }

  if (!user) return null;
  if (error && !data) return <main style={{ maxWidth: 760, margin: '0 auto', padding: 32 }}><a href="/">← Dashboard</a><p role="alert">{error}</p></main>;
  if (!data) return <main style={{ maxWidth: 760, margin: '0 auto', padding: 32 }}>Loading appointment…</main>;
  const appointment = data.appointment;
  const clientName = `${data.client.firstName}${data.client.lastName ? ` ${data.client.lastName}` : ''}`;
  const summary=paymentSummary(appointment.priceCents,data.payments);
  const {tipCents,valid:validTip,totalCents:checkoutTotal}=checkoutTip(summary.remainingCents??0,tipChoice,tipInput);
  const paid = appointment.depositStatus === 'PAID';
  const paymentProvider = appointment.paymentProvider || data.service?.paymentProvider;
  const canConfirmVenmo = paymentProvider === 'VENMO_MANUAL' && appointment.status === 'PAYMENT_PENDING' && !paid;
  const canComplete = appointment.status === 'CONFIRMED';
  return <main style={{ maxWidth: 760, margin: '0 auto', padding: '36px 20px 80px', color: '#181716' }}>
    <a href="/">← Dashboard</a>
    <header style={{ margin: '20px 0',fontWeight:600 }}><p style={{ marginBottom: 4, color: '#706b66' }}>Appointment</p><h1 style={{ margin: 0 }}>{clientName}</h1><p>{data.service?.name || 'Appointment'} · {new Date(appointment.startsAt).toLocaleString()} – {new Date(appointment.endsAt).toLocaleTimeString()}</p></header>
    {error && <p role="alert" style={{ color: '#8b1e1e' }}>{error}</p>}{notice && <p role="status">{notice}</p>}
    {data.confirmation && <p role="status">{data.confirmation.providerStatus === 'delivered' ? 'Confirmation text delivered.' : ['failed','undelivered'].includes(data.confirmation.providerStatus || '') ? 'Confirmation text delivery failed. Check the Inbox for details.' : data.confirmation.status === 'COMPLETED' ? 'Confirmation text submitted to the provider; delivery is not confirmed.' : data.confirmation.status === 'SENDING' ? 'Confirmation text is being sent.' : ['PENDING','RETRY','PROCESSING'].includes(data.confirmation.status) ? 'Confirmation text queued.' : data.confirmation.status === 'DELIVERY_UNKNOWN' ? 'Confirmation text delivery is unknown. Check the Inbox before sending another.' : data.confirmation.errorCode === 'CLIENT_SMS_OPTED_OUT' ? 'Confirmation text was not sent because the client opted out.' : data.confirmation.errorCode === 'CLIENT_PHONE_MISSING' ? 'Confirmation text was not sent because the client has no phone number.' : data.confirmation.errorCode === 'SMS_CONSENT_MISSING' ? 'Confirmation text was not sent because the client has no current consent for this artist.' : data.confirmation.errorCode === 'ARTIST_SMS_UNAVAILABLE' ? 'Confirmation text was not sent because the artist’s SMS setup is unavailable.' : 'Confirmation text was not sent. Check SMS setup and the Inbox.'}</p>}
    {nativePayments&&user.role==='OWNER'&&paymentProvider==='STRIPE'&&['CONFIRMED','COMPLETED'].includes(appointment.status)&&summary.remainingCents!=null&&summary.remainingCents>0&&!data.payments.some(p=>p.status.startsWith('REFUND'))&&<section style={section}><button style={action} onClick={openNativePayment}>Test card tap on iPhone</button><p>Opens the native payment review. Simulation only.</p></section>}
    {user.role==='OWNER'&&paymentProvider==='STRIPE'&&['CONFIRMED','COMPLETED'].includes(appointment.status)&&summary.remainingCents!=null&&summary.remainingCents>0&&!data.payments.some(p=>p.status.startsWith('REFUND'))&&<section style={section}><CheckoutTipReview balanceCents={summary.remainingCents} choice={tipChoice} custom={tipInput} disabled={cardEntry} onChoice={setTipChoice} onCustom={setTipInput}/><button style={secondary} disabled={busy||cardEntry||!validTip} onClick={()=>setCardEntry(true)}>{cardEntry?'Card form open':validTip&&checkoutTotal!=null?`Continue to card entry · ${money(checkoutTotal)}`:'Continue to card entry'}</button><p>Secure sandbox card form. No real cards or charges.</p>{cardEntry&&<StudioCardEntry appointmentId={params.id} tipCents={tipCents} onClose={()=>{setCardEntry(false);void load().catch(()=>setError('Unable to refresh payment status.'));}}/>}</section>}
    {appointment.notes&&<section style={section}><h2>Appointment notes</h2><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{appointment.notes}</p></section>}
    <section style={section}><h2>Amount due</h2><strong style={{fontSize:30}}>{summary.remainingCents==null?'Price not set':money(summary.remainingCents)}</strong>{summary.needsReview&&<p role="status">Payment needs review before collecting more money.</p>}</section>
    <section style={section}><h2>Business location</h2><strong>{data.location?.name||data.organization.name}</strong>{data.location&&(data.location.addressLine1||data.location.addressLine2||data.location.city||data.location.region||data.location.postalCode)?<p style={{margin:'4px 0 0'}}>{[data.location.addressLine1,data.location.addressLine2].filter(Boolean).join(', ')}{(data.location.addressLine1||data.location.addressLine2)&&(data.location.city||data.location.region||data.location.postalCode)?' · ':''}{[data.location.city,(data.location.region||'')+' '+(data.location.postalCode||'')].filter(Boolean).join(' ')}</p>:<p style={{margin:'4px 0 0',color:'#706b66'}}>No studio address configured.{user.role==='OWNER'&&<><br/><a href="/settings/studio" style={{color:'inherit',textDecoration:'underline'}}>Add address in Studio locations</a></>}</p>}</section>
    {['CONFIRMED','PAYMENT_PENDING'].includes(appointment.status)&&appointment.schedulingProvider==='INTERNAL'&&!appointment.providerBookingId&&!appointment.calendarEventId&&<section style={section}><h2>Block extra time</h2><p>Extend the end of this appointment without changing the price or deposit.</p><label style={{display:'grid',gap:8,fontWeight:600}}>Additional time<select style={{fontSize:16,padding:12,maxWidth:'100%'}} value={extraMinutes} onChange={event=>setExtraMinutes(Number(event.target.value))}>{[15,30,45,60,90,120,180,240].map(minutes=><option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label><button type="button" style={{...secondary,marginTop:12}} disabled={busy} onClick={()=>{const zone=data.organization.timezone;const minute=calendarMinute(appointment.startsAt,zone);void runAction('/api/calendar','PATCH',{artistId:appointment.artistId,appointmentId:appointment.id,expectedRevision:appointment.scheduleRevision,extraMinutes,localStart:localDateString(new Date(appointment.startsAt),zone)+'T'+String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0')});}}>Save extra time</button></section>}

    <section style={section}>
      <h2>Deposit</h2>
      <p><strong>{appointment.depositStatus.startsWith('REFUND') ? appointment.depositStatus.replaceAll('_',' ') : paid ? 'Paid' : appointment.depositCents ? 'Pending' : 'Not required'}</strong> · {money(appointment.depositCents)}{paymentProvider ? ` · ${paymentProvider === 'VENMO_MANUAL' ? 'Venmo (manual confirmation)' : paymentProvider}` : ''}</p>

      {canConfirmVenmo && <button type="button" disabled={busy} onClick={() => void runAction(`/api/appointments/${appointment.id}/deposit`, 'POST', {})} style={action}>{busy ? 'Recording…' : 'Mark Deposit Received'}</button>}
      {paid && data.payments.filter(payment => payment.status === 'PAID').map(payment => <p key={payment.id} style={{ color: '#706b66' }}>Confirmed {payment.confirmationMethod === 'MANUAL' ? 'manually' : 'by provider'}{payment.confirmedAt ? ` · ${new Date(payment.confirmedAt).toLocaleString()}` : ''}</p>)}
    </section>
    <section style={section}>
      <h2>Appointment status</h2>
      {appointment.status==='PAYMENT_PENDING'&&appointment.holdExpiresAt&&new Date(appointment.holdExpiresAt)>new Date()&&<p>Temporarily held until {new Date(appointment.holdExpiresAt).toLocaleString()}. Awaiting verified payment.</p>}
      <p><strong>{appointment.status}</strong>{appointment.completedAt ? ` · Completed ${new Date(appointment.completedAt).toLocaleString()}` : ''}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {canComplete && <button type="button" disabled={busy} onClick={() => void runAction(`/api/appointments/${appointment.id}`, 'PATCH', { action: 'MARK_COMPLETE' })} style={action}>Mark Appointment Complete</button>}
        {!['CANCELLED', 'COMPLETED'].includes(appointment.status) && <button type="button" disabled={busy} onClick={() => void runAction(`/api/appointments/${appointment.id}?organizationId=${user.organization_id}`, 'DELETE')} style={secondary}>Cancel appointment</button>}
      </div>
    </section>
    <section style={section}>
      <h2>Waiver</h2>
      {data.signedWaivers.length > 0 ? data.signedWaivers.map(waiver => {
        const isValidDate = waiver.signedAt && !isNaN(new Date(waiver.signedAt).getTime());
        return <div key={waiver.id} style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between'}}>
          <p style={{margin:0}}>{waiver.templateName}{isValidDate ? ` · Signed ${new Date(waiver.signedAt).toLocaleString()}` : ' · Signed'}</p>
          <button type="button" style={{...secondary,whiteSpace:'nowrap'}} disabled={busy} onClick={()=>void openSignedWaiver(waiver.submissionId)}>View signed form</button>
        </div>;
      })
        : data.externalWaivers.length > 0 ? data.externalWaivers.map(waiver => <p key={waiver.id}>{waiver.formName} · {waiver.status}{waiver.completedAt ? ` · Completed ${new Date(waiver.completedAt).toLocaleString()}` : waiver.sentAt ? ` · Sent ${new Date(waiver.sentAt).toLocaleString()}` : ''}</p>)
          : <p>No waiver has been issued for this appointment.</p>}
      {!data.signedWaivers.length && <button type="button" style={secondary} disabled={busy} onClick={() => { setError(''); setWaiverFormId(''); setWaiverDialogOpen(true); }}>Send consent form</button>}
      {waiverFormLink && <div style={{ marginTop: 12, padding: 12, backgroundColor: '#f5f1f0', borderRadius: 6 }}>
        <p style={{ margin: '0 0 8px 0', fontSize: 14 }}>Waiver link created</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={secondary} onClick={() => { navigator.clipboard.writeText(waiverFormLink); setNotice('Link copied to clipboard'); }}>Copy link</button>
          <a href={waiverFormLink} target="_blank" rel="noopener noreferrer" style={secondary as React.CSSProperties}>Open for signing</a>
        </div>
      </div>}
    </section>
    <section style={section}>
      <h2>Client</h2>
      <p><strong>{clientName}</strong></p>
      <p>{data.client.phone || 'No phone number'}{data.client.email ? ` · ${data.client.email}` : ''}</p>
      {appointment.isWalkIn && <button type="button" style={secondary} disabled={busy} onClick={() => { setClientEditData({ firstName: data.client.firstName === 'Walk-in' ? '' : data.client.firstName, phone: data.client.phone || '', email: data.client.email || '' }); setClientDialogOpen(true); }}>Add client details</button>}
      {!appointment.isWalkIn && <button type="button" style={secondary} disabled={busy} onClick={() => { setClientEditData({ firstName: data.client.firstName, phone: data.client.phone || '', email: data.client.email || '' }); setClientDialogOpen(true); }}>Edit client details</button>}
    </section>
    {waiverDialogOpen && <dialog className="native-dialog appointment-waiver-dialog" ref={waiverDialog} aria-labelledby="appointment-waiver-title"
      onCancel={event => { event.preventDefault(); if (!busy) setWaiverDialogOpen(false); }}>
      <form onSubmit={event => event.preventDefault()}>
        <header>
          <h2 id="appointment-waiver-title">Send consent form</h2>
          <button type="button" aria-label="Close" disabled={busy} onClick={() => setWaiverDialogOpen(false)}>×</button>
        </header>
        <label>
          Consent form
          <select value={waiverFormId} disabled={busy} onChange={event => { setWaiverFormId(event.target.value); setError(''); }}>
            <option value="">Auto-select</option>
            {data.availableWaiverForms.map(form => <option key={form.id} value={form.id}>{form.name} · {form.audience === 'ANY' ? 'All ages' : form.audience === 'MINOR' ? 'Minor' : 'Adult'}</option>)}
          </select>
        </label>
        {!data.availableWaiverForms.length && <p>No active consent forms are available for this artist.</p>}
        {error && <div className="native-error" role="alert">{error}</div>}
        <footer>
          <button type="button" disabled={busy} onClick={() => setWaiverDialogOpen(false)}>Cancel</button>
          <div className="native-actions">
            <button type="button" disabled={busy || !data.availableWaiverForms.length} onClick={() => void createWaiverLink(waiverFormId)}>Create shareable link</button>
            {data.client.phone && <button type="button" className="native-primary" disabled={busy || !data.availableWaiverForms.length} onClick={() => void sendWaiverBySms(waiverFormId)}>Send via SMS</button>}
          </div>
        </footer>
      </form>
    </dialog>}
    {clientDialogOpen && clientEditData && <dialog className="native-dialog appointment-client-dialog" ref={clientDialog} aria-labelledby="appointment-client-title"
      onCancel={event => { event.preventDefault(); if (!busy) setClientDialogOpen(false); }}>
      <form onSubmit={event => event.preventDefault()}>
        <header>
          <h2 id="appointment-client-title">{appointment.isWalkIn ? 'Add client details' : 'Edit client details'}</h2>
          <button type="button" aria-label="Close" disabled={busy} onClick={() => setClientDialogOpen(false)}>×</button>
        </header>
        <label>
          Name
          <input type="text" value={clientEditData.firstName} onChange={(e) => setClientEditData({ ...clientEditData, firstName: e.target.value })} disabled={busy} />
        </label>
        <label>
          Phone
          <input type="tel" value={clientEditData.phone} onChange={(e) => setClientEditData({ ...clientEditData, phone: e.target.value })} disabled={busy} />
        </label>
        <label>
          Email
          <input type="email" value={clientEditData.email} onChange={(e) => setClientEditData({ ...clientEditData, email: e.target.value })} disabled={busy} />
        </label>
        {error && <div className="native-error" role="alert">{error}</div>}
        <footer>
          <button type="button" disabled={busy} onClick={() => setClientDialogOpen(false)}>Cancel</button>
          <button type="button" className="native-primary" disabled={busy} onClick={() => void updateClientDetails()}>Save</button>
        </footer>
      </form>
    </dialog>}
    {viewingSignedWaiverId && signedWaiverData && <dialog className="native-dialog signed-record" ref={signedWaiverDialog} aria-labelledby="signed-waiver-title"
      onCancel={event => { event.preventDefault(); if (!busy) setViewingSignedWaiverId(null); }}>
      <div style={{maxHeight:'80vh',overflow:'auto'}}>
        <div style={{display:'flex',gap:8,marginBottom:16,position:'sticky',top:0,backgroundColor:'white',padding:'12px 0',borderBottom:'1px solid #e4dfda'}}>
          <button type="button" disabled={busy} onClick={() => setViewingSignedWaiverId(null)}>Close form</button>
          <button type="button" disabled={busy} onClick={() => window.print()}>Print / Save PDF</button>
        </div>
        {typeof signedWaiverData?.formName === 'string' && <h2>{signedWaiverData.formName}</h2>}
        {typeof signedWaiverData?.signedName === 'string' && typeof signedWaiverData?.signedAt === 'string' && <p>Signed by {signedWaiverData.signedName} · {new Date(signedWaiverData.signedAt).toLocaleString()}</p>}
        {typeof signedWaiverData?.body === 'string' && <p style={{whiteSpace:'pre-wrap',lineHeight:1.7}}>{signedWaiverData.body}</p>}
        {Array.isArray(signedWaiverData?.fields) && signedWaiverData.fields.map((field:Record<string,unknown>) => {
          const answer = typeof signedWaiverData?.answers === 'object' && signedWaiverData.answers ? (signedWaiverData.answers as Record<string, unknown>)[field.id as string] : undefined;
          const fieldLabel = typeof field.label === 'string' ? field.label : '';
          const fieldType = typeof field.type === 'string' ? field.type : '';
          const answerText = fieldType === 'PHOTO_ID' ? 'Photo ID stored privately.' : typeof answer === 'boolean' ? (answer ? 'Yes / acknowledged' : 'No') : Array.isArray(answer) ? (answer as string[]).join(', ') : typeof answer === 'string' ? answer : 'Not answered';
          return <div key={String(field.id)} style={{marginBottom:12}}>
            {fieldType === 'DIVIDER' ? <hr /> : <>
              <strong>{fieldLabel}</strong>
              {!['HEADING','PARAGRAPH'].includes(fieldType) && <p>{answerText}</p>}
            </>}
          </div>;
        })}
        {typeof signedWaiverData?.drawnSignature === 'object' && signedWaiverData.drawnSignature && 'strokes' in signedWaiverData.drawnSignature && <div>
          <h3>Client signature</h3>
          <svg role="img" aria-label="Signed client signature" viewBox="0 0 600 200" style={{width:'100%',maxWidth:600,border:'1px solid #ddd'}}>
            {((signedWaiverData.drawnSignature as Record<string, unknown>).strokes as Array<Array<{x:number;y:number}>>).map((stroke:Array<{x:number;y:number}>, i:number) => (
              <polyline key={i} points={stroke.map(p => `${p.x*600},${p.y*200}`).join(' ')} fill="none" stroke="#111" strokeWidth="2.5" />
            ))}
          </svg>
        </div>}
      </div>
    </dialog>}
    {data.payments.length > 0 && <section style={section}><h2>Payment history</h2>{data.payments.map(payment => <p key={payment.id}><strong>{paymentLabel(payment)} · {money(payment.amountCents)}</strong>{payment.tipCents>0&&<> (includes {money(payment.tipCents)} tip)</>} · {payment.status.replaceAll('_',' ')}{payment.refundedCents>0&&<> · Returned {money(payment.refundedCents)}</>} · {payment.provider === 'stripe_terminal' ? 'Phone test payment' : payment.provider === 'stripe_connect' ? 'Stripe test payment' : payment.provider}{user.role==='OWNER'&&['stripe_connect','stripe_terminal'].includes(payment.provider)&&['PAID','REFUND_PENDING'].includes(payment.status)&&<button style={{...secondary,marginLeft:12}} disabled={busy} onClick={()=>void refund(payment)}>{payment.status==='REFUND_PENDING'?`Retry ${money(payment.amountCents)} refund`:`Refund ${money(payment.amountCents)} ${paymentLabel(payment).toLowerCase()}`}</button>}{user.role==='OWNER'&&['stripe_connect','stripe_terminal'].includes(payment.provider)&&['PAID','REFUNDED','REFUND_PENDING','REFUND_REVIEW'].includes(payment.status)&&(receiptUrls[payment.id]?<a href={receiptUrls[payment.id]} target="_blank" rel="noopener noreferrer" style={{marginLeft:12}}>Open Stripe test receipt</a>:<button style={{...secondary,marginLeft:12}} disabled={busy} onClick={()=>void receipt(payment.id)}>Get test receipt</button>)}{data.refundAudit.filter(a=>a.paymentId===payment.id).map(a=><small key={a.paymentId} style={{display:'block'}}>Refund requested by {a.requestedBy} · {new Date(a.requestedAt).toLocaleString()}</small>)}</p>)}</section>}
  </main>;
}
