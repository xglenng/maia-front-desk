import { protectedRoute } from '@/packages/auth/server';
import { NextResponse } from "next/server";
import { and, asc, count, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@db/index";
import { artists, clients, conversations, messages, appointments, services, organizations } from "@db/schema";

function dayBounds(dateParam: string | null) {
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { date, start, end };
}

async function handleGET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { date, start, end } = dayBounds(searchParams.get("date"));

    // MVP tenant selection: first seeded artist. Replace with authenticated org/artist context in Sprint 3.
    const [artist] = await db.select({
      id: artists.id, organizationId: artists.organizationId, displayName: artists.displayName,
      aiMode: artists.aiMode, bookingEnabled: artists.bookingEnabled,
    }).from(artists).where(eq(artists.organizationId, searchParams.get('organizationId')!)).orderBy(asc(artists.displayName)).limit(1);

    if (!artist) return NextResponse.json({ error: "No artist found. Run npm run db:seed." }, { status: 404 });

    const [org] = await db.select({ name: organizations.name, timezone: organizations.timezone })
      .from(organizations).where(eq(organizations.id, artist.organizationId)).limit(1);

    const todayAppointments = await db.select({
      id: appointments.id, startsAt: appointments.startsAt, endsAt: appointments.endsAt, status: appointments.status,
      priceCents: appointments.priceCents, depositCents: appointments.depositCents, depositStatus: appointments.depositStatus,
      clientFirstName: clients.firstName, clientLastName: clients.lastName, serviceName: services.name,
    }).from(appointments)
      .innerJoin(clients, eq(appointments.clientId, clients.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(and(eq(appointments.artistId, artist.id), gte(appointments.startsAt, start), lt(appointments.startsAt, end)))
      .orderBy(asc(appointments.startsAt));

    const recentConversations = await db.select({
      id: conversations.id, clientFirstName: clients.firstName, clientLastName: clients.lastName,
      status: conversations.status, aiEnabled: conversations.aiEnabled, unreadCount: conversations.unreadCount, lastMessageAt: conversations.lastMessageAt,
    }).from(conversations)
      .innerJoin(clients, eq(conversations.clientId, clients.id))
      .where(eq(conversations.artistId, artist.id))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(10);

    const conversationIds = recentConversations.map(c => c.id);
    const latestMessages = conversationIds.length ? await db.select({
      conversationId: messages.conversationId, content: messages.content, createdAt: messages.createdAt,
    }).from(messages).where(inArray(messages.conversationId, conversationIds)) : [];

    const allClients = await db.select({
      id: clients.id, firstName: clients.firstName, lastName: clients.lastName, email: clients.email, phone: clients.phone, createdAt: clients.createdAt,
    }).from(clients).where(eq(clients.organizationId, artist.organizationId)).orderBy(desc(clients.createdAt)).limit(100);

    const [allApptCount, bookedAppts, collectedAppts, clientCount] = await Promise.all([
      db.select({ count: count() }).from(appointments).where(and(eq(appointments.artistId, artist.id), gte(appointments.startsAt, start), lt(appointments.startsAt, end))),
      db.select({ count: count() }).from(appointments).where(and(eq(appointments.artistId, artist.id), eq(appointments.status, "CONFIRMED"))),
      db.select({ count: count() }).from(appointments).where(and(eq(appointments.artistId, artist.id), eq(appointments.depositStatus, "PAID"))),
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
