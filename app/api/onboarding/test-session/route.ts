import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@db/index';
import { artists, clients, conversations, organizations } from '@db/schema';
import { ONBOARDING_PREVIEW_CLIENT_NOTE } from '@/packages/onboarding/readiness';

const schema = z.object({
  organizationId: z.string().uuid(),
  artistId: z.string().uuid(),
  newConversation: z.boolean().optional(),
}).strict();

async function handlePOST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { organizationId, artistId, newConversation } = parsed.data;
  const [[organization], [artist]] = await Promise.all([
    db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId)).limit(1),
    db.select({ id: artists.id, displayName: artists.displayName }).from(artists).where(and(eq(artists.id, artistId), eq(artists.organizationId, organizationId))).limit(1),
  ]);
  if (!organization || !artist) return NextResponse.json({ error: 'Studio or artist not found.' }, { status: 404 });

  let [client] = await db.select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName }).from(clients)
    .where(and(eq(clients.organizationId, organizationId), eq(clients.notes, ONBOARDING_PREVIEW_CLIENT_NOTE))).limit(1);
  if (!client) {
    [client] = await db.insert(clients).values({
      organizationId,
      firstName: 'Maia',
      lastName: 'Setup Preview',
      notes: ONBOARDING_PREVIEW_CLIENT_NOTE,
      phone: null,
      email: null,
      smsOptIn: false,
      smsConsentStatus: 'NOT_REQUESTED',
      marketingOptIn: false,
    }).returning({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName });
  }

  let conversation = !newConversation
    ? (await db.select().from(conversations).where(and(
      eq(conversations.organizationId, organizationId),
      eq(conversations.artistId, artistId),
      eq(conversations.clientId, client.id),
      eq(conversations.channel, 'WEB_TEST'),
      eq(conversations.status, 'OPEN'),
    )).orderBy(desc(conversations.createdAt)).limit(1))[0]
    : undefined;
  if (!conversation) {
    [conversation] = await db.insert(conversations).values({
      organizationId,
      artistId,
      clientId: client.id,
      channel: 'WEB_TEST',
      aiEnabled: true,
      status: 'OPEN',
      lastMessageAt: new Date(),
    }).returning();
  }
  return NextResponse.json({ client, conversation, artist: { id: artist.id, displayName: artist.displayName } });
}

export const POST = protectedRoute(handlePOST, true);
