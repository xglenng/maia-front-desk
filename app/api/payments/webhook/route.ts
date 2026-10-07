import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, payments } from '@db/schema';
import { getStripe } from '@integrations/index';
import { confirmAppointmentDeposit } from '@booking/deposit-confirmation.server';
import { scheduleConfirmedAppointmentAutomations } from '@/packages/automations/lifecycle.server';

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Stripe webhook secret is not configured' }, { status: 503 });
  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  const body = await request.text();
  let event;
  try { event = getStripe().webhooks.constructEvent(body, signature, secret); }
  catch { return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 }); }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const appointmentId = session.metadata?.appointmentId;
    const organizationId = session.metadata?.organizationId;
    if (appointmentId && organizationId) {
      const [localPayment] = await db.select().from(payments).where(and(eq(payments.organizationId, organizationId), eq(payments.appointmentId, appointmentId), eq(payments.providerCheckoutSessionId, session.id))).limit(1);
      const [appointment] = await db.select().from(appointments).where(and(eq(appointments.organizationId, organizationId), eq(appointments.id, appointmentId))).limit(1);
      if (localPayment && appointment?.status === 'PAYMENT_PENDING') {
        await confirmAppointmentDeposit({ organizationId, appointmentId, paymentId: localPayment.id, providerPaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null, confirmationMethod: 'STRIPE_WEBHOOK' });
      } else if (localPayment && appointment?.status === 'TENTATIVE') {
        const now = new Date();
        const [confirmed] = await db.transaction(async tx => {
          await tx.update(payments).set({ status: 'PAID', confirmationMethod: 'STRIPE_WEBHOOK', confirmedAt: now, providerPaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null, updatedAt: now }).where(and(eq(payments.id, localPayment.id), eq(payments.organizationId, organizationId)));
          return tx.update(appointments).set({ status: 'CONFIRMED', depositStatus: 'PAID', holdExpiresAt: null, updatedAt: now }).where(and(eq(appointments.organizationId, organizationId), eq(appointments.id, appointmentId), eq(appointments.status, 'TENTATIVE'))).returning();
        });
        if (confirmed) await scheduleConfirmedAppointmentAutomations(confirmed.id);
      }
    }
  }
  if (event.type === 'checkout.session.expired') {
    const session = event.data.object;
    await db.update(payments).set({ status: 'EXPIRED', updatedAt: new Date() }).where(eq(payments.providerCheckoutSessionId, session.id));
  }
  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object;
    await db.update(payments).set({ status: 'FAILED', updatedAt: new Date() }).where(eq(payments.providerPaymentIntentId, intent.id));
  }
  return NextResponse.json({ received: true });
}
