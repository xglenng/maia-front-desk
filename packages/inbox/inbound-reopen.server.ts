import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@db/index';
import { conversations, conversationEvents, messages } from '@db/schema';
import { restoredAiState } from './inbound-reopen-policy';

export async function reopenAfterClientMessage(organizationId: string, conversationId: string, sourceMessageId: string) {
  return db.transaction(async tx => {
    const [current] = await tx.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId))).for('update');
    if (!current || current.status !== 'CLOSED') return current;
    const [source] = await tx.select({ createdAt: messages.createdAt }).from(messages).where(and(eq(messages.id, sourceMessageId), eq(messages.conversationId, conversationId), eq(messages.role, 'user'), eq(messages.senderType, 'CLIENT'))).limit(1);
    if (!source) return current;
    const [close] = await tx.select({ fromMode: conversationEvents.fromMode, createdAt: conversationEvents.createdAt }).from(conversationEvents)
      .where(and(eq(conversationEvents.organizationId, organizationId), eq(conversationEvents.conversationId, conversationId), eq(conversationEvents.action, 'CLOSE'), inArray(conversationEvents.fromMode, ['AI','HUMAN'])))
      .orderBy(desc(conversationEvents.createdAt), desc(conversationEvents.id)).limit(1);
    if (close && close.createdAt > source.createdAt) return current;
    const aiEnabled = restoredAiState(close?.fromMode);
    const [updated] = await tx.update(conversations).set({ status: 'OPEN', aiEnabled, updatedAt: new Date() }).where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId))).returning();
    await tx.insert(conversationEvents).values({ organizationId, conversationId, action: 'REOPENED_BY_CLIENT', fromMode: 'CLOSED', toMode: aiEnabled ? 'AI' : 'HUMAN', details: { sourceMessageId, restoredFromClose: Boolean(close) } });
    return updated;
  });
}
