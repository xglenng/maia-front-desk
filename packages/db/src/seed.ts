import { db } from './index';
import { eq } from 'drizzle-orm';
import { organizations, users, artists, clients, services, businessRules, availabilityRules, appointments, conversations, messages, waiverTemplates } from './schema';

async function seed() {
  const [org] = await db.insert(organizations).values({ name: 'Demo Tattoo Studio', slug: 'demo-tattoo-studio', timezone: 'America/Denver' }).returning();
  const [user] = await db.insert(users).values({ organizationId: org.id, email: 'demo@example.com', name: 'Demo Owner', role: 'OWNER' }).returning();
  const [artist] = await db.insert(artists).values({ organizationId: org.id, userId: user.id, displayName: 'Mike Smith', minimumPriceCents: 15000, hourlyRateCents: 20000, aiMode: 'ASSISTED' }).returning();
  const seededClients = await db.insert(clients).values([
    { organizationId: org.id, firstName: 'Demo', lastName: 'Client', email: 'client@example.com', phone: '+15555550123', smsOptIn: true },
    { organizationId: org.id, firstName: 'Sarah', lastName: 'Miller', email: 'sarah@example.com', phone: '+15555550124', smsOptIn: true },
    { organizationId: org.id, firstName: 'Jake', lastName: 'Thompson', email: 'jake@example.com', phone: '+15555550125', smsOptIn: true },
    { organizationId: org.id, firstName: 'Emily', lastName: 'Carter', email: 'emily@example.com', phone: '+15555550126', smsOptIn: true },
  ]).returning();
  const [client, sarah, jake, emily] = seededClients;

  await db.insert(services).values([
    { organizationId: org.id, artistId: artist.id, serviceType: 'TATTOO', name: 'Tattoo Session', durationMinutes: 120, pricingType: 'HOURLY', hourlyRateCents: 20000 },
    { organizationId: org.id, artistId: artist.id, serviceType: 'TATTOO', name: 'Small Tattoo', durationMinutes: 60, pricingType: 'FLAT', basePriceCents: 15000 },
  ]);

  await db.insert(availabilityRules).values([
    1, 2, 3, 4, 5
  ].map(dayOfWeek => ({ organizationId: org.id, artistId: artist.id, dayOfWeek, startMinute: 10 * 60, endMinute: 18 * 60 })));

  await db.insert(appointments).values([
    { organizationId: org.id, artistId: artist.id, clientId: sarah.id, serviceId: (await db.select({ id: services.id }).from(services).where(eq(services.name, 'Tattoo Session')).limit(1))[0].id, startsAt: new Date('2026-09-16T16:00:00.000Z'), endsAt: new Date('2026-09-16T19:00:00.000Z'), status: 'CONFIRMED', priceCents: 60000, depositCents: 20000, depositStatus: 'PAID' },
    { organizationId: org.id, artistId: artist.id, clientId: jake.id, serviceId: (await db.select({ id: services.id }).from(services).where(eq(services.name, 'Tattoo Session')).limit(1))[0].id, startsAt: new Date('2026-09-16T19:30:00.000Z'), endsAt: new Date('2026-09-16T21:30:00.000Z'), status: 'TENTATIVE', priceCents: 40000, depositCents: 20000, depositStatus: 'PENDING' },
    { organizationId: org.id, artistId: artist.id, clientId: emily.id, serviceId: (await db.select({ id: services.id }).from(services).where(eq(services.name, 'Small Tattoo')).limit(1))[0].id, startsAt: new Date('2026-09-16T22:00:00.000Z'), endsAt: new Date('2026-09-16T23:00:00.000Z'), status: 'AI_HOLD', priceCents: 15000, depositCents: 20000, depositStatus: 'PENDING', holdExpiresAt: new Date('2026-09-16T22:10:00.000Z') },
  ]);

  const seededConversations = await db.insert(conversations).values([
    { organizationId: org.id, artistId: artist.id, clientId: emily.id, channel: 'SMS', aiEnabled: true, status: 'OPEN', unreadCount: 1, lastInboundAt: new Date('2026-09-16T19:18:00.000Z'), lastMessageAt: new Date('2026-09-16T19:18:00.000Z') },
    { organizationId: org.id, artistId: artist.id, clientId: jake.id, channel: 'SMS', aiEnabled: true, status: 'OPEN', unreadCount: 1, lastInboundAt: new Date('2026-09-16T18:55:00.000Z'), lastMessageAt: new Date('2026-09-16T18:55:00.000Z') },
    { organizationId: org.id, artistId: artist.id, clientId: sarah.id, channel: 'SMS', aiEnabled: false, status: 'OPEN', lastMessageAt: new Date('2026-09-16T17:40:00.000Z') },
  ]).returning();

  await db.insert(messages).values([
    { conversationId: seededConversations[0].id, senderType: 'CLIENT', role: 'user', content: 'I love the second reference. Could we do something similar on my forearm?', createdAt: new Date('2026-09-16T19:18:00.000Z') },
    { conversationId: seededConversations[1].id, senderType: 'CLIENT', role: 'user', content: 'Do you have anything open next Friday?', createdAt: new Date('2026-09-16T18:55:00.000Z') },
    { conversationId: seededConversations[2].id, senderType: 'ARTIST', role: 'assistant', content: 'Thanks! Your appointment is confirmed.', createdAt: new Date('2026-09-16T17:40:00.000Z') },
  ]);

  await db.insert(waiverTemplates).values({
    organizationId: org.id,
    name: 'General Tattoo Consent',
    version: 1,
    body: 'I confirm that I am voluntarily receiving a tattoo, have disclosed relevant medical information to the artist, and agree to follow the artist\'s aftercare instructions.',
    active: true,
  });

  await db.insert(businessRules).values([
    { organizationId: org.id, artistId: artist.id, category: 'DEPOSIT', rule: 'Deposits are $200.', priority: 10 },
    { organizationId: org.id, artistId: artist.id, category: 'BOOKING', rule: 'Require 48 hours notice for booking.', priority: 20 },
    { organizationId: org.id, artistId: artist.id, category: 'RESTRICTION', rule: 'No face, hands, or neck tattoos.', priority: 30 }
  ]);

  console.log({ organizationId: org.id, userId: user.id, artistId: artist.id, clientId: client.id });
  process.exit(0);
}

seed().catch((error) => { console.error(error); process.exit(1); });
