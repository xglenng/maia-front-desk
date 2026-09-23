import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@db/index';
import { clients, conversations, messages } from '@db/schema';

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

export const GET = protectedRoute(handleGET, false);
