import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, clients, payments } from '@db/schema';
import { createDepositCheckout } from '@integrations/index';
import { z } from 'zod';

const inputSchema = z.object({ organizationId: z.string().uuid(), appointmentId: z.string().uuid() });

async function handlePOST(request: NextRequest) {
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { organizationId, appointmentId } = parsed.data;
  const [row] = await db.select({ appointment: appointments, client: clients }).from(appointments).innerJoin(clients, eq(appointments.clientId, clients.id)).where(and(eq(appointments.id, appointmentId), eq(appointments.organizationId, organizationId)));
  if (!row) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  const appointment = row.appointment;
  if (appointment.status !== 'TENTATIVE') return NextResponse.json({ error: 'Only tentative appointments can accept a deposit' }, { status: 409 });
  if (!appointment.depositCents || appointment.depositCents <= 0) return NextResponse.json({ error: 'Appointment has no deposit amount' }, { status: 400 });
  if (appointment.holdExpiresAt && appointment.holdExpiresAt < new Date()) return NextResponse.json({ error: 'Booking hold has expired' }, { status: 409 });

  const session = await createDepositCheckout({
    appointmentId, organizationId, amountCents: appointment.depositCents, customerEmail: row.client.email,
    successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/?payment=success&appointment=${appointmentId}`,
    cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/?payment=cancelled&appointment=${appointmentId}`,
  });
  await db.insert(payments).values({ organizationId, appointmentId, provider: 'stripe', providerCheckoutSessionId: session.id, amountCents: appointment.depositCents, status: 'PENDING' });
  return NextResponse.json({ checkoutUrl: session.url, sessionId: session.id });
}

export const POST = protectedRoute(handlePOST, false);
