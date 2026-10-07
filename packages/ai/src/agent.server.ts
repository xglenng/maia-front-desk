import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { db } from '@db/index';
import { agentActions, agentRuns, artists, conversations, messages } from '@db/schema';
import { buildSystemPrompt } from '@ai/system-prompt';
import { shouldRunAi } from '@/packages/inbox/state';
import { createBookingHold, createDepositLink, escalate, getClient, getContextTimezone, getWaiverLink, sendMessage } from './tools';
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

export async function runMaiaAgent(context: MaiaAgentContext, input: { message: string; messageAlreadyStored?: boolean; automationGuard?: () => Promise<boolean>; automationJobId?: string; automationInboundVersion?: number }): Promise<MaiaAgentResult | { error: string; conversationId: string; mode: 'HUMAN' | 'CLOSED' }> {
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
    });

    const history = await db.select({ role: messages.role, content: messages.content })
      .from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(desc(messages.createdAt)).limit(20);
    const conversationMessages = history.reverse().map(message => ({ role: message.role === 'assistant' ? 'assistant' as const : 'user' as const, content: message.content }));
    const audit = <TArgs extends unknown[], TResult>(name: string, execute: (...args: TArgs) => Promise<TResult>) => withAudit(runId, name, async (...args: TArgs) => {
      if (input.automationGuard && !await input.automationGuard()) throw new Error('AUTOMATION_SUPPRESSED');
      return execute(...args);
    });

    const result = await generateText({
      model: openai(modelName),
      system,
      messages: conversationMessages,
      maxSteps: 6,
      tools: {
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
          execute: audit('search_services', async (args: { query?: string; serviceType?: string; category?: string; artistPreference?: string }) => searchServices(context, args)),
        }),
        get_service_pricing: tool({
          description: 'Return configured flat, hourly, starting-at, or quote-required pricing for a service already identified by search_services. Never guess or substitute studio-wide pricing.',
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
          parameters: z.object({
            serviceId: z.string().uuid().describe('The selected serviceId returned by search_services.'),
            fromDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).describe('Inclusive start date in YYYY-MM-DD format, interpreted in the selected studio timezone.'),
            toDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional().describe('Optional inclusive end date; the complete range may span at most 31 calendar days.'),
            artistPreference: z.string().trim().min(1).max(100).optional().describe('Optional public artist name, normally selected from list_artists.'),
            timePeriod: z.enum(['morning', 'afternoon', 'evening']).optional().describe('Optional local slot-start preference: morning 06:00-12:00, afternoon 12:00-17:00, evening 17:00-22:00.'),
          }),
          execute: audit('check_availability', async (args: { serviceId: string; fromDate: string; toDate?: string; artistPreference?: string; timePeriod?: 'morning' | 'afternoon' | 'evening' }) => checkAvailability(context, args)),
        }),
        get_client_appointments: tool({
          description: 'Read this conversation client\'s existing upcoming appointments when they ask about an existing booking, time, deposit status, or waiver. Use the returned appointmentId only with the corresponding existing deposit or waiver tool when the client requests that action.',
          parameters: z.object({}),
          execute: audit('get_client_appointments', async () => getClientAppointmentsForReceptionist(context)),
        }),
        ...(context.channel === 'WEB_TEST' ? {} : {
        createBookingHold: tool({
          description: 'Create a booking only after the client explicitly selects one specific slot returned by check_availability. Pass its canonical startsAt as start. This existing booking action is distinct from the read-only availability lookup. Inspect depositRequired and do not create a deposit link unless it is true.',
          parameters: z.object({ serviceId: z.string().uuid(), start: z.string() }),
          execute: audit('createBookingHold', async (args: { serviceId: string; start: string }) => {
            const result = await createBookingHold(context, args);
            const { providerBookingId: _providerBookingId, ...clientResult } = result;
            return clientResult;
          }),
        }),
        createDepositLink: tool({
          description: 'Create the existing Square deposit link only when createBookingHold returned depositRequired=true. Never call for a no-deposit or already-paid booking.',
          parameters: z.object({ appointmentId: z.string().uuid() }),
          execute: audit('createDepositLink', async (args: { appointmentId: string }) => {
            const result = await createDepositLink(context, args.appointmentId);
            return { url: result.url, amountCents: result.amountCents, appointmentId: result.appointmentId };
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
      },
    });
    const reply = result.text || 'I’m going to have the artist take a look at this.';
    if (input.automationGuard && !await input.automationGuard()) return { error: 'The automated response is no longer current.', conversationId: conversation.id, mode: 'HUMAN' };
    const message = await sendMessage(context, reply, input.automationJobId, input.automationInboundVersion);
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
    await updateRun(runId, { success: false, latencyMs: Date.now() - startedAt, error: 'AgentExecutionError' });
    throw error;
  }
}
