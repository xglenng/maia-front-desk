import 'server-only';
import { and, desc, eq, gte, lt, or, isNull } from 'drizzle-orm';
import { db } from '@db/index';
import crypto from 'node:crypto';
import { appointments, artists, businessRules, clients, conversations, externalWaiverAssignments, externalWaiverForms, messages, organizations, payments, schedulingConnections, services, waiverTemplates } from '@db/schema';
import { createSchedulingBooking, getSchedulingAvailability, usesInternalScheduling } from '@/packages/scheduling/service';
import { SquareApiClient } from '@/packages/scheduling/square/client';
import { squareAccessToken } from '@/packages/scheduling/square/credentials';
import { presentAvailabilitySlot } from '@/packages/scheduling/presentation';
import { signWaiver } from '@/packages/auth/waiver-token';
import { ageOn, appendTrackingToken, selectWaiverForm } from '@waivers/selection';
import type { MaiaAgentContext } from './context-policy';

export type AgentContext = MaiaAgentContext;

export async function getClient(ctx: AgentContext) {
  const [client] = await db.select({ firstName: clients.firstName, lastName: clients.lastName })
    .from(clients).where(and(eq(clients.id, ctx.clientId), eq(clients.organizationId, ctx.organizationId)));
  if (!client) throw new Error('Client not found');
  return client;
}

export async function getClientAppointments(ctx: AgentContext) {
  const [organization, connection] = await Promise.all([
    db.select({ timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, ctx.organizationId))
      .limit(1),
    db.select({ locationTimezone: schedulingConnections.locationTimezone })
      .from(schedulingConnections)
      .where(and(
        eq(schedulingConnections.organizationId, ctx.organizationId),
        eq(schedulingConnections.artistId, ctx.artistId),
      ))
      .limit(1),
  ]);

  const timeZone =
    connection[0]?.locationTimezone ||
    organization[0]?.timezone ||
    'UTC';

  const rows = await db.select({
    id: appointments.id,
    serviceName: services.name,
    startsAt: appointments.startsAt,
    endsAt: appointments.endsAt,
    status: appointments.status,
    priceCents: appointments.priceCents,
    depositCents: appointments.depositCents,
    depositStatus: appointments.depositStatus,
  })
    .from(appointments)
    .leftJoin(services, eq(appointments.serviceId, services.id))
    .where(and(
      eq(appointments.organizationId, ctx.organizationId),
      eq(appointments.artistId, ctx.artistId),
      eq(appointments.clientId, ctx.clientId),
      gte(appointments.endsAt, new Date()),
    ))
    .orderBy(appointments.startsAt)
    .limit(10);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return rows.map(appointment => ({
    appointmentId: appointment.id,
    service: appointment.serviceName || 'Appointment',
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt.toISOString(),
    localStart: formatter.format(appointment.startsAt),
    status: appointment.status,
    priceCents: appointment.priceCents,
    depositRequired: Boolean(
      appointment.depositCents &&
      appointment.depositCents > 0 &&
      appointment.depositStatus !== 'PAID' &&
      appointment.depositStatus !== 'WAIVED'
    ),
    depositCents: appointment.depositCents ?? 0,
    depositStatus: appointment.depositStatus,
  }));
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

export async function getSlots(ctx: AgentContext, input: { serviceId?: string; durationMinutes: number; from: string; to: string }) {
  const [organization, connection] = await Promise.all([
    db.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, ctx.organizationId)).limit(1),
    db.select({ locationTimezone: schedulingConnections.locationTimezone }).from(schedulingConnections).where(and(eq(schedulingConnections.organizationId, ctx.organizationId), eq(schedulingConnections.artistId, ctx.artistId))).limit(1),
  ]);
  const timeZone = connection[0]?.locationTimezone || organization[0]?.timezone || 'UTC';
  const result = await getSchedulingAvailability(ctx.organizationId, ctx.artistId, { ...input, now: new Date() });
  if (result.status !== 'AVAILABLE') return result;
  return { ...result, slots: result.slots.map(slot => presentAvailabilitySlot(slot, timeZone)) };
}

