import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@db/index';
import { conversationEvents } from '@db/schema';
import { parseQuoteState } from './quote-policy';

export async function getConversationQuoteContext(organizationId: string, conversationId: string) {
  const [event] = await db.select().from(conversationEvents).where(and(eq(conversationEvents.organizationId, organizationId), eq(conversationEvents.conversationId, conversationId), inArray(conversationEvents.action, ['QUOTE_REQUESTED', 'QUOTE_APPROVED', 'QUOTE_AI_SCHEDULING', 'QUOTE_BOOKING_LINKED', 'QUOTE_ACCEPTED'])))
    .orderBy(desc(conversationEvents.createdAt)).limit(1);
  const details = event?.details as { reason?: string; intakeMessageId?: string } | null;
  return { quote: event ? parseQuoteState(event.action, event.details) : null,
    intakeMessageId: event?.action === 'QUOTE_REQUESTED' && details?.reason === 'NEW_TATTOO_INQUIRY' && typeof details.intakeMessageId === 'string' ? details.intakeMessageId : undefined };
}

export async function getConversationQuote(organizationId: string, conversationId: string) {
  return (await getConversationQuoteContext(organizationId, conversationId)).quote;
}
