import { isNewTattooInquiry } from './tattoo-inquiry-policy';
import { explicitQuoteAgreement } from '@/packages/inbox/quote-policy';
import { approvedAvailabilityInput } from './approved-scheduling-policy';
import { shouldHandoffReference } from '@/packages/inbox/reference-handoff-policy';
import { getConversationQuote } from '@/packages/inbox/quote-state.server';
import { availabilityToolParameters } from './availability-tool-schema';
import { requiresServiceLookup, serviceScopedTools } from './service-lookup-policy';
import { agentFailureDiagnostics } from './failure-diagnostics';
import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { db } from '@db/index';
import { agentActions, agentRuns, artists, conversationEvents, conversations, messages, services } from '@db/schema';
import { buildSystemPrompt } from '@ai/system-prompt';
import { shouldRunAi } from '@/packages/inbox/state';
import { acceptApprovedQuote, createBookingHold, createDepositRequest, escalate, getClient, getContextTimezone, getWaiverLink, saveClientName, sendMessage } from './tools';
import { checkAvailability, getClientAppointmentsForReceptionist, getServicePricing, getStudioContext, getStudioPromptConfiguration, listArtists, searchServices } from './read-tools.server';
import type { MaiaAgentContext } from './context-policy';

export type MaiaAgentResult = {
  reply: string;
  conversationId: string;
  messageId: string;
  mode: 'mock' | 'live';
  toolCalls?: string[];
  toolResults?: string[];
};

async function auditRun(context: MaiaAgentContext, model: string) {
  try {
    const safeModel = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(model) ? model : 'configured-model';
    const [run] = await db.insert(agentRuns).values({ conversationId: context.conversationId, model: safeModel, success: true }).returning({ id: agentRuns.id });
    return run?.id;
  } catch {
    return undefined;
  }
}

async function updateRun(runId: string | undefined, values: Partial<typeof agentRuns.$inferInsert>) {
  if (!runId) return;
  try { await db.update(agentRuns).set(values).where(eq(agentRuns.id, runId)); } catch { /* Audit must not affect replies. */ }
}

async function auditAction(runId: string | undefined, toolName: string, success: boolean) {
  if (!runId) return;
  try {
    await db.insert(agentActions).values({
      agentRunId: runId,
      toolName,
      arguments: {},
      result: { status: success ? 'completed' : 'failed' },
      success,
    });
  } catch { /* Audit must not affect tool results. */ }
}

function withAudit<TArgs extends unknown[], TResult>(runId: string | undefined, toolName: string, execute: (...args: TArgs) => Promise<TResult>) {
  return async (...args: TArgs) => {
    try {
      const result = await execute(...args);
      await auditAction(runId, toolName, true);
      return result;
    } catch (error) {
      await auditAction(runId, toolName, false);
      throw error;
    }
  };
}

