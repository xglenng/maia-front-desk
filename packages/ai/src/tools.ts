import { and, desc, eq, gte, lt, or, isNull } from 'drizzle-orm';
import { db } from '@db/index';
import crypto from 'node:crypto';
import { appointments, artistConsentForms, artists, availabilityRules, businessRules, clients, conversations, externalWaiverAssignments, externalWaiverForms, messages, services, waiverTemplates } from '@db/schema';
import { getAvailableSlots } from '@booking/index';
import { createDepositCheckout } from '@integrations/index';
import { signWaiver } from '@/packages/auth/waiver-token';
import { ageOn, appendTrackingToken, selectWaiverForm } from '@waivers/selection';

export type AgentContext = {
  organizationId: string;
  artistId: string;
  conversationId: string;
  clientId: string;
};

export async function getClient(ctx: AgentContext) {
  const [client] = await db.select().from(clients).where(and(eq(clients.id, ctx.clientId), eq(clients.organizationId, ctx.organizationId)));
  if (!client) throw new Error('Client not found');
  return client;
}

export async function getArtistContext(ctx: AgentContext) {
  const [artist] = await db.select().from(artists).where(and(eq(artists.id, ctx.artistId), eq(artists.organizationId, ctx.organizationId)));
  if (!artist) throw new Error('Artist not found');
  const rules = await db.select().from(businessRules).where(and(eq(businessRules.artistId, ctx.artistId), eq(businessRules.organizationId, ctx.organizationId), eq(businessRules.active, true))).orderBy(desc(businessRules.priority));
  return { artist, rules };
}

export async function getServiceCatalog(ctx: AgentContext) {
  return db.select().from(services).where(and(eq(services.artistId, ctx.artistId), eq(services.organizationId, ctx.organizationId), eq(services.active, true)));
}

export async function getSlots(ctx: AgentContext, input: { durationMinutes: number; from: string; to: string }) {
  const from = new Date(input.from);
  const to = new Date(input.to);
  if (to <= from) throw new Error('The availability window must end after it starts.');
  const rules = await db.select().from(availabilityRules).where(and(eq(availabilityRules.organizationId, ctx.organizationId), eq(availabilityRules.artistId, ctx.artistId), eq(availabilityRules.active, true)));
  const now = new Date();
  const busyRows = await db.select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt }).from(appointments).where(and(
    eq(appointments.organizationId, ctx.organizationId), eq(appointments.artistId, ctx.artistId), lt(appointments.startsAt, to), gte(appointments.endsAt, from),
    or(eq(appointments.status, 'CONFIRMED'), eq(appointments.status, 'COMPLETED'), and(or(eq(appointments.status, 'TENTATIVE'), eq(appointments.status, 'AI_HOLD')), or(isNull(appointments.holdExpiresAt), gte(appointments.holdExpiresAt, now))))
  ));
  const slots = getAvailableSlots(rules, busyRows, { from, to, durationMinutes: input.durationMinutes, slotIntervalMinutes: 30 });
  return slots.slice(0, 20).map(slot => ({ start: slot.startsAt.toISOString(), end: slot.endsAt.toISOString() }));
}

async function requireOngoingSmsConsent(ctx: AgentContext) {
  const [conversation] = await db.select({ channel: conversations.channel }).from(conversations).where(and(eq(conversations.id, ctx.conversationId), eq(conversations.organizationId, ctx.organizationId))).limit(1);
  if (conversation?.channel !== 'SMS') return;
  const [client] = await db.select({ smsOptIn: clients.smsOptIn }).from(clients).where(and(eq(clients.id, ctx.clientId), eq(clients.organizationId, ctx.organizationId))).limit(1);
  if (client?.smsOptIn) return;
  const [surface] = await db.select({ mode: artistConsentForms.mode, confirmationText: artistConsentForms.confirmationText }).from(artistConsentForms).where(and(eq(artistConsentForms.organizationId, ctx.organizationId), eq(artistConsentForms.artistId, ctx.artistId))).limit(1);
  throw new Error(surface?.mode === 'INBOUND_SMS_CONFIRMATION' && surface.confirmationText ? `Explicit SMS consent is required first. Send this exact request and wait for a separate YES reply: ${surface.confirmationText}` : 'Explicit SMS consent is required before booking or sending links.');
}

export async function createBookingHold(ctx: AgentContext, input: { serviceId: string; start: string; depositCents?: number; priceCents?: number }) {
  await requireOngoingSmsConsent(ctx);
  const [service] = await db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.artistId, ctx.artistId), eq(services.organizationId, ctx.organizationId), eq(services.active, true)));
  if (!service) throw new Error('Service not found');
  const startsAt = new Date(input.start);
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
  const now = new Date();
  const conflicts = await db.select({ id: appointments.id }).from(appointments).where(and(
    eq(appointments.organizationId, ctx.organizationId), eq(appointments.artistId, ctx.artistId), lt(appointments.startsAt, endsAt), gte(appointments.endsAt, startsAt),
    or(eq(appointments.status, 'CONFIRMED'), eq(appointments.status, 'COMPLETED'), and(or(eq(appointments.status, 'TENTATIVE'), eq(appointments.status, 'AI_HOLD')), or(isNull(appointments.holdExpiresAt), gte(appointments.holdExpiresAt, now))))
  ));
  if (conflicts.length) throw new Error('That time is no longer available.');
  const holdExpiresAt = new Date(now.getTime() + 10 * 60_000);
  const [appointment] = await db.insert(appointments).values({
    organizationId: ctx.organizationId, artistId: ctx.artistId, clientId: ctx.clientId, serviceId: service.id,
    startsAt, endsAt, status: 'AI_HOLD', priceCents: input.priceCents ?? service.basePriceCents ?? null,
    depositCents: input.depositCents ?? null, depositStatus: 'PENDING', holdExpiresAt,
    notes: 'Created by AI receptionist booking tool.'
  }).returning();
  return { appointmentId: appointment.id, start: startsAt.toISOString(), end: endsAt.toISOString(), expiresAt: holdExpiresAt.toISOString() };
}

