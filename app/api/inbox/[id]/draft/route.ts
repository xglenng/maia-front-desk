import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@db/index';
import { conversationEvents, messages } from '@db/schema';
import { protectedRoute } from '@/packages/auth/server';
import { accessibleConversation } from '@/packages/inbox/server';
import { resolveAuthenticatedMaiaAgentContext } from '@/packages/ai/src/context.server';
import { runMaiaAgent } from '@/packages/ai/src/agent.server';

type Context = { params: Promise<{ id: string }> };
async function handlePOST(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const access = await accessibleConversation(request, id);
  if (!access.ok) return access.error;
  if (access.row.artist.aiMode !== 'DRAFT') return NextResponse.json({ error: 'Select Draft for review first.' }, { status: 409 });
  const [message] = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(desc(messages.createdAt)).limit(1);
  if (!message || message.role !== 'user') return NextResponse.json({ error: 'There is no unanswered client message to draft a reply to.' }, { status: 409 });
  const { context } = await resolveAuthenticatedMaiaAgentContext(request, { organizationId: access.user.organization_id, artistId: access.row.artist.id, clientId: access.row.client.id, conversationId: id });
  try {
    const result = await runMaiaAgent(context, { message: message.content, messageAlreadyStored: true, draftOnly: true });
    if ('error' in result) return NextResponse.json(result, { status: 409 });
    return NextResponse.json({ draftId: result.messageId });
  } catch { return NextResponse.json({ error: 'Maia could not prepare this draft. Refresh and try again.' }, { status: 502 }); }
}
async function handleDELETE(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const access = await accessibleConversation(request, id);
  if (!access.ok) return access.error;
  const parsed = z.object({ draftId: z.string().uuid() }).safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid draft.' }, { status: 400 });
  const [discarded] = await db.update(conversationEvents).set({ details: sql`${conversationEvents.details} || '{"status":"DISCARDED"}'::jsonb` })
    .where(and(eq(conversationEvents.id, parsed.data.draftId), eq(conversationEvents.organizationId, access.user.organization_id), eq(conversationEvents.conversationId, id), eq(conversationEvents.action, 'AI_DRAFT_CREATED'), sql`${conversationEvents.details}->>'status' = 'PENDING'`)).returning({ id: conversationEvents.id });
  return NextResponse.json({ discarded: Boolean(discarded) });
}
export const POST = protectedRoute(handlePOST);
export const DELETE = protectedRoute(handleDELETE);