export async function createBookingHold(ctx: AgentContext, input: { serviceId: string; start: string; depositCents?: number; priceCents?: number }) {
  const internalScheduling = await usesInternalScheduling(ctx.organizationId, ctx.artistId);
  const [service] = await db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.artistId, ctx.artistId), eq(services.organizationId, ctx.organizationId), eq(services.active, true)));
  if (!service) throw new Error('Service not found');
  const startsAt = new Date(input.start);
  if (!Number.isFinite(startsAt.getTime())) throw new Error('Invalid appointment start time.');
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

  // Financial amounts always come from Maia's configured service, never from
  // model-supplied tool arguments.
  const priceCents = service.basePriceCents ?? null;
  let depositCents: number | null = null;
  switch (service.depositType) {
    case 'FIXED':
      if (service.depositAmountCents != null && Number.isSafeInteger(service.depositAmountCents) && service.depositAmountCents > 0) {
        depositCents = service.depositAmountCents;
      }
      break;
    case 'PERCENT':
      if (priceCents != null && priceCents > 0 && service.depositPercent != null && Number.isSafeInteger(service.depositPercent) && service.depositPercent > 0 && service.depositPercent <= 100) {
        depositCents = Math.round(priceCents * service.depositPercent / 100);
      }
      break;
    case 'NONE':
    default:
      depositCents = null;
      break;
  }
  const depositRequired = depositCents != null && depositCents > 0;

  // Idempotency: reuse this client's existing unpaid intent for the same slot.
  const [existing] = await db.select().from(appointments).where(and(
    eq(appointments.organizationId, ctx.organizationId),
    eq(appointments.artistId, ctx.artistId),
    eq(appointments.clientId, ctx.clientId),
    eq(appointments.serviceId, service.id),
    eq(appointments.startsAt, startsAt),
    depositRequired ? eq(appointments.status, 'PAYMENT_PENDING') : eq(appointments.status, 'CONFIRMED'),
  )).limit(1);
  if (existing) {
    return {
      appointmentId: existing.id,
      start: existing.startsAt.toISOString(),
      end: existing.endsAt.toISOString(),
      providerBookingId: existing.providerBookingId ?? undefined,
      status: existing.status,
      depositRequired,
      depositCents: existing.depositCents ?? 0,
    };
  }

  // Re-check real availability before issuing a deposit link. PAYMENT_PENDING
  // rows intentionally do not block availability, so several clients may be
  // offered the same time until one deposit actually wins it.
  const availability = await getSchedulingAvailability(ctx.organizationId, ctx.artistId, {
    serviceId: service.id,
    durationMinutes: service.durationMinutes,
    from: startsAt.toISOString(),
    to: endsAt.toISOString(),
    now: new Date(),
  });
  const exactSlotAvailable = availability.status === 'AVAILABLE' && availability.slots.some(slot => new Date(slot.start).getTime() === startsAt.getTime());
  if (!exactSlotAvailable) throw new Error('That time is no longer available.');

  if (depositRequired) {
    const [appointment] = await db.insert(appointments).values({
      organizationId: ctx.organizationId,
      artistId: ctx.artistId,
      clientId: ctx.clientId,
      conversationId: ctx.conversationId,
      serviceId: service.id,
      startsAt,
      endsAt,
      status: 'PAYMENT_PENDING',
      priceCents,
      depositCents,
      depositStatus: 'PENDING',
      holdExpiresAt: null,
      schedulingProvider: internalScheduling ? 'INTERNAL' : 'SQUARE',
      providerBookingId: null,
      notes: 'Deposit link issued by AI receptionist. Slot is not reserved until payment succeeds.',
    }).returning();
    return {
      appointmentId: appointment.id,
      start: startsAt.toISOString(),
      end: endsAt.toISOString(),
      status: appointment.status,
      depositRequired: true,
      depositCents: depositCents ?? 0,
    };
  }

  // Services with no deposit still book immediately.
  if (!internalScheduling) {
    const idempotencyKey = crypto.createHash('sha256').update([ctx.organizationId, ctx.artistId, ctx.clientId, service.id, startsAt.toISOString()].join(':')).digest('hex');
    const result = await createSchedulingBooking(ctx.organizationId, ctx.artistId, { serviceId: service.id, clientId: ctx.clientId, start: startsAt.toISOString(), idempotencyKey });
    if (result.status !== 'BOOKED') throw new Error(result.message);
    const [appointment] = await db.transaction(async tx => {
      await tx.update(clients).set({ providerCustomerId: result.providerCustomerId, updatedAt: new Date() }).where(and(eq(clients.id, ctx.clientId), eq(clients.organizationId, ctx.organizationId)));
      return tx.insert(appointments).values({
        organizationId: ctx.organizationId, artistId: ctx.artistId, clientId: ctx.clientId, conversationId: ctx.conversationId, serviceId: service.id,
        startsAt: new Date(result.start), endsAt: new Date(result.end), status: 'CONFIRMED', priceCents,
        depositCents: null, depositStatus: 'WAIVED', holdExpiresAt: null, schedulingProvider: result.provider, providerBookingId: result.providerBookingId,
        notes: 'Created by AI receptionist through connected scheduling provider.'
      }).returning();
    });
    return { appointmentId: appointment.id, start: result.start, end: result.end, providerBookingId: result.providerBookingId, status: appointment.status, depositRequired: false, depositCents: 0 };
  }

  const [appointment] = await db.insert(appointments).values({
    organizationId: ctx.organizationId, artistId: ctx.artistId, clientId: ctx.clientId, conversationId: ctx.conversationId, serviceId: service.id,
    startsAt, endsAt, status: 'CONFIRMED', priceCents, depositCents: null, depositStatus: 'WAIVED', holdExpiresAt: null,
    schedulingProvider: 'INTERNAL', notes: 'Created by AI receptionist booking tool.'
  }).returning();
  return { appointmentId: appointment.id, start: startsAt.toISOString(), end: endsAt.toISOString(), status: appointment.status, depositRequired: false, depositCents: 0 };
}

