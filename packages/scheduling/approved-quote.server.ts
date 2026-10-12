import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { conversations } from '@db/schema';
import { getConversationQuote } from '@/packages/inbox/quote-state.server';

export async function schedulingQuote(organizationId: string, artistId: string, serviceId?: string, conversationId?: string, clientId?: string) {
  if (!serviceId || !conversationId) return null;
  const [conversation] = await db.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId), eq(conversations.artistId, artistId))).limit(1);
  if (!conversation || (clientId && conversation.clientId !== clientId) || !conversation.aiEnabled || conversation.status !== 'OPEN') return null;
  const quote = await getConversationQuote(organizationId, conversationId);
  return quote?.action === 'QUOTE_AI_SCHEDULING' && quote.serviceId === serviceId ? quote : null;
}
