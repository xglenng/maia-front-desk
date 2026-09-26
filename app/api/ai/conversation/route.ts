import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@db/index';
import { artists, clients, conversations, messages } from '@db/schema';

const querySchema = z.object({
  organizationId: z.string().uuid(),
  artistId: z.string().uuid(),
  clientId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
});

async function handleGET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { organizationId, artistId, clientId, conversationId } = parsed.data;
  const [client] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, organizationId))).limit(1);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const [conversation] = conversationId
    ? await db.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId), eq(conversations.artistId, artistId), eq(conversations.clientId, clientId))).limit(1)
    : await db.select().from(conversations).where(and(eq(conversations.organizationId, organizationId), eq(conversations.artistId, artistId), eq(conversations.clientId, clientId), eq(conversations.status, 'OPEN'))).orderBy(asc(conversations.createdAt)).limit(1);

  if (!conversation) return NextResponse.json({ conversation: null, messages: [] });

  const conversationMessages = await db.select().from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(asc(messages.createdAt));
  return NextResponse.json({ conversation, client, messages: conversationMessages });
}

const createSchema = z.object({
  organizationId: z.string().uuid(),
  artistId: z.string().uuid(),
  clientId: z.string().uuid(),
});

async function handlePOST(request: NextRequest) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { organizationId, artistId, clientId } = parsed.data;
  const [[artist], [client]] = await Promise.all([
    db.select({ id: artists.id }).from(artists).where(and(eq(artists.id, artistId), eq(artists.organizationId, organizationId))).limit(1),
    db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, organizationId))).limit(1),
  ]);
  if (!artist || !client) return NextResponse.json({ error: 'Artist or client not found' }, { status: 404 });

  const [conversation] = await db.insert(conversations).values({
    organizationId,
    artistId,
    clientId,
    channel: 'WEB',
    aiEnabled: true,
    status: 'OPEN',
    lastMessageAt: new Date(),
  }).returning();
  return NextResponse.json({ conversation, messages: [] }, { status: 201 });
}

export const GET = protectedRoute(handleGET, false);
export const POST = protectedRoute(handlePOST, false);
