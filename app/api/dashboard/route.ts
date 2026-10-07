import { identity, protectedRoute } from '@/packages/auth/server';
import { NextRequest, NextResponse } from "next/server";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@db/index";
import { artists, clients, conversations, messages, appointments, services, organizations } from "@db/schema";
import { localDateTimeToUtc } from '@/packages/scheduling/square/time';
import { canAccessArtist } from '@/packages/inbox/state';
import { ONBOARDING_PREVIEW_CLIENT_NOTE } from '@/packages/onboarding/readiness';

function dayBounds(dateParam: string | null, timezone: string) {
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : new Date().toISOString().slice(0, 10);

  const start = localDateTimeToUtc(`${date}T00:00:00`, timezone);

  // Advance the calendar date first, then convert the next local midnight
  // to UTC. This keeps the range correct across DST transitions.
  const nextLocalDate = new Date(`${date}T12:00:00Z`);
  nextLocalDate.setUTCDate(nextLocalDate.getUTCDate() + 1);
  const nextDate = nextLocalDate.toISOString().slice(0, 10);
  const end = localDateTimeToUtc(`${nextDate}T00:00:00`, timezone);

  return { date, start, end };
}

async function handleGET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const requestedArtistId = searchParams.get('artistId');
    if (!organizationId) return NextResponse.json({ error: 'Organization context is required.' }, { status: 400 });
    const user = await identity(request);
    if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    const artistConditions = [eq(artists.organizationId, organizationId)];
    if (requestedArtistId) artistConditions.push(eq(artists.id, requestedArtistId));
    else if (user.role === 'ARTIST') artistConditions.push(eq(artists.userId, user.id));
    const [artist] = await db.select({
      id: artists.id, organizationId: artists.organizationId, displayName: artists.displayName,
      aiMode: artists.aiMode, bookingEnabled: artists.bookingEnabled,
    }).from(artists).where(and(...artistConditions)).orderBy(asc(artists.displayName)).limit(1);

    if (!artist) return NextResponse.json({ error: "No artist profile is configured for this studio yet.", setupUrl: '/settings/studio' }, { status: 404 });
    const [artistAccess] = await db.select({ userId: artists.userId }).from(artists)
      .where(and(eq(artists.id, artist.id), eq(artists.organizationId, organizationId))).limit(1);
    if (!canAccessArtist(user.role, user.id, artistAccess?.userId ?? null)) {
      return NextResponse.json({ error: 'Artist access is not authorized.' }, { status: 403 });
    }

    const [org] = await db.select({ name: organizations.name, timezone: organizations.timezone })
      .from(organizations).where(eq(organizations.id, artist.organizationId)).limit(1);

    const { date, start, end } = dayBounds(
      searchParams.get("date"),
      org?.timezone || 'UTC',
    );

    const todayAppointments = await db.select({
      id: appointments.id, startsAt: appointments.startsAt, endsAt: appointments.endsAt, status: appointments.status,
      priceCents: appointments.priceCents, depositCents: appointments.depositCents, depositStatus: appointments.depositStatus,
      clientFirstName: clients.firstName, clientLastName: clients.lastName, serviceName: services.name,
    }).from(appointments)
      .innerJoin(clients, eq(appointments.clientId, clients.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(and(eq(appointments.organizationId, organizationId), eq(appointments.artistId, artist.id), gte(appointments.startsAt, start), lt(appointments.startsAt, end)))
      .orderBy(asc(appointments.startsAt));

    const recentConversations = await db.select({
      id: conversations.id, clientFirstName: clients.firstName, clientLastName: clients.lastName,
      status: conversations.status, aiEnabled: conversations.aiEnabled, unreadCount: conversations.unreadCount, lastMessageAt: conversations.lastMessageAt,
    }).from(conversations)
      .innerJoin(clients, eq(conversations.clientId, clients.id))
      .where(and(eq(conversations.organizationId, organizationId), eq(conversations.artistId, artist.id), ne(conversations.channel, 'WEB_TEST')))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(10);

    const conversationIds = recentConversations.map(c => c.id);
    const latestMessages = conversationIds.length ? await db.select({
      conversationId: messages.conversationId, content: messages.content, createdAt: messages.createdAt,
    }).from(messages).where(inArray(messages.conversationId, conversationIds)) : [];

    const allClients = await db.select({
      id: clients.id, firstName: clients.firstName, lastName: clients.lastName, email: clients.email, phone: clients.phone, createdAt: clients.createdAt,
    }).from(clients).where(and(eq(clients.organizationId, artist.organizationId), or(isNull(clients.notes), ne(clients.notes, ONBOARDING_PREVIEW_CLIENT_NOTE)))).orderBy(desc(clients.createdAt)).limit(100);

    const [allApptCount, bookedAppts, collectedAppts, clientCount] = await Promise.all([
      db.select({ count: count() }).from(appointments).where(and(eq(appointments.organizationId, organizationId), eq(appointments.artistId, artist.id), gte(appointments.startsAt, start), lt(appointments.startsAt, end))),
      db.select({ count: count() }).from(appointments).where(and(eq(appointments.organizationId, organizationId), eq(appointments.artistId, artist.id), eq(appointments.status, "CONFIRMED"))),
      db.select({ count: count() }).from(appointments).where(and(eq(appointments.organizationId, organizationId), eq(appointments.artistId, artist.id), eq(appointments.depositStatus, "PAID"))),
      db.select({ count: count() }).from(clients).where(eq(clients.organizationId, artist.organizationId)),
    ]);

    const messageByConversation = new Map<string, { content: string; createdAt: Date }>();
    for (const m of latestMessages) {
      const previous = messageByConversation.get(m.conversationId);
      if (!previous || m.createdAt > previous.createdAt) messageByConversation.set(m.conversationId, m);
    }

    return NextResponse.json({
      organization: org, artist, date,
      appointments: todayAppointments.map(a => ({
        ...a, client: `${a.clientFirstName}${a.clientLastName ? ` ${a.clientLastName}` : ""}`,
        service: a.serviceName ?? "Appointment",
      })),
      conversations: recentConversations.map(c => ({
        ...c, name: `${c.clientFirstName}${c.clientLastName ? ` ${c.clientLastName}` : ""}`,
        preview: messageByConversation.get(c.id)?.content ?? "No messages yet",
      })),
      clients: allClients.map(c => ({ ...c, name: `${c.firstName}${c.lastName ? ` ${c.lastName}` : ""}` })),
      stats: { appointmentsToday: Number(allApptCount[0]?.count ?? 0), confirmedAppointments: Number(bookedAppts[0]?.count ?? 0), depositsPaidAppointments: Number(collectedAppts[0]?.count ?? 0), clientCount: Number(clientCount[0]?.count ?? 0) },
    });
  } catch (error) {
    console.error("Dashboard API error", error);
    return NextResponse.json({ error: "Unable to load dashboard data" }, { status: 500 });
  }
}

export const GET = protectedRoute(handleGET, false);
