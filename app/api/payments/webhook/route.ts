import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, payments } from '@db/schema';
import { getStripe } from '@integrations/index';

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
      await db.transaction(async tx => {
        await tx.update(payments).set({ status: 'PAID', providerPaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null, updatedAt: new Date() }).where(and(eq(payments.organizationId, organizationId), eq(payments.appointmentId, appointmentId), eq(payments.providerCheckoutSessionId, session.id)));
        await tx.update(appointments).set({ status: 'CONFIRMED', depositStatus: 'PAID', holdExpiresAt: null, updatedAt: new Date() }).where(and(eq(appointments.organizationId, organizationId), eq(appointments.id, appointmentId), eq(appointments.status, 'TENTATIVE')));
      });
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
