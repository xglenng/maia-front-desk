import { protectedRoute, identity } from '@/packages/auth/server';
import { canAccessArtist } from '@/packages/inbox/state';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, artists, clients } from '@db/schema';
import { z } from 'zod';

const schema = z.object({
  appointmentId: z.string().uuid(),
  firstName: z.string().min(1, 'First name is required'),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { appointmentId, firstName, phone, email } = parsed.data;

  // Get appointment and verify access
  const [appointment] = await db.select().from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.organizationId, user.organization_id)));
  if (!appointment) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });

  // Verify artist access
  const [artist] = await db.select().from(artists)
    .where(and(eq(artists.id, appointment.artistId), eq(artists.organizationId, user.organization_id)));
  if (!artist || !canAccessArtist(user.role, user.id, artist.userId)) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }

  // Get current client
  const [currentClient] = await db.select().from(clients)
    .where(and(eq(clients.id, appointment.clientId), eq(clients.organizationId, user.organization_id)));
  if (!currentClient) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  // Update client details
  const [updated] = await db.update(clients)
    .set({
      firstName,
      phone: phone || null,
      email: email || null,
      updatedAt: new Date(),
    })
    .where(and(eq(clients.id, currentClient.id), eq(clients.organizationId, user.organization_id)))
    .returning();

  return NextResponse.json({ client: updated });
}
