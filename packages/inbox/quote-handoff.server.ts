import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@db/index';
import { conversationEvents, conversations, messages } from '@db/schema';

/** Call only after the acknowledgment was accepted by the messaging provider. */
export async function finalizeQuoteHandoff(organizationId: string, conversationId: string, messageId: string) {
  await db.transaction(async tx => {
    const [message] = await tx.select({ metadata: messages.metadata }).from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(and(eq(messages.id, messageId), eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId))).limit(1);
    const summary = (message?.metadata as { quoteSummary?: unknown } | null)?.quoteSummary;
    if (typeof summary !== 'string' || !summary.trim()) return;
    const [updated] = await tx.update(conversations).set({ status: 'AWAITING_QUOTE', aiEnabled: false, humanTakeoverAt: new Date(), unreadCount: sql`GREATEST(${conversations.unreadCount}, 1)`, updatedAt: new Date() })
      .where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId), eq(conversations.aiEnabled, true), eq(conversations.status, 'OPEN'))).returning({ id: conversations.id });
    if (!updated) return;
    await tx.insert(conversationEvents).values({ organizationId, conversationId, action: 'QUOTE_REQUESTED', fromMode: 'AI', toMode: 'HUMAN', details: { summary: summary.slice(0, 1200), messageId } });
  });
}
