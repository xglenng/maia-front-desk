import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@db/index';
import { conversationEvents } from '@db/schema';
import { parseQuoteState } from './quote-policy';

export async function getConversationQuote(organizationId: string, conversationId: string) {
  const [event] = await db.select().from(conversationEvents).where(and(eq(conversationEvents.organizationId, organizationId), eq(conversationEvents.conversationId, conversationId), inArray(conversationEvents.action, ['QUOTE_REQUESTED', 'QUOTE_APPROVED', 'QUOTE_BOOKING_LINKED'])))
    .orderBy(desc(conversationEvents.createdAt)).limit(1);
  return event ? parseQuoteState(event.action, event.details) : null;
}