export async function createDepositLink(ctx: AgentContext, appointmentId: string) {
  await requireOngoingSmsConsent(ctx);
  const [row] = await db.select({ appointment: appointments, client: clients }).from(appointments).innerJoin(clients, eq(appointments.clientId, clients.id)).where(and(eq(appointments.id, appointmentId), eq(appointments.organizationId, ctx.organizationId), eq(appointments.artistId, ctx.artistId)));
  if (!row || row.appointment.clientId !== ctx.clientId) throw new Error('Appointment not found');
  const { appointment, client } = row;
  if (appointment.status !== 'AI_HOLD' && appointment.status !== 'TENTATIVE') throw new Error('Appointment is not awaiting a deposit.');
  if (!appointment.depositCents || appointment.depositCents <= 0) throw new Error('No deposit is configured for this appointment.');
  if (appointment.holdExpiresAt && appointment.holdExpiresAt < new Date()) throw new Error('Booking hold has expired.');
  const session = await createDepositCheckout({ appointmentId, organizationId: ctx.organizationId, amountCents: appointment.depositCents, customerEmail: client.email,
    successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/?payment=success&appointment=${appointmentId}`,
    cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/?payment=cancelled&appointment=${appointmentId}` });
  return { checkoutUrl: session.url, appointmentId, expiresAt: appointment.holdExpiresAt?.toISOString() ?? null };
}

export async function getWaiverLink(ctx: AgentContext, appointmentId: string) {
  await requireOngoingSmsConsent(ctx);
  const [appointment] = await db.select().from(appointments).where(and(eq(appointments.id,appointmentId),eq(appointments.organizationId,ctx.organizationId),eq(appointments.artistId,ctx.artistId),eq(appointments.clientId,ctx.clientId)));
  if(!appointment)throw new Error('Appointment not found');
  const [client] = await db.select().from(clients).where(and(eq(clients.id, ctx.clientId), eq(clients.organizationId, ctx.organizationId)));
  const externalForms = await db.select().from(externalWaiverForms).where(and(eq(externalWaiverForms.organizationId, ctx.organizationId), eq(externalWaiverForms.active, true)));
  const age = ageOn(client?.dateOfBirth ?? null, appointment.startsAt);
  const external = selectWaiverForm(externalForms, { artistId: ctx.artistId, serviceId: appointment.serviceId, isMinor: age == null ? null : age < 18 });
  if (external) {
    const token = crypto.randomBytes(24).toString('hex');
    const [assignment] = await db.insert(externalWaiverAssignments).values({ organizationId: ctx.organizationId, waiverFormId: external.id, appointmentId, clientId: ctx.clientId, trackingTokenHash: crypto.createHash('sha256').update(token).digest('hex'), status: 'LINK_CREATED', dueAt: new Date(Math.max(Date.now(), appointment.startsAt.getTime() - 24 * 60 * 60 * 1000)) }).returning();
    return { waiverUrl: appendTrackingToken(external.formUrl, token), externalWaiverFormId: external.id, assignmentId: assignment.id, provider: external.provider };
  }
  const [template] = await db.select().from(waiverTemplates).where(and(eq(waiverTemplates.organizationId, ctx.organizationId), eq(waiverTemplates.active, true))).orderBy(desc(waiverTemplates.version)).limit(1);
  if (!template) throw new Error('No active waiver template is configured.');
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/waiver?organizationId=${encodeURIComponent(ctx.organizationId)}&appointmentId=${encodeURIComponent(appointmentId)}&clientId=${encodeURIComponent(ctx.clientId)}&waiverTemplateId=${encodeURIComponent(template.id)}`;
  const access=signWaiver({organizationId:ctx.organizationId,appointmentId,clientId:ctx.clientId,waiverTemplateId:template.id,expires:Date.now()+7*86400000});
  return { waiverUrl: `${url}&access=${encodeURIComponent(access)}`, waiverTemplateId: template.id, version: template.version };
}

export async function sendMessage(ctx: AgentContext, content: string) {
  const [message] = await db.insert(messages).values({ conversationId: ctx.conversationId, senderType: 'AI', role: 'assistant', content, metadata: { source: 'ai-receptionist' } }).returning();
  await db.update(conversations).set({ lastMessageAt: new Date() }).where(eq(conversations.id, ctx.conversationId));
  return message;
}

export async function escalate(ctx: AgentContext, reason: string) {
  await db.update(conversations).set({ status: 'ESCALATED', aiEnabled: false, lastMessageAt: new Date() }).where(and(eq(conversations.id, ctx.conversationId), eq(conversations.organizationId, ctx.organizationId)));
  const [message] = await db.insert(messages).values({ conversationId: ctx.conversationId, senderType: 'SYSTEM', role: 'system', content: `Conversation escalated to artist: ${reason}`, metadata: { reason } }).returning();
  return message;
}
