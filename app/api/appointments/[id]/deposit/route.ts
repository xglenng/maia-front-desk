import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { identity, protectedRoute } from '@/packages/auth/server';
import { db } from '@db/index';
import { appointments, artists, services } from '@db/schema';
import { canManageAppointment } from '@booking/confirmation-policy';
import { confirmAppointmentDeposit } from '@booking/deposit-confirmation.server';
import { NextRequest, NextResponse } from 'next/server';

type Context = { params: Promise<{ id: string }> };
const schema = z.object({ organizationId: z.string().uuid() }).strict();

async function handlePOST(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const [row] = await db.select({ appointment: appointments, artistUserId: artists.userId, service: services })
    .from(appointments)
    .innerJoin(artists, and(eq(appointments.artistId, artists.id), eq(artists.organizationId, appointments.organizationId)))
    .leftJoin(services, and(eq(appointments.serviceId, services.id), eq(services.organizationId, appointments.organizationId)))
    .where(and(eq(appointments.id, id), eq(appointments.organizationId, parsed.data.organizationId))).limit(1);
  if (!row || !canManageAppointment(user.role, user.id, row.artistUserId)) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  if ((row.appointment.paymentProvider || row.service?.paymentProvider) !== 'VENMO_MANUAL') return NextResponse.json({ error: 'This appointment is not configured for manual Venmo payment.' }, { status: 409 });
  const result = await confirmAppointmentDeposit({ organizationId: parsed.data.organizationId, appointmentId: id, confirmingUserId: user.id, confirmationMethod: 'MANUAL' });
  if (result.status === 'CONFIRMED') return NextResponse.json({ appointment: result.appointment, duplicate: result.duplicate ?? false });
  if (result.status === 'SLOT_UNAVAILABLE') return NextResponse.json({ error: 'Payment was recorded, but the appointment slot is no longer available. Resolve the booking before confirming the appointment.', appointment: result.appointment }, { status: 409 });
  const status = result.status === 'NOT_FOUND' ? 404 : 409;
  return NextResponse.json({ error: result.status === 'EXPIRED' ? 'The appointment hold has expired.' : 'The deposit could not be confirmed in its current state.' }, { status });
}

export const POST = protectedRoute(handlePOST, false);
