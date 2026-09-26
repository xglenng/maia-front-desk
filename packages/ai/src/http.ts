import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq } from 'drizzle-orm';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { db } from '@db/index';
import { artistConsentForms, artists, businessRules, clients, conversations, messages, organizations } from '@db/schema';
import { buildSystemPrompt } from '@ai/system-prompt';
import { createBookingHold, createDepositLink, escalate, getArtistContext, getClient, getServiceCatalog, getSlots, getWaiverLink, sendMessage, type AgentContext } from '@ai/tools';
import { shouldRunAi } from '@/packages/inbox/state';
import { hasBookingCommitmentIntent, smsConfirmationText } from '@/packages/consent';

const inputSchema = z.object({
  message: z.string().min(1).max(4000),
  organizationId: z.string().uuid(),
  artistId: z.string().uuid(),
  clientId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
});

async function getOrCreateConversation(input: z.infer<typeof inputSchema>) {
  let clientId = input.clientId;
  if (!clientId) {
    const [client] = await db.select().from(clients).where(eq(clients.organizationId, input.organizationId)).orderBy(asc(clients.createdAt)).limit(1);
    if (!client) throw new Error('No client exists. Create a client first.');
    clientId = client.id;
  }
  const [client] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, input.organizationId)));
  if (!client) throw new Error('Client not found.');
  if (input.conversationId) {
    const [conversation] = await db.select().from(conversations).where(and(eq(conversations.id, input.conversationId), eq(conversations.organizationId, input.organizationId), eq(conversations.artistId, input.artistId), eq(conversations.clientId, clientId)));
    if (!conversation) throw new Error('Conversation not found.');
    return { conversation, client };
  }
  const [existing] = await db.select().from(conversations).where(and(eq(conversations.organizationId, input.organizationId), eq(conversations.artistId, input.artistId), eq(conversations.clientId, clientId), eq(conversations.status, 'OPEN'))).orderBy(asc(conversations.createdAt)).limit(1);
  if (existing) return { conversation: existing, client };
  const [conversation] = await db.insert(conversations).values({ organizationId: input.organizationId, artistId: input.artistId, clientId, channel: 'WEB', aiEnabled: true, status: 'OPEN', lastMessageAt: new Date() }).returning();
  return { conversation, client };
}

