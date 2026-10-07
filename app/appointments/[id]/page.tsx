'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from '@/components/session-gate';

type Payment = { id: string; provider: string; amountCents: number; status: string; confirmationMethod: string | null; confirmedAt: string | null };
type ExternalWaiver = { id: string; status: string; sentAt: string | null; completedAt: string | null; formName: string };
type SignedWaiver = { id: string; signedAt: string; templateName: string };
type AppointmentDetail = {
  appointment: { id: string; startsAt: string; endsAt: string; status: string; depositCents: number | null; depositStatus: string; paymentProvider: string | null; completedAt: string | null };
  client: { firstName: string; lastName: string | null; phone: string | null; email: string | null };
  service: { name: string; paymentProvider: string; depositType: string } | null;
  payments: Payment[];
  externalWaivers: ExternalWaiver[];
  signedWaivers: SignedWaiver[];
};
const section = { borderTop: '1px solid #e4dfda', padding: '18px 0' };
const action = { border: 0, borderRadius: 6, padding: '10px 14px', background: '#181716', color: '#fff', font: 'inherit', cursor: 'pointer' };
const secondary = { border: '1px solid #d7d1cb', borderRadius: 6, padding: '9px 12px', background: '#fff', color: '#181716', font: 'inherit', cursor: 'pointer' };

function money(cents: number | null) { return cents == null ? 'No deposit' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100); }

export default function AppointmentDetailPage() {
  const user = useSession();
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<AppointmentDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

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
      setNotice(value.duplicate ? 'This action was already recorded.' : 'Appointment updated.');
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
  const paid = appointment.depositStatus === 'PAID';
  const paymentProvider = appointment.paymentProvider || data.service?.paymentProvider;
  const canConfirmVenmo = paymentProvider === 'VENMO_MANUAL' && appointment.status === 'PAYMENT_PENDING' && !paid;
  const canComplete = appointment.status === 'CONFIRMED';
  return <main style={{ maxWidth: 760, margin: '0 auto', padding: '36px 20px 80px', color: '#181716' }}>
    <a href="/">← Dashboard</a>
    <header style={{ margin: '20px 0' }}><p style={{ marginBottom: 4, color: '#706b66' }}>Appointment</p><h1 style={{ margin: 0 }}>{clientName}</h1><p>{data.service?.name || 'Appointment'} · {new Date(appointment.startsAt).toLocaleString()} – {new Date(appointment.endsAt).toLocaleTimeString()}</p></header>
    {error && <p role="alert" style={{ color: '#8b1e1e' }}>{error}</p>}{notice && <p role="status">{notice}</p>}
    <section style={section}>
      <h2>Deposit</h2>
      <p><strong>{paid ? 'Paid' : appointment.depositCents ? 'Pending' : 'Not required'}</strong> · {money(appointment.depositCents)}{paymentProvider ? ` · ${paymentProvider === 'VENMO_MANUAL' ? 'Venmo (manual confirmation)' : paymentProvider}` : ''}</p>
      {canConfirmVenmo && <button type="button" disabled={busy} onClick={() => void runAction(`/api/appointments/${appointment.id}/deposit`, 'POST', {})} style={action}>{busy ? 'Recording…' : 'Mark Deposit Received'}</button>}
      {paid && data.payments.filter(payment => payment.status === 'PAID').map(payment => <p key={payment.id} style={{ color: '#706b66' }}>Confirmed {payment.confirmationMethod === 'MANUAL' ? 'manually' : 'by provider'}{payment.confirmedAt ? ` · ${new Date(payment.confirmedAt).toLocaleString()}` : ''}</p>)}
    </section>
    <section style={section}>
      <h2>Appointment status</h2>
      <p><strong>{appointment.status}</strong>{appointment.completedAt ? ` · Completed ${new Date(appointment.completedAt).toLocaleString()}` : ''}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {canComplete && <button type="button" disabled={busy} onClick={() => void runAction(`/api/appointments/${appointment.id}`, 'PATCH', { action: 'MARK_COMPLETE' })} style={action}>Mark Appointment Complete</button>}
        {!['CANCELLED', 'COMPLETED'].includes(appointment.status) && <button type="button" disabled={busy} onClick={() => void runAction(`/api/appointments/${appointment.id}?organizationId=${user.organization_id}`, 'DELETE')} style={secondary}>Cancel appointment</button>}
      </div>
    </section>
    <section style={section}>
      <h2>Waiver</h2>
      {data.signedWaivers.length > 0 ? data.signedWaivers.map(waiver => <p key={waiver.id}>{waiver.templateName} · Signed {new Date(waiver.signedAt).toLocaleString()}</p>)
        : data.externalWaivers.length > 0 ? data.externalWaivers.map(waiver => <p key={waiver.id}>{waiver.formName} · {waiver.status}{waiver.completedAt ? ` · Completed ${new Date(waiver.completedAt).toLocaleString()}` : waiver.sentAt ? ` · Sent ${new Date(waiver.sentAt).toLocaleString()}` : ''}</p>)
          : <p>No waiver has been issued for this appointment.</p>}
    </section>
    <section style={section}><h2>Client</h2><p>{data.client.phone || 'No phone number'}{data.client.email ? ` · ${data.client.email}` : ''}</p></section>
    {data.payments.length > 0 && <section style={section}><h2>Payment history</h2>{data.payments.map(payment => <p key={payment.id}>{payment.provider} · {money(payment.amountCents)} · {payment.status}</p>)}</section>}
  </main>;
}