export async function runMaiaAgent(context: MaiaAgentContext, input: { message: string; availabilityOnly?: boolean; messageAlreadyStored?: boolean; automationGuard?: () => Promise<boolean>; automationJobId?: string; automationInboundVersion?: number }): Promise<MaiaAgentResult | { error: string; conversationId: string; mode: 'HUMAN' | 'CLOSED' }> {
  const [artist] = await db.select({ id: artists.id, organizationId: artists.organizationId, displayName: artists.displayName, responseLength: artists.responseLength, receptionistEnabled: artists.receptionistEnabled, receptionistTone: artists.receptionistTone, receptionistGreeting: artists.receptionistGreeting, receptionistInstructions: artists.receptionistInstructions })
    .from(artists).where(and(eq(artists.id, context.artistId), eq(artists.organizationId, context.organizationId))).limit(1);
  const [conversation] = await db.select().from(conversations).where(and(
    eq(conversations.id, context.conversationId),
    eq(conversations.organizationId, context.organizationId),
    eq(conversations.artistId, context.artistId),
    eq(conversations.clientId, context.clientId),
  )).limit(1);
  if (!artist || !conversation) throw new Error('Agent context is no longer valid.');
  if (!shouldRunAi(conversation)) return { error: 'AI is paused for this conversation.', conversationId: conversation.id, mode: conversation.status === 'CLOSED' ? 'CLOSED' : 'HUMAN' };
  if (!artist.receptionistEnabled) return { error: 'The studio receptionist is disabled for this artist.', conversationId: conversation.id, mode: 'HUMAN' };
  if (input.automationGuard && !await input.automationGuard()) return { error: 'The automated response is no longer current.', conversationId: conversation.id, mode: 'HUMAN' };

  if (!input.messageAlreadyStored) await db.insert(messages).values({ conversationId: conversation.id, senderType: 'CLIENT', role: 'user', content: input.message });
  await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversation.id));

  const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const mockMode = process.env.AI_PROVIDER === 'mock' || !process.env.OPENAI_API_KEY;
  const startedAt = Date.now();
  const runId = await auditRun(context, mockMode ? 'mock' : modelName);

  try {
    if (mockMode) {
      const text = input.message.toLowerCase();
      const reply = text.includes('price') || text.includes('cost')
        ? 'Which service are you asking about? I need the service details to answer accurately.'
        : text.includes('book') || text.includes('appointment')
          ? 'Which service would you like to book, and what timing works for you?'
          : 'Which service are you interested in, and what would you like help with?';
      if (input.automationGuard && !await input.automationGuard()) return { error: 'The automated response is no longer current.', conversationId: conversation.id, mode: 'HUMAN' };
      const message = await sendMessage(context, reply, input.automationJobId, input.automationInboundVersion);
      await updateRun(runId, { success: true, latencyMs: Date.now() - startedAt });
      return { reply, conversationId: conversation.id, messageId: message.id, mode: 'mock' };
    }

    const [providerTimezone, studioConfiguration] = await Promise.all([
      getContextTimezone(context.organizationId, context.artistId),
      getStudioPromptConfiguration(context, input.message),
    ]);
    const currentDateTime = new Intl.DateTimeFormat('en-US', { timeZone: providerTimezone, dateStyle: 'full', timeStyle: 'long' }).format(new Date());
    let approvedQuote = await getConversationQuote(context.organizationId, context.conversationId);
    if (!input.availabilityOnly && approvedQuote?.bookingId && isNewTattooInquiry(input.message)) {
      if (input.automationGuard && !await input.automationGuard()) return { error: 'The automated response is no longer current.', conversationId: conversation.id, mode: 'HUMAN' };
      await db.insert(conversationEvents).values({ organizationId: context.organizationId, conversationId: context.conversationId, action: 'QUOTE_REQUESTED', fromMode: 'AI', toMode: 'AI', details: { reason: 'NEW_TATTOO_INQUIRY', previousAppointmentId: approvedQuote.appointmentId } });
      approvedQuote = null;
    }
    const system = buildSystemPrompt({
      artistName: artist.displayName,
      currentDateTime,
      providerTimezone,
      channel: context.channel,
      responseLength: artist.responseLength,
      clientFacingContext: studioConfiguration.clientFacing,
      internalInstructions: studioConfiguration.internalInstructions,
      receptionistGuidance: studioConfiguration.receptionistGuidance,
      testMode: context.channel === 'WEB_TEST',
    }) + (approvedQuote ? `\nTRUSTED REQUEST STATE:\n${JSON.stringify({ ...approvedQuote, priceLabel: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(approvedQuote.priceCents / 100) })}\nThis request already has an artist-approved estimate. Do not request another estimate. If QUOTE_BOOKING_LINKED, this request is already booked: never create another booking for it. If QUOTE_AI_SCHEDULING, the artist authorized you to schedule this approved quote: ask for timing if needed, call check_availability with the approved service ID, and createBookingHold only after the client selects an offered slot. Use the approved duration and price. The booking tool records and presents price/date confirmation automatically; do not ask a second time. On client agreement, call accept_quote_terms. If ACCEPTED and depositRequired is true, call create_deposit_request using its appointmentId and send the link. If ACCEPTED and no deposit is required, send a short final acknowledgment rather than asking again. If QUOTE_APPROVED, scheduling is handled manually until a Square appointment is linked; do not claim a booking is confirmed. For a linked appointment, call accept_quote_terms if the client agrees; if confirmation is missing, call confirm_quote_terms and wait. After ACCEPTED, check the appointment deposit requirement and call create_deposit_request only if required. Never book it again.` : '');

    const history = await db.select({ role: messages.role, content: messages.content, metadata: messages.metadata })
      .from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(desc(messages.createdAt)).limit(20);
    const [quoteService] = await db.select({ id: services.id }).from(services).where(and(eq(services.organizationId, context.organizationId), eq(services.artistId, context.artistId), eq(services.active, true), eq(services.pricingType, 'QUOTE'), eq(services.serviceType, 'TATTOO'), eq(services.requiresArtistApproval, true))).limit(1);
    const latestAttachments = (history[0]?.metadata as { attachments?: Array<{ type?: string }> } | null)?.attachments || [];
    if (context.channel !== 'WEB_TEST' && shouldHandoffReference({ quoteConfigured: Boolean(quoteService), quoteApproved: Boolean(approvedQuote), tattooContext: history.some(message => message.role === 'user' && /tattoo/i.test(message.content)), latestAttachments })) {
      const reply = 'Thanks! Let me get back to you with an estimate.';
      if (input.automationGuard && !await input.automationGuard()) return { error: 'The automated response is no longer current.', conversationId: conversation.id, mode: 'HUMAN' };
      const message = await sendMessage(context, reply, input.automationJobId, input.automationInboundVersion);
      const summary = history.filter(message => message.role === 'user').slice(0, 6).reverse().map(message => message.content).join('\n').slice(0, 1200);
      await db.update(messages).set({ metadata: { source: 'ai-receptionist', quoteSummary: `Reference image supplied; review the image in this conversation.\n${summary}`, ...(input.automationJobId ? { automationJobId: input.automationJobId } : {}), ...(input.automationInboundVersion == null ? {} : { automationInboundVersion: input.automationInboundVersion }) } }).where(and(eq(messages.id, message.id), eq(messages.conversationId, conversation.id)));
      await updateRun(runId, { success: true, latencyMs: Date.now() - startedAt });
      return { reply, conversationId: conversation.id, messageId: message.id, mode: 'live', toolCalls: [], toolResults: [] };
    }
    const conversationMessages = history.reverse().map(message => ({ role: message.role === 'assistant' ? 'assistant' as const : 'user' as const, content: message.content }));
    if (input.availabilityOnly) conversationMessages.push({ role: 'user', content: 'The studio authorized you to offer the next few available dates for the approved quote. Check the next 14 days using the provider-local date. Ask which time works; do not book, collect a deposit, or restart the intake. If no approved quote exists, do not offer dates.' });
    const audit = <TArgs extends unknown[], TResult>(name: string, execute: (...args: TArgs) => Promise<TResult>) => withAudit(runId, name, async (...args: TArgs) => {
      if (input.automationGuard && !await input.automationGuard()) throw new Error('AUTOMATION_SUPPRESSED');
      return execute(...args);
    });

    let servicesDiscovered = approvedQuote?.action === 'QUOTE_AI_SCHEDULING';
    let quoteSummary: string | undefined;
    let quoteTermsPrompt: string | undefined;
    let quoteTerms: { bookingId?: string; priceCents: number; startsAt?: string } | undefined;
    let quoteEligible = false;
    const presentQuoteTerms = async () => {
      const quoteForTerms = await getConversationQuote(context.organizationId, context.conversationId);
      if (!quoteForTerms?.bookingId || !quoteForTerms.startsAt || !quoteForTerms.appointmentId || new Date(quoteForTerms.startsAt).getTime() <= Date.now()) return { status: 'MANUAL_BOOKING_REQUIRED' };
      if (quoteForTerms.action === 'QUOTE_ACCEPTED') return { status: 'ALREADY_ACCEPTED' };
      const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(quoteForTerms.priceCents / 100);
      const date = new Intl.DateTimeFormat('en-US', { timeZone: providerTimezone, dateStyle: 'full', timeStyle: 'short' }).format(new Date(quoteForTerms.startsAt));
      quoteTerms = { bookingId: quoteForTerms.bookingId, priceCents: quoteForTerms.priceCents, startsAt: quoteForTerms.startsAt };
      quoteTermsPrompt = `The estimate is ${price}, and I have you down for ${date}. Does that price and time work for you?`;
      return { status: 'CONFIRMATION_REQUIRED', reply: quoteTermsPrompt };
    };
    const tools = {
        getClient: tool({ description: 'Read the current client name when needed for a natural receptionist response. Returns only first and last name.', parameters: z.object({}), execute: audit('getClient', async () => getClient(context)) }),
        get_studio_context: tool({
          description: 'Read configured public studio profile, location hours, client-visible policies, relevant FAQs, and aftercare. Use for studio questions; internal instructions are never returned by this client-facing tool. Optionally provide the topic and location the client asked about.',
          parameters: z.object({
            query: z.string().trim().min(1).max(200).optional().describe('Short topic such as piercing age, cancellation, address, or aftercare.'),
            locationName: z.string().trim().min(1).max(120).optional().describe('Optional configured location name when a client asks about a specific location.'),
          }),
          execute: audit('get_studio_context', async (args: { query?: string; locationName?: string }) => getStudioContext(context, args)),
        }),
        search_services: tool({
          description: 'Discover active services that could satisfy a client request. Pass a concise natural-language service idea and optional free-form service type, category, or artist preference. Categories are tenant-defined; do not assume a fixed vocabulary. This tool does not return prices; use get_service_pricing for a known result.',
          parameters: z.object({
            query: z.string().trim().min(1).max(160).optional().describe('Short service idea, such as fine-line tattoo, nostril piercing, or jewelry change.'),
            serviceType: z.string().trim().min(1).max(80).optional().describe('Optional tenant-defined service type filter.'),
            category: z.string().trim().min(1).max(80).optional().describe('Optional free-form category filter.'),
            artistPreference: z.string().trim().min(1).max(100).optional().describe('Optional public artist name preference.'),
          }),
          execute: audit('search_services', async (args: { query?: string; serviceType?: string; category?: string; artistPreference?: string }) => {
            const result = await searchServices(context, args);
            servicesDiscovered = true;
            quoteEligible = result.some(service => service.requiresArtistApproval);
            return result;
          }),
        }),
        get_service_pricing: tool({
          description: 'Return configured flat, hourly, starting-at, or quote-required pricing for a service already identified by search_services. Call this in the current turn whenever answering service price or deposit questions, even if a previous assistant answer already quoted an amount. Use priceLabel and deposit.amountLabel as dollar amounts. Never guess or substitute studio-wide pricing.',
          parameters: z.object({ serviceId: z.string().uuid().describe('The serviceId returned by search_services.') }),
          execute: audit('get_service_pricing', async (args: { serviceId: string }) => getServicePricing(context, args.serviceId)),
        }),
        list_artists: tool({
          description: 'List public studio artists for a client asking who can perform a service or asking about another artist. Optionally filter using a serviceId returned by search_services. Does not reveal contact, login, or provider account details.',
          parameters: z.object({ serviceId: z.string().uuid().optional().describe('Optional serviceId from search_services.') }),
          execute: audit('list_artists', async (args: { serviceId?: string }) => listArtists(context, args.serviceId)),
        }),
        check_availability: tool({
          description: 'Read real open slots for a previously identified active service. Pass studio-local ISO calendar date(s), not a duration or provider details. The tool derives service duration, timezone, artist scope, and scheduling provider. This tool never creates a booking, hold, payment, or message.',
          parameters: availabilityToolParameters,
          execute: audit('check_availability', async (args: { serviceId: string; fromDate: string; toDate?: string; artistPreference?: string; timePeriod?: 'morning' | 'afternoon' | 'evening' }) => checkAvailability(context, approvedAvailabilityInput(args, approvedQuote))),
        }),
        get_client_appointments: tool({
          description: 'Read this conversation client\'s existing upcoming appointments when they ask about an existing booking, time, deposit status, or waiver. Use the returned appointmentId only with the corresponding existing deposit or waiver tool when the client requests that action.',
          parameters: z.object({}),
          execute: audit('get_client_appointments', async () => getClientAppointmentsForReceptionist(context)),
        }),
        ...(context.channel === 'WEB_TEST' || input.availabilityOnly ? {} : {
        confirm_quote_terms: tool({
          description: 'Present the recorded approved price and linked appointment time together and ask the client to confirm. Use before collecting a deposit for a custom quote. Do not create another booking.',
          parameters: z.object({}),
          execute: audit('confirm_quote_terms', async () => presentQuoteTerms()),
        }),
        accept_quote_terms: tool({
          description: 'Verify the client explicitly agreed to the previously presented approved price and appointment date. Only an ACCEPTED result permits a deposit request. If confirmation is missing, call confirm_quote_terms and wait for a new client reply.',
          parameters: z.object({}),
          execute: audit('accept_quote_terms', async () => {
            const accepted = await acceptApprovedQuote(context);
            if (accepted.status === 'ACCEPTED') quoteTermsPrompt = undefined;
            return accepted;
          }),
        }),
        request_artist_quote: tool({
          description: 'After collecting the tattoo idea, placement, approximate size and relevant style/reference details, request an artist estimate. Provide a concise factual summary using only client-provided details. The client will receive a short acknowledgment and AI will pause after delivery.',
          parameters: z.object({ summary: z.string().trim().min(1).max(1200) }),
          execute: audit('request_artist_quote', async (args: { summary: string }) => { if (approvedQuote) return { status: 'QUOTE_ALREADY_APPROVED' }; if (!quoteEligible) return { status: 'SERVICE_LOOKUP_REQUIRED' }; quoteSummary = args.summary; return { status: 'HANDOFF_PENDING', reply: 'Thanks! Let me get back to you with an estimate.' }; }),
        }),
        save_client_name: tool({
          description: 'Save the name this conversation client explicitly provides for their appointment. Never infer it from a phone number or invent a name. This does not change SMS consent.',
          parameters: z.object({ firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100).optional() }),
          execute: audit('save_client_name', async (args: { firstName: string; lastName?: string }) => saveClientName(context, args)),
        }),
        createBookingHold: tool({
          description: 'Create a booking only after the client explicitly selects one specific slot returned by check_availability. Pass its canonical startsAt as start. This existing booking action is distinct from the read-only availability lookup. Inspect depositRequired and do not create a deposit link unless it is true.',
          parameters: z.object({ serviceId: z.string().uuid(), start: z.string() }),
          execute: audit('createBookingHold', async (args: { serviceId: string; start: string }) => {
            const result = await createBookingHold(context, args);
            if (!('providerBookingId' in result)) return result;
            if (approvedQuote?.action === 'QUOTE_AI_SCHEDULING') await presentQuoteTerms();
            const { providerBookingId: _providerBookingId, ...clientResult } = result;
            return clientResult;
          }),
        }),
        create_deposit_request: tool({
          description: 'Provide the configured deposit request only when createBookingHold returned depositRequired=true. Square and Stripe return a hosted checkout link; manual Venmo returns the artist-configured handle and instructions with paymentStatus=AWAITING_MANUAL_CONFIRMATION. Never say a Venmo payment was received or confirmed.',
          parameters: z.object({ appointmentId: z.string().uuid() }),
          execute: audit('create_deposit_request', async (args: { appointmentId: string }) => {
            const quote = await getConversationQuote(context.organizationId, context.conversationId);
            if (quote?.appointmentId === args.appointmentId) {
              const agreement = await acceptApprovedQuote(context);
              if (agreement.status !== 'ACCEPTED' || !('depositRequired' in agreement)) return presentQuoteTerms();
              if (!agreement.depositRequired) {
                quoteTermsPrompt = 'You’re all set! No deposit is needed. See you then.';
                return { status: 'NO_DEPOSIT_REQUIRED', reply: quoteTermsPrompt };
              }
            }
            return createDepositRequest(context, args.appointmentId);
          }),
        }),
        getWaiverLink: tool({
          description: 'Return the existing waiver signing URL for an appointment when the client asks to complete its waiver.',
          parameters: z.object({ appointmentId: z.string().uuid() }),
          execute: audit('getWaiverLink', async (args: { appointmentId: string }) => {
            const result = await getWaiverLink(context, args.appointmentId);
            return { waiverUrl: result.waiverUrl };
          }),
        }),
        escalateToArtist: tool({
          description: 'Hand off uncertain, medical, legal, unusual, or artist-approval-required requests to the artist. Use when a human decision is needed; do not provide medical or legal advice.',
          parameters: z.object({ reason: z.string().min(1).max(500) }),
          execute: audit('escalateToArtist', async (args: { reason: string }) => escalate(context, args.reason)),
        }),
        }),
      };
    const result = await generateText({
      model: openai(modelName),
      system,
      messages: conversationMessages,
      maxSteps: 6,
      experimental_prepareStep: async ({ stepNumber }) => stepNumber === 0 && !input.availabilityOnly && context.channel !== 'WEB_TEST' && approvedQuote?.bookingId && explicitQuoteAgreement(input.message)
        ? { toolChoice: { type: 'tool', toolName: 'accept_quote_terms' } }
        : stepNumber === 0 && input.availabilityOnly && approvedQuote?.action === 'QUOTE_AI_SCHEDULING'
        ? { toolChoice: { type: 'tool', toolName: 'check_availability' } }
        : stepNumber === 0 && requiresServiceLookup(input.message)
        ? { toolChoice: { type: 'tool', toolName: 'search_services' } }
        : { experimental_activeTools: serviceScopedTools(Object.keys(tools) as Array<keyof typeof tools>, servicesDiscovered) },
      tools,
    });
    const reply = quoteTermsPrompt || (quoteSummary ? 'Thanks! Let me get back to you with an estimate.' : result.text || 'I’m going to have the artist take a look at this.');
    if (input.automationGuard && !await input.automationGuard()) return { error: 'The automated response is no longer current.', conversationId: conversation.id, mode: 'HUMAN' };
    const message = await sendMessage(context, reply, input.automationJobId, input.automationInboundVersion);
    if (quoteSummary || quoteTermsPrompt) await db.update(messages).set({ metadata: { ...(quoteTerms ? { quoteTerms } : {}), source: 'ai-receptionist', quoteSummary, ...(input.automationJobId ? { automationJobId: input.automationJobId } : {}), ...(input.automationInboundVersion == null ? {} : { automationInboundVersion: input.automationInboundVersion }) } }).where(and(eq(messages.id, message.id), eq(messages.conversationId, conversation.id)));
    await updateRun(runId, {
      success: true,
      latencyMs: Date.now() - startedAt,
      inputTokens: result.usage?.promptTokens ?? null,
      outputTokens: result.usage?.completionTokens ?? null,
    });
    return {
      reply,
      conversationId: conversation.id,
      messageId: message.id,
      mode: 'live',
      toolCalls: result.steps.flatMap(step => (step.toolCalls ?? []).flatMap(call => call?.toolName ? [call.toolName] : [])),
      toolResults: result.steps.flatMap(step => (step.toolResults ?? []).flatMap(toolResult => toolResult?.toolName ? [toolResult.toolName] : [])),
    };
  } catch (error) {
    const diagnostics = agentFailureDiagnostics(error);
    console.error(JSON.stringify({ event: 'maia_agent_failed', organizationId: context.organizationId, artistId: context.artistId, conversationId: context.conversationId, runId, automationJobId: input.automationJobId, ...diagnostics }));
    await updateRun(runId, { success: false, latencyMs: Date.now() - startedAt, error: JSON.stringify(diagnostics) });
    throw error;
  }
}
