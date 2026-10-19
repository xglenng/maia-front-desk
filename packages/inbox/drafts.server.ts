import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@db/index';
import { artists, conversationEvents, conversations, messages } from '@db/schema';
import { draftDetailsSchema, reviewableDraft, effectiveReplyMode } from './draft-policy';
import { shouldRunAi } from './state';
import type { MaiaAgentContext } from '@/packages/ai/src/context-policy';

export async function latestDraft(organizationId: string, conversationId: string, inboundVersion: number, aiMode: string) {
  const [event] = await db.select({ id: conversationEvents.id, details: conversationEvents.details }).from(conversationEvents)
    .where(and(eq(conversationEvents.organizationId, organizationId), eq(conversationEvents.conversationId, conversationId), eq(conversationEvents.action, 'AI_DRAFT_CREATED')))
    .orderBy(desc(conversationEvents.createdAt), desc(conversationEvents.id)).limit(1);
  return reviewableDraft(event, inboundVersion, aiMode);
}

export async function saveReplyDraft(context: MaiaAgentContext, body: string, inboundVersion: number, sourceMessageId: string, automationJobId?: string) {
  const details = draftDetailsSchema.parse({ body: body.trim().slice(0, 1600), inboundVersion, sourceMessageId, status: 'PENDING', automationJobId });
  return db.transaction(async tx => {
    const [artist] = await tx.select().from(artists).where(and(eq(artists.id, context.artistId), eq(artists.organizationId, context.organizationId))).for('update');
    const [conversation] = await tx.select().from(conversations).where(and(eq(conversations.id, context.conversationId), eq(conversations.organizationId, context.organizationId), eq(conversations.artistId, context.artistId))).for('update');
    if ((!artist || effectiveReplyMode(conversation?.aiReplyMode, artist.aiMode) !== 'DRAFT') || !artist.receptionistEnabled || !conversation || !shouldRunAi(conversation) || conversation.inboundVersion !== inboundVersion) throw new Error('Draft is no longer current.');
    const [source] = await tx.select().from(messages).where(eq(messages.conversationId, context.conversationId)).orderBy(desc(messages.createdAt)).limit(1);
    if (source?.id !== sourceMessageId || source.role !== 'user') throw new Error('This client message has already changed or been answered.');
    const [previous] = await tx.select().from(conversationEvents).where(and(eq(conversationEvents.organizationId, context.organizationId), eq(conversationEvents.conversationId, context.conversationId), eq(conversationEvents.action, 'AI_DRAFT_CREATED'))).orderBy(desc(conversationEvents.createdAt), desc(conversationEvents.id)).limit(1);
    const previousDetails = draftDetailsSchema.safeParse(previous?.details);
    if (previousDetails.success && previousDetails.data.inboundVersion === inboundVersion) {
      if (['SENDING', 'REVIEW_REQUIRED'].includes(previousDetails.data.status)) throw new Error('Review the previous delivery before preparing another draft.');
      if (automationJobId && previousDetails.data.automationJobId === automationJobId) return { id: previous.id };
    }
    const [event] = await tx.insert(conversationEvents).values({ organizationId: context.organizationId, conversationId: context.conversationId, action: 'AI_DRAFT_CREATED', details }).returning({ id: conversationEvents.id });
    return event;
  });
}

export async function claimReplyDraft(organizationId: string, conversationId: string, draftId: string) {
  return db.transaction(async tx => {
    const [owner] = await tx.select({ artistId: conversations.artistId }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId)));
    if (!owner) return false;
    const [artist] = await tx.select().from(artists).where(and(eq(artists.id, owner.artistId), eq(artists.organizationId, organizationId))).for('update');
    const [conversation] = await tx.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId))).for('update');
    if (!conversation || conversation.status === 'CLOSED' || !artist) return false;
    const [event] = await tx.select().from(conversationEvents).where(and(eq(conversationEvents.organizationId, organizationId), eq(conversationEvents.conversationId, conversationId), eq(conversationEvents.action, 'AI_DRAFT_CREATED'))).orderBy(desc(conversationEvents.createdAt), desc(conversationEvents.id)).limit(1);
    const draft = reviewableDraft(event, conversation.inboundVersion, effectiveReplyMode(conversation.aiReplyMode, artist.aiMode));
    if (!draft || draft.id !== draftId) return false;
    const [source] = await tx.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.createdAt)).limit(1);
    if (source?.id !== draft.sourceMessageId || source.role !== 'user') return false;
    await tx.update(conversationEvents).set({ details: { ...draftDetailsSchema.parse(event.details), status: 'SENDING' } }).where(eq(conversationEvents.id, draftId));
    return true;
  });
}

export async function autoReplyStillAllowed(context: MaiaAgentContext) {
  const [state] = await db.select({ aiEnabled: conversations.aiEnabled, status: conversations.status, aiMode: artists.aiMode, aiReplyMode: conversations.aiReplyMode }).from(conversations)
    .innerJoin(artists, and(eq(artists.id, conversations.artistId), eq(artists.organizationId, conversations.organizationId)))
    .where(and(eq(conversations.id, context.conversationId), eq(conversations.organizationId, context.organizationId), eq(conversations.artistId, context.artistId), eq(conversations.clientId, context.clientId))).limit(1);
  return Boolean(state && effectiveReplyMode(state.aiReplyMode, state.aiMode) !== 'DRAFT' && shouldRunAi(state));
}

export async function finishReplyDraft(organizationId: string, conversationId: string, draftId: string, status: 'SENT' | 'PENDING' | 'REVIEW_REQUIRED') {
  await db.update(conversationEvents).set({ details: sql`${conversationEvents.details} || ${JSON.stringify({ status })}::jsonb` })
    .where(and(eq(conversationEvents.id, draftId), eq(conversationEvents.organizationId, organizationId), eq(conversationEvents.conversationId, conversationId), sql`${conversationEvents.details}->>'status' = 'SENDING'`));
}
