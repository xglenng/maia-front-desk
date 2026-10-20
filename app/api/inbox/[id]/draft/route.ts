import { latestDraft, saveReplyDraft } from '@/packages/inbox/drafts.server';
import { effectiveReplyMode } from '@/packages/inbox/draft-policy';
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
  if (effectiveReplyMode(access.row.conversation.aiReplyMode, access.row.artist.aiMode, access.row.artist.requiresSupervisorApproval) !== 'DRAFT') return NextResponse.json({ error: 'Select Draft for review first.' }, { status: 409 });
  const [message] = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(desc(messages.createdAt)).limit(1);
  if (!message || message.role !== 'user') return NextResponse.json({ error: 'There is no unanswered client message to draft a reply to.' }, { status: 409 });
  const { context } = await resolveAuthenticatedMaiaAgentContext(request, { organizationId: access.user.organization_id, artistId: access.row.artist.id, clientId: access.row.client.id, conversationId: id });
  try {
    const previous = await latestDraft(access.user.organization_id, id, access.row.conversation.inboundVersion, 'DRAFT');
    const result = await runMaiaAgent(context, { message: message.content, messageAlreadyStored: true, draftOnly: true, manualDraft: true, previousDraft: previous?.body });
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

async function handlePATCH(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const access = await accessibleConversation(request, id);
  if (!access.ok) return access.error;
  const parsed = z.object({ body: z.string().trim().min(1).max(1600), draftId: z.string().uuid() }).safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'A current draft and reply text are required.' }, { status: 400 });
  const mode = effectiveReplyMode(access.row.conversation.aiReplyMode, access.row.artist.aiMode, access.row.artist.requiresSupervisorApproval);
  const previous = await latestDraft(access.user.organization_id, id, access.row.conversation.inboundVersion, mode);
  if (!previous || previous.id !== parsed.data.draftId) return NextResponse.json({ error: 'This draft is stale. Refresh before saving.' }, { status: 409 });
  const [message] = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(desc(messages.createdAt)).limit(1);
  if (!message || message.role !== 'user') return NextResponse.json({ error: 'This client message has already been answered.' }, { status: 409 });
  const { context } = await resolveAuthenticatedMaiaAgentContext(request, { organizationId: access.user.organization_id, artistId: access.row.artist.id, clientId: access.row.client.id, conversationId: id });
  try {
    const saved = await saveReplyDraft(context, parsed.data.body, access.row.conversation.inboundVersion, message.id, undefined, true);
    await db.insert(conversationEvents).values({ organizationId: access.user.organization_id, conversationId: id, userId: access.user.id, action: 'DRAFT_SUBMITTED_FOR_REVIEW', details: { draftId: saved.id } });
    return NextResponse.json({ draftId: saved.id });
  } catch { return NextResponse.json({ error: 'This draft changed or is being sent. Refresh before saving.' }, { status: 409 }); }
}

export const PATCH = protectedRoute(handlePATCH);
export const POST = protectedRoute(handlePOST);
export const DELETE = protectedRoute(handleDELETE);
