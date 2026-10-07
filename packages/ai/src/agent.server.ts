import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { db } from '@db/index';
import { agentActions, agentRuns, artists, conversations, messages, organizations, schedulingConnections } from '@db/schema';
import { buildSystemPrompt } from '@ai/system-prompt';
import { shouldRunAi } from '@/packages/inbox/state';
import { createBookingHold, createDepositLink, escalate, getArtistContext, getClient, getClientAppointments, getServiceCatalog, getSlots, getWaiverLink, sendMessage } from './tools';
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
    const [run] = await db.insert(agentRuns).values({ conversationId: context.conversationId, model, success: true }).returning({ id: agentRuns.id });
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

export async function runMaiaAgent(context: MaiaAgentContext, input: { message: string; messageAlreadyStored?: boolean }): Promise<MaiaAgentResult | { error: string; conversationId: string; mode: 'HUMAN' | 'CLOSED' }> {
  const [artist] = await db.select().from(artists).where(and(eq(artists.id, context.artistId), eq(artists.organizationId, context.organizationId))).limit(1);
  const [conversation] = await db.select().from(conversations).where(and(
    eq(conversations.id, context.conversationId),
    eq(conversations.organizationId, context.organizationId),
    eq(conversations.artistId, context.artistId),
    eq(conversations.clientId, context.clientId),
  )).limit(1);
  if (!artist || !conversation) throw new Error('Agent context is no longer valid.');
  if (!shouldRunAi(conversation)) return { error: 'AI is paused for this conversation.', conversationId: conversation.id, mode: conversation.status === 'CLOSED' ? 'CLOSED' : 'HUMAN' };

  if (!input.messageAlreadyStored) await db.insert(messages).values({ conversationId: conversation.id, senderType: 'CLIENT', role: 'user', content: input.message });
  await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, conversation.id));

  const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const startedAt = Date.now();
  const runId = await auditRun(context, process.env.AI_PROVIDER === 'mock' ? 'mock' : modelName);

  try {
    if (process.env.AI_PROVIDER === 'mock' || !process.env.OPENAI_API_KEY) {
      const text = input.message.toLowerCase();
      const reply = text.includes('price') || text.includes('cost')
        ? 'Which service are you asking about? I need the service details to answer accurately.'
        : text.includes('book') || text.includes('appointment')
          ? 'Which service would you like to book, and what timing works for you?'
          : 'Which service are you interested in, and what would you like help with?';
      const message = await sendMessage(context, reply);
      await updateRun(runId, { success: true, latencyMs: Date.now() - startedAt });
      return { reply, conversationId: conversation.id, messageId: message.id, mode: 'mock' };
    }

    const { rules } = await getArtistContext(context);
    const serviceCatalog = await getServiceCatalog(context);
    const [[organization], [connection]] = await Promise.all([
      db.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, context.organizationId)).limit(1),
      db.select({ locationTimezone: schedulingConnections.locationTimezone }).from(schedulingConnections).where(and(eq(schedulingConnections.organizationId, context.organizationId), eq(schedulingConnections.artistId, context.artistId))).limit(1),
    ]);
    const providerTimezone = connection?.locationTimezone || organization?.timezone || 'UTC';
    const currentDateTime = new Intl.DateTimeFormat('en-US', { timeZone: providerTimezone, dateStyle: 'full', timeStyle: 'long' }).format(new Date());
    const system = buildSystemPrompt({
      artistName: artist.displayName,
      hourlyRateCents: artist.hourlyRateCents,
      minimumPriceCents: artist.minimumPriceCents,
      rules: rules.map(rule => rule.rule),
      services: serviceCatalog.map(service => {
        const pricing = [
          `${service.durationMinutes} minutes`,
          service.pricingType,
          service.basePriceCents != null ? `base $${(service.basePriceCents / 100).toFixed(2)}${service.startingAt ? ' starting at' : ''}` : null,
          service.hourlyRateCents != null ? `hourly $${(service.hourlyRateCents / 100).toFixed(2)}` : null,
        ].filter(Boolean).join(', ');
        return `[SERVICE_ID: ${service.id}] ${service.serviceType ? `${service.serviceType} - ` : ''}${service.name}${service.description ? ` (${service.description})` : ''}: ${pricing}`;
      }),
      currentDateTime,
      providerTimezone,
      channel: context.channel,
      responseLength: artist.responseLength,
    });

    const history = await db.select({ role: messages.role, content: messages.content })
      .from(messages).where(eq(messages.conversationId, conversation.id)).orderBy(desc(messages.createdAt)).limit(20);
    const conversationMessages = history.reverse().map(message => ({ role: message.role === 'assistant' ? 'assistant' as const : 'user' as const, content: message.content }));
    const audit = <TArgs extends unknown[], TResult>(name: string, execute: (...args: TArgs) => Promise<TResult>) => withAudit(runId, name, execute);

    const result = await generateText({
      model: openai(modelName),
      system,
      messages: conversationMessages,
      maxSteps: 6,
      tools: {
        getClient: tool({ description: 'Get the current client profile.', parameters: z.object({}), execute: audit('getClient', async () => getClient(context)) }),
        getServices: tool({ description: 'List active services offered by this provider.', parameters: z.object({}), execute: audit('getServices', async () => getServiceCatalog(context)) }),
        getClientAppointments: tool({
          description: 'Retrieve this client\'s existing upcoming appointments. Use this before answering questions about an existing booking, appointment time, booking status, deposit amount, deposit status, waiver, or when the client asks for a deposit or payment link again. Do not search availability or create another booking when the client is referring to an existing appointment. Use the returned appointmentId with createDepositLink or getWaiverLink.',
          parameters: z.object({}),
          execute: audit('getClientAppointments', async () => getClientAppointments(context)),
        }),
        getAvailableSlots: tool({
          description: 'Always use this before answering an availability or scheduling question when enough timing information exists. Check the full local date window when only a date is given. Pass the exact Maia SERVICE_ID and configured duration when the service is known. Results include canonical UTC start/end values plus localStart/localEnd display values in the configured timezone; use localStart/localEnd when describing times and retain start/end for booking. Preserve result status: AVAILABLE has returned slots, NO_AVAILABILITY means no matching times, NOT_CONFIGURED means availability is not configured, SERVICE_NOT_MAPPED means online availability for this service is not configured, and PROVIDER_ERROR means availability could not be verified. Never convert configuration or provider errors into NO_AVAILABILITY.',
          parameters: z.object({ serviceId: z.string().uuid().optional(), durationMinutes: z.number().int().positive().max(1440), from: z.string(), to: z.string() }),
          execute: audit('getAvailableSlots', async (args: { serviceId?: string; durationMinutes: number; from: string; to: string }) => getSlots(context, args)),
        }),
        createBookingHold: tool({
          description: 'Create a booking only after the client selects a specific returned availability slot. For internal scheduling this creates a temporary hold; for a connected provider it creates the provider booking using the canonical UTC slot. Never invent or reconstruct the start time. Inspect the returned depositRequired value. If depositRequired is false, the booking is complete and you must NOT call createDepositLink. If depositRequired is true, use createDepositLink to collect the required deposit.',
          parameters: z.object({ serviceId: z.string().uuid(), start: z.string(), depositCents: z.number().int().nonnegative().optional(), priceCents: z.number().int().nonnegative().optional() }),
          execute: audit('createBookingHold', async (args: { serviceId: string; start: string; depositCents?: number; priceCents?: number }) => createBookingHold(context, args)),
        }),
        createDepositLink: tool({
          description: 'Create the real Square-hosted deposit payment link only when createBookingHold returned depositRequired=true. Send the returned url to the client as their secure deposit payment link. Never call this tool when depositRequired=false or depositCents is zero.',
          parameters: z.object({ appointmentId: z.string().uuid() }),
          execute: audit('createDepositLink', async (args: { appointmentId: string }) => createDepositLink(context, args.appointmentId)),
        }),
        getWaiverLink: tool({ description: 'Get the current waiver signing URL for an appointment.', parameters: z.object({ appointmentId: z.string().uuid() }), execute: audit('getWaiverLink', async (args: { appointmentId: string }) => getWaiverLink(context, args.appointmentId)) }),
        escalateToArtist: tool({ description: 'Escalate uncertain, medical, legal, unusual, or artist-approval-required questions.', parameters: z.object({ reason: z.string().min(1) }), execute: audit('escalateToArtist', async (args: { reason: string }) => escalate(context, args.reason)) }),
      },
    });
    const reply = result.text || 'I’m going to have the artist take a look at this.';
    const message = await sendMessage(context, reply);
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
      toolCalls: result.steps.flatMap(step => step.toolCalls ?? []).map(call => call.toolName),
      toolResults: result.steps.flatMap(step => step.toolResults ?? []).map(toolResult => toolResult.toolName),
    };
  } catch (error) {
    const errorType = error instanceof Error ? error.name.slice(0, 100) : 'UnknownError';
    await updateRun(runId, { success: false, latencyMs: Date.now() - startedAt, error: errorType });
    throw error;
  }
}