export async function handlePOST(request: NextRequest, options: { messageAlreadyStored?: boolean } = {}) {
  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  try {
    const [artist] = await db.select().from(artists).where(and(eq(artists.id, input.artistId), eq(artists.organizationId, input.organizationId)));
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    const { conversation, client } = await getOrCreateConversation(input);
    if (!shouldRunAi(conversation)) {
      return NextResponse.json({ error: 'AI is paused for this conversation.', conversationId: conversation.id, mode: conversation.status === 'CLOSED' ? 'CLOSED' : 'HUMAN' }, { status: 409 });
    }
    const ctx: AgentContext = { organizationId: input.organizationId, artistId: input.artistId, conversationId: conversation.id, clientId: client.id };
    if (!options.messageAlreadyStored) await db.insert(messages).values({ conversationId: conversation.id, senderType: 'CLIENT', role: 'user', content: input.message });
    await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversation.id));

    const [consentSurface] = await db.select({ mode: artistConsentForms.mode, confirmationText: artistConsentForms.confirmationText, organizationName: organizations.name }).from(artistConsentForms).innerJoin(organizations, eq(artistConsentForms.organizationId, organizations.id)).where(and(eq(artistConsentForms.organizationId, input.organizationId), eq(artistConsentForms.artistId, input.artistId))).limit(1);
    const confirmation = consentSurface?.confirmationText || smsConfirmationText(consentSurface?.organizationName || artist.displayName);
    const bookingIntent = hasBookingCommitmentIntent(input.message);
    if (conversation.channel === 'SMS' && !client.smsOptIn && bookingIntent) {
      const message = await sendMessage(ctx, confirmation);
      return NextResponse.json({ reply: confirmation, conversationId: conversation.id, messageId: message.id, mode: 'CONSENT_REQUIRED' });
    }

    if (process.env.AI_PROVIDER === 'mock' || !process.env.OPENAI_API_KEY) {
      const text = input.message.toLowerCase();
      const reply = text.includes('price') || text.includes('cost')
        ? `I can help with that. ${artist.displayName}'s rate is $${(artist.hourlyRateCents / 100).toFixed(0)}/hour, with a $${(artist.minimumPriceCents / 100).toFixed(0)} minimum. Tell me the placement, approximate size, style, and whether you want color or black and gray.`
        : text.includes('book') || text.includes('appointment')
          ? 'Absolutely. Tell me your preferred day, approximate tattoo duration, placement, and size and I can check available times.'
          : 'Thanks! Tell me the placement, approximate size, style, color vs. black and gray, and send any reference images. I’ll use that to determine the next booking step.';
      const message = await sendMessage(ctx, reply);
      return NextResponse.json({ reply, conversationId: conversation.id, messageId: message.id, mode: 'mock' });
    }

    const { rules } = await getArtistContext(ctx);
    const serviceCatalog = await getServiceCatalog(ctx);
    const system = buildSystemPrompt({ artistName: artist.displayName, hourlyRateCents: artist.hourlyRateCents, minimumPriceCents: artist.minimumPriceCents, rules: rules.map(r => r.rule), services: serviceCatalog.map(s => `${s.name}: ${s.durationMinutes} minutes, ${s.pricingType}${s.basePriceCents ? `, base $${(s.basePriceCents / 100).toFixed(2)}` : ''}`), smsConsentConfirmed: client.smsOptIn, smsConfirmationText: confirmation, channel: conversation.channel, responseLength: artist.responseLength });

    const history = await db.select({ role: messages.role, content: messages.content })
      .from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(desc(messages.createdAt)).limit(20);
    const conversationMessages = history.reverse().map(m => ({ role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, content: m.content }));

    const result = await generateText({
      model: openai(process.env.OPENAI_MODEL || 'gpt-4o-mini'),
      system,
      messages: conversationMessages,
      maxSteps: 6,
      tools: {
        getClient: tool({ description: 'Get the current client profile.', parameters: z.object({}), execute: async () => getClient(ctx) }),
        getServices: tool({ description: 'List active tattoo services for this artist.', parameters: z.object({}), execute: async () => getServiceCatalog(ctx) }),
        getAvailableSlots: tool({ description: 'Check real availability. Never invent times; only present returned slots.', parameters: z.object({ durationMinutes: z.number().int().positive().max(1440), from: z.string(), to: z.string() }), execute: async (args) => getSlots(ctx, args) }),
        createBookingHold: tool({ description: 'Create a temporary 10-minute hold after the client has selected a returned slot.', parameters: z.object({ serviceId: z.string().uuid(), start: z.string(), depositCents: z.number().int().nonnegative().optional(), priceCents: z.number().int().nonnegative().optional() }), execute: async (args) => createBookingHold(ctx, args) }),
        createDepositLink: tool({ description: 'Create the real Stripe deposit checkout link for a valid booking hold.', parameters: z.object({ appointmentId: z.string().uuid() }), execute: async (args) => createDepositLink(ctx, args.appointmentId) }),
        getWaiverLink: tool({ description: 'Get the current waiver signing URL for an appointment.', parameters: z.object({ appointmentId: z.string().uuid() }), execute: async (args) => getWaiverLink(ctx, args.appointmentId) }),
        escalateToArtist: tool({ description: 'Escalate uncertain, medical, legal, unusual, or artist-approval-required questions.', parameters: z.object({ reason: z.string().min(1) }), execute: async (args) => escalate(ctx, args.reason) }),
      },
    });
    const reply = result.text || 'I’m going to have the artist take a look at this.';
    const message = await sendMessage(ctx, reply);
    return NextResponse.json({ reply, conversationId: conversation.id, messageId: message.id, mode: 'live', toolCalls: result.steps.flatMap(step => step.toolCalls ?? []).map(call => call.toolName) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI receptionist failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