export async function createDepositLink(ctx: AgentContext, appointmentId: string) {
  const [appointment] = await db.select()
    .from(appointments)
    .where(and(
      eq(appointments.id, appointmentId),
      eq(appointments.organizationId, ctx.organizationId),
      eq(appointments.artistId, ctx.artistId),
      eq(appointments.clientId, ctx.clientId),
    ))
    .limit(1);

  if (!appointment) throw new Error('Appointment not found.');

  if (appointment.status !== 'PAYMENT_PENDING') {
    throw new Error('This deposit link is no longer available. Please choose an available appointment time.');
  }

  if (!appointment.depositCents || appointment.depositCents <= 0) {
    throw new Error('No deposit is configured for this appointment.');
  }

  if (appointment.depositStatus === 'PAID') {
    throw new Error('The deposit for this appointment has already been paid.');
  }

  const [service] = appointment.serviceId
    ? await db.select()
        .from(services)
        .where(and(
          eq(services.id, appointment.serviceId),
          eq(services.organizationId, ctx.organizationId),
          eq(services.artistId, ctx.artistId),
        ))
        .limit(1)
    : [];

  if (service?.paymentProvider && service.paymentProvider !== 'SQUARE') {
    throw new Error(`Payment provider ${service.paymentProvider} is not supported yet.`);
  }

  const [connection] = await db.select()
    .from(schedulingConnections)
    .where(and(
      eq(schedulingConnections.organizationId, ctx.organizationId),
      eq(schedulingConnections.artistId, ctx.artistId),
      eq(schedulingConnections.provider, 'SQUARE'),
      eq(schedulingConnections.status, 'CONNECTED'),
    ))
    .limit(1);

  if (!connection?.locationId) {
    throw new Error('Square payments are not fully configured. Reconnect Square and select a location.');
  }

  // Reuse an existing pending Square checkout when one has already been
  // created for this appointment. This avoids generating duplicate links
  // when the AI retries the tool.
  const [existingPayment] = await db.select()
    .from(payments)
    .where(and(
      eq(payments.organizationId, ctx.organizationId),
      eq(payments.appointmentId, appointment.id),
      eq(payments.provider, 'square'),
      eq(payments.status, 'PENDING'),
    ))
    .orderBy(desc(payments.createdAt))
    .limit(1);

  if (existingPayment?.providerPaymentIntentId) {
    return {
      provider: 'SQUARE',
      url: existingPayment.providerPaymentIntentId,
      amountCents: appointment.depositCents,
      appointmentId: appointment.id,
    };
  }

  const client = new SquareApiClient(await squareAccessToken(connection));

  const link = await client.createPaymentLink({
    idempotencyKey: `maia-deposit-${appointment.id}`,
    locationId: connection.locationId,
    amountCents: appointment.depositCents,
    description: `${service?.name || 'Appointment'} deposit`,
    appointmentId: appointment.id,
  });

  await db.insert(payments).values({
    organizationId: ctx.organizationId,
    appointmentId: appointment.id,
    provider: 'square',
    providerCheckoutSessionId: link.orderId,
    providerCheckoutLinkId: link.id,
    // Temporary reuse of this nullable text field for the hosted checkout
    // URL. We'll replace this with explicit Square columns when we add the
    // webhook/payment-provider abstraction.
    providerPaymentIntentId: link.url,
    amountCents: appointment.depositCents,
    status: 'PENDING',
    currency: 'usd',
  });

  return {
    provider: 'SQUARE',
    url: link.url,
    amountCents: appointment.depositCents,
    appointmentId: appointment.id,
  };
}

export async function getWaiverLink(ctx: AgentContext, appointmentId: string) {
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
