import { protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@db/index';
import { appointments, clients, messages, conversationEvents, conversations, schedulingConnections, serviceProviderMappings, services } from '@db/schema';
import { accessibleConversation } from '@/packages/inbox/server';
import { getConversationQuote } from '@/packages/inbox/quote-state.server';
import { approvedQuoteDeposit, matchesQuoteBooking, quoteActionSchema } from '@/packages/inbox/quote-policy';
import { squareClientForConnection } from '@/packages/scheduling/square/resources';
import { squareSafeNumber } from '@/packages/scheduling/square/client';
import { cancelUndeliveredAiResponses, enqueueAiResponse } from '@/packages/automations/queue.server';

type Context = { params: Promise<{ id: string }> };
async function handlePOST(request: NextRequest, { params }: Context) {
  const { id } = await params;
  const access = await accessibleConversation(request, id);
  if (!access.ok) return access.error;
  const parsed = quoteActionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid service, quote, duration, or booking ID.' }, { status: 400 });
  const org = access.user.organization_id;
  const artistId = access.row.conversation.artistId;
  const action = parsed.data;
  let details: Record<string, unknown>;
  let eventAction: string;
  if (action.action === 'APPROVE') {
    const [service] = await db.select().from(services).where(and(eq(services.id, action.serviceId), eq(services.organizationId, org), eq(services.artistId, artistId), eq(services.active, true))).limit(1);
    if (!service || service.pricingType !== 'QUOTE') return NextResponse.json({ error: 'Choose an active quote-based service for this artist.' }, { status: 400 });
    const current = await getConversationQuote(org, id);
    if (current && !['QUOTE_APPROVED', 'QUOTE_AI_SCHEDULING'].includes(current.action)) return NextResponse.json({ error: 'This request is already booked.' }, { status: 409 });
    details = { serviceId: service.id, serviceName: service.name, priceCents: action.priceCents, durationMinutes: action.durationMinutes };
    eventAction = 'QUOTE_APPROVED';
  } else if (action.action === 'AI_SCHEDULE' || action.action === 'MANUAL_SCHEDULE') {
    const quote = await getConversationQuote(org, id);
    if (!quote || !['QUOTE_APPROVED', 'QUOTE_AI_SCHEDULING'].includes(quote.action)) return NextResponse.json({ error: 'Save an approved quote before choosing how to schedule.' }, { status: 409 });
    if (action.action === 'AI_SCHEDULE' && quote.action === 'QUOTE_AI_SCHEDULING') return NextResponse.json({ ok: true });
    if (action.action === 'AI_SCHEDULE') {
      const [connection] = await db.select().from(schedulingConnections).where(and(eq(schedulingConnections.organizationId, org), eq(schedulingConnections.artistId, artistId), eq(schedulingConnections.provider, 'SQUARE'), eq(schedulingConnections.status, 'CONNECTED'))).limit(1);
      const [mapping] = connection?.locationId ? await db.select().from(serviceProviderMappings).where(and(eq(serviceProviderMappings.organizationId, org), eq(serviceProviderMappings.artistId, artistId), eq(serviceProviderMappings.serviceId, quote.serviceId), eq(serviceProviderMappings.schedulingConnectionId, connection.id), eq(serviceProviderMappings.locationId, connection.locationId))).limit(1) : [];
      if (!connection || !mapping) return NextResponse.json({ error: 'Map this tattoo service to Square in Settings → Scheduling first.' }, { status: 409 });
      try {
        const square = await squareClientForConnection(connection);
        const variations = await square.listServiceVariations();
        if (variations.find(variation => variation.id === mapping.externalServiceVariationId)?.durationMinutes !== quote.durationMinutes) return NextResponse.json({ error: `Map this service to a ${quote.durationMinutes}-minute Square variation before AI scheduling, or book manually.` }, { status: 409 });
      } catch { return NextResponse.json({ error: 'Could not verify the mapped Square service duration.' }, { status: 502 }); }
    }
    details = { ...quote };
    eventAction = action.action === 'AI_SCHEDULE' ? 'QUOTE_AI_SCHEDULING' : 'QUOTE_APPROVED';
  } else {
    const quote = await getConversationQuote(org, id);
    if (!quote) return NextResponse.json({ error: 'Record the approved quote and duration first.' }, { status: 409 });
    if (quote.action !== 'QUOTE_APPROVED') return quote.bookingId === action.bookingId ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'This request already has a linked booking.' }, { status: 409 });
    const [connection] = await db.select().from(schedulingConnections).where(and(eq(schedulingConnections.organizationId, org), eq(schedulingConnections.artistId, artistId), eq(schedulingConnections.provider, 'SQUARE'), eq(schedulingConnections.status, 'CONNECTED'))).limit(1);
    if (!connection?.locationId || !connection.teamMemberId) return NextResponse.json({ error: 'Configure the artist’s Square location and team member before linking.' }, { status: 409 });
    try {
      const square = await squareClientForConnection(connection);
      const booking = await square.retrieveBooking(action.bookingId);
      if (!booking || booking.status !== 'ACCEPTED' || booking.location_id !== connection.locationId || !booking.customer_id || !booking.appointment_segments?.length || booking.appointment_segments.some(segment => segment.team_member_id !== connection.teamMemberId)) return NextResponse.json({ error: 'Booking must be accepted at this artist’s configured Square location and team member.' }, { status: 400 });
      const customer = await square.retrieveCustomer(booking.customer_id);
      const duration = booking.appointment_segments.reduce((sum, segment) => sum + (squareSafeNumber(segment.duration_minutes) || 0), 0);
      if (!matchesQuoteBooking({ status: booking.status, locationId: booking.location_id, expectedLocation: connection.locationId, teamMembers: booking.appointment_segments.map(segment => segment.team_member_id), expectedTeam: connection.teamMemberId, customerId: booking.customer_id, expectedCustomerId: access.row.client.providerCustomerId, customerPhone: customer?.phone_number, clientPhone: access.row.client.phone, duration, expectedDuration: quote.durationMinutes })) return NextResponse.json({ error: 'Square booking must match this client, artist, location and approved duration.' }, { status: 400 });
      const start = new Date(booking.start_at || '');
      if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now() || duration !== quote.durationMinutes) return NextResponse.json({ error: 'Square booking duration must match the approved quote.' }, { status: 400 });
      details = { ...quote, bookingId: booking.id, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + duration * 60000).toISOString() };
      eventAction = 'QUOTE_BOOKING_LINKED';
    } catch { return NextResponse.json({ error: 'Could not verify the Square booking. Check its ID and Square connection permissions.' }, { status: 502 }); }
  }
  let schedulingEventId: string | undefined;
  try { await db.transaction(async tx => {
    await tx.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, id), eq(conversations.organizationId, org))).for('update');
    const [latest] = await tx.select().from(conversationEvents).where(and(eq(conversationEvents.organizationId, org), eq(conversationEvents.conversationId, id), inArray(conversationEvents.action, ['QUOTE_REQUESTED', 'QUOTE_APPROVED', 'QUOTE_AI_SCHEDULING', 'QUOTE_BOOKING_LINKED', 'QUOTE_ACCEPTED']))).orderBy(desc(conversationEvents.createdAt)).limit(1);
    if (latest?.action === 'QUOTE_BOOKING_LINKED' || latest?.action === 'QUOTE_ACCEPTED') throw new Error('QUOTE_CHANGED');
    if ((action.action === 'AI_SCHEDULE' || action.action === 'MANUAL_SCHEDULE') && (!latest || !['QUOTE_APPROVED', 'QUOTE_AI_SCHEDULING'].includes(latest.action) || (latest.details as { priceCents?: number })?.priceCents !== details.priceCents || (latest.details as { durationMinutes?: number })?.durationMinutes !== details.durationMinutes || (latest.details as { serviceId?: string })?.serviceId !== details.serviceId)) throw new Error('QUOTE_CHANGED');
    if (action.action === 'LINK_BOOKING' && (latest?.action !== 'QUOTE_APPROVED' || (latest.details as { serviceId?: string; durationMinutes?: number; priceCents?: number })?.serviceId !== details.serviceId || (latest.details as { durationMinutes?: number })?.durationMinutes !== details.durationMinutes || (latest.details as { priceCents?: number })?.priceCents !== details.priceCents)) throw new Error('QUOTE_CHANGED');
    if (eventAction === 'QUOTE_BOOKING_LINKED') {
      const [service] = await tx.select().from(services).where(and(eq(services.id, String(details.serviceId)), eq(services.organizationId, org), eq(services.artistId, artistId))).limit(1);
      if (!service) throw new Error('SERVICE_CHANGED');
      const depositCents = approvedQuoteDeposit(Number(details.priceCents), service);
      const [existing] = await tx.select().from(appointments).where(and(eq(appointments.organizationId, org), eq(appointments.schedulingProvider, 'SQUARE'), eq(appointments.providerBookingId, String(details.bookingId)))).limit(1);
      if (existing && (existing.clientId !== access.row.client.id || existing.artistId !== artistId || existing.conversationId !== id)) throw new Error('BOOKING_ALREADY_LINKED');
      const appointment = existing || (await tx.insert(appointments).values({ organizationId: org, artistId, clientId: access.row.client.id, conversationId: id, serviceId: service.id, startsAt: new Date(String(details.startsAt)), endsAt: new Date(String(details.endsAt)), priceCents: Number(details.priceCents), depositCents: depositCents || null, depositStatus: depositCents ? 'PENDING' : 'WAIVED', status: depositCents ? 'PAYMENT_PENDING' : 'CONFIRMED', paymentProvider: service.paymentProvider, schedulingProvider: 'SQUARE', providerBookingId: String(details.bookingId), notes: 'Artist-approved custom quote, linked to an existing Square booking.' }).returning())[0];
      details.appointmentId = appointment.id;
    }
    await tx.update(conversations).set({ aiEnabled: eventAction === 'QUOTE_AI_SCHEDULING', status: eventAction === 'QUOTE_AI_SCHEDULING' ? 'OPEN' : eventAction === 'QUOTE_BOOKING_LINKED' ? 'BOOKING_LINKED' : 'QUOTE_APPROVED', humanTakeoverAt: new Date(), humanTakeoverByUserId: access.user.id, updatedAt: new Date() }).where(and(eq(conversations.id, id), eq(conversations.organizationId, org)));
    const [savedEvent] = await tx.insert(conversationEvents).values({ organizationId: org, conversationId: id, userId: access.user.id, action: eventAction, fromMode: access.row.conversation.aiEnabled ? 'AI' : 'HUMAN', toMode: eventAction === 'QUOTE_AI_SCHEDULING' ? 'AI' : 'HUMAN', details }).returning({ id: conversationEvents.id });
    schedulingEventId = savedEvent.id;
  }); } catch { return NextResponse.json({ error: 'The quote changed while saving. Refresh and try again.' }, { status: 409 }); }
  if (eventAction !== 'QUOTE_AI_SCHEDULING') await cancelUndeliveredAiResponses(id, 'HUMAN_TAKEOVER');
  else if (schedulingEventId && ['SMS', 'FACEBOOK', 'INSTAGRAM'].includes(access.row.conversation.channel)) {
    const [latestInbound] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.conversationId, id), eq(messages.senderType, 'CLIENT'))).orderBy(desc(messages.createdAt)).limit(1);
    if (latestInbound) await enqueueAiResponse({ organizationId: org, artistId, clientId: access.row.client.id, conversationId: id, channel: access.row.conversation.channel as 'SMS' | 'FACEBOOK' | 'INSTAGRAM', latestInboundMessageId: latestInbound.id, latestInboundVersion: access.row.conversation.inboundVersion, delaySeconds: 0, quoteEventId: schedulingEventId });
  }
  return NextResponse.json({ ok: true });
}

export const POST = protectedRoute(handlePOST, false);
