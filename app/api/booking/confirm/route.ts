import { identity, protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, artists } from '@db/schema';
import { z } from 'zod';
import { canManageAppointment, noDepositConfirmationStatus } from '@booking/confirmation-policy';
import { scheduleConfirmedAppointmentAutomations } from '@/packages/automations/lifecycle.server';

const schema = z.object({
  organizationId: z.string().uuid(),
  appointmentId: z.string().uuid(),
}).strict();

async function handlePOST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { organizationId, appointmentId } = parsed.data;
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const [row] = await db.select({ appointment: appointments, artistUserId: artists.userId }).from(appointments)
    .innerJoin(artists, and(eq(appointments.artistId, artists.id), eq(artists.organizationId, appointments.organizationId)))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.organizationId, organizationId)));
  if (!row || !canManageAppointment(user.role, user.id, row.artistUserId)) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  const appointment = row.appointment;
  if (appointment.status === 'CONFIRMED' && noDepositConfirmationStatus(appointment.depositCents) && appointment.depositStatus === 'WAIVED') {
    await scheduleConfirmedAppointmentAutomations(appointment.id);
    return NextResponse.json({ appointment, duplicate: true });
  }
  if (appointment.status !== 'TENTATIVE') return NextResponse.json({ error: 'Only tentative appointments can be confirmed' }, { status: 409 });
  if (appointment.holdExpiresAt && appointment.holdExpiresAt < new Date()) return NextResponse.json({ error: 'Booking hold has expired' }, { status: 409 });
  const depositStatus = noDepositConfirmationStatus(appointment.depositCents);
  if (!depositStatus) return NextResponse.json({ error: 'A deposit-required appointment can only be confirmed by a trusted payment confirmation.' }, { status: 409 });

  const [updated] = await db.update(appointments).set({ status: 'CONFIRMED', depositStatus, holdExpiresAt: null, updatedAt: new Date() }).where(and(
    eq(appointments.id, appointmentId), eq(appointments.organizationId, organizationId), eq(appointments.status, 'TENTATIVE'),
  )).returning();
  if (!updated) return NextResponse.json({ error: 'Appointment state changed before it could be confirmed.' }, { status: 409 });
  await scheduleConfirmedAppointmentAutomations(updated.id);
  return NextResponse.json({ appointment: updated });
}

export const POST = protectedRoute(handlePOST, false);
