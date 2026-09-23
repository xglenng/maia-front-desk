import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments } from '@db/schema';
import { z } from 'zod';

const schema = z.object({
  organizationId: z.string().uuid(),
  appointmentId: z.string().uuid(),
  depositStatus: z.enum(['PAID', 'WAIVED', 'PENDING']).default('PAID'),
});

async function handlePOST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { organizationId, appointmentId, depositStatus } = parsed.data;

  const [appointment] = await db.select().from(appointments).where(and(eq(appointments.id, appointmentId), eq(appointments.organizationId, organizationId)));
  if (!appointment) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  if (appointment.status !== 'TENTATIVE') return NextResponse.json({ error: 'Only tentative appointments can be confirmed' }, { status: 409 });
  if (appointment.holdExpiresAt && appointment.holdExpiresAt < new Date()) return NextResponse.json({ error: 'Booking hold has expired' }, { status: 409 });
  if (appointment.depositCents && depositStatus === 'PENDING') return NextResponse.json({ error: 'Deposit must be paid or waived before confirmation' }, { status: 409 });

  const [updated] = await db.update(appointments).set({ status: 'CONFIRMED', depositStatus, holdExpiresAt: null, updatedAt: new Date() }).where(eq(appointments.id, appointmentId)).returning();
  return NextResponse.json({ appointment: updated });
}

export const POST = protectedRoute(handlePOST, false);
