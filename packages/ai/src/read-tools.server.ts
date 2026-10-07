import 'server-only';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@db/index';
import { artists, businessRules, organizations, services, studioAftercare, studioBusinessHours, studioFaqs, studioLocations } from '@db/schema';
import type { MaiaAgentContext } from './context-policy';
import { getClientAppointments, getContextTimezone, getSlots } from './tools';
import { projectStudioAgentConfiguration } from '@/packages/studio/config-policy';
import {
  buildAvailabilityRequest,
  publicArtistDtos,
  readOnlyAvailabilityLookup,
  resolveServiceForArtist,
  searchServiceRecords,
  servicePricingDto,
  type AvailabilityPeriod,
  type ServiceRecord,
  type ServiceSearchOptions,
} from './read-only-policy';

async function loadActiveServiceRecords(organizationId: string, serviceId?: string): Promise<ServiceRecord[]> {
  const conditions = [eq(services.organizationId, organizationId), eq(services.active, true)];
  if (serviceId) conditions.push(eq(services.id, serviceId));
  return db.select({
    id: services.id,
    organizationId: services.organizationId,
    artistId: services.artistId,
    artistName: artists.displayName,
    serviceType: services.serviceType,
    category: services.category,
    name: services.name,
    description: services.description,
    durationMinutes: services.durationMinutes,
    pricingType: services.pricingType,
    basePriceCents: services.basePriceCents,
    hourlyRateCents: services.hourlyRateCents,
    startingAt: services.startingAt,
    depositType: services.depositType,
    depositAmountCents: services.depositAmountCents,
    depositPercent: services.depositPercent,
    requiresConsultation: services.requiresConsultation,
    requiresArtistApproval: services.requiresArtistApproval,
    active: services.active,
    sortOrder: services.sortOrder,
  }).from(services).innerJoin(artists, and(
    eq(artists.id, services.artistId),
    eq(artists.organizationId, services.organizationId),
  )).where(and(...conditions)).orderBy(asc(services.sortOrder), asc(services.name));
}

async function loadPublicArtistRecords(organizationId: string) {
  return db.select({ id: artists.id, organizationId: artists.organizationId, displayName: artists.displayName, bio: artists.bio, bookingEnabled: artists.bookingEnabled })
    .from(artists).where(eq(artists.organizationId, organizationId)).orderBy(asc(artists.displayName));
}

export async function getStudioPromptConfiguration(context: MaiaAgentContext, query?: string, locationName?: string) {
  const [[organization], [artist], rules, locations, faqs, aftercare, timezone] = await Promise.all([
    db.select({ organizationId: organizations.id, publicName: organizations.publicName, publicPhone: organizations.publicPhone, publicEmail: organizations.publicEmail, website: organizations.website, timezone: organizations.timezone }).from(organizations)
      .where(eq(organizations.id, context.organizationId)).limit(1),
    db.select({ organizationId: artists.organizationId, displayName: artists.displayName, bio: artists.bio, responseLength: artists.responseLength, receptionistTone: artists.receptionistTone, receptionistGreeting: artists.receptionistGreeting, receptionistInstructions: artists.receptionistInstructions })
      .from(artists).where(and(eq(artists.id, context.artistId), eq(artists.organizationId, context.organizationId))).limit(1),
    db.select({ id: businessRules.id, organizationId: businessRules.organizationId, artistId: businessRules.artistId, category: businessRules.category, rule: businessRules.rule, visibility: businessRules.visibility, priority: businessRules.priority, active: businessRules.active }).from(businessRules)
      .where(and(eq(businessRules.organizationId, context.organizationId), eq(businessRules.artistId, context.artistId), eq(businessRules.active, true)))
      .orderBy(desc(businessRules.priority)).limit(100),
    db.select({ id: studioLocations.id, organizationId: studioLocations.organizationId, name: studioLocations.name, addressLine1: studioLocations.addressLine1, addressLine2: studioLocations.addressLine2, city: studioLocations.city, region: studioLocations.region, postalCode: studioLocations.postalCode, country: studioLocations.country, phone: studioLocations.phone, email: studioLocations.email, timezone: studioLocations.timezone, businessHoursConfigured: studioLocations.businessHoursConfigured, isPrimary: studioLocations.isPrimary, active: studioLocations.active }).from(studioLocations)
      .where(and(eq(studioLocations.organizationId, context.organizationId), eq(studioLocations.active, true))).orderBy(desc(studioLocations.isPrimary), asc(studioLocations.name)).limit(20),
    db.select({ id: studioFaqs.id, organizationId: studioFaqs.organizationId, locationId: studioFaqs.locationId, category: studioFaqs.category, question: studioFaqs.question, answer: studioFaqs.answer, active: studioFaqs.active, sortOrder: studioFaqs.sortOrder }).from(studioFaqs)
      .where(and(eq(studioFaqs.organizationId, context.organizationId), eq(studioFaqs.active, true))).orderBy(asc(studioFaqs.sortOrder)).limit(100),
    db.select({ id: studioAftercare.id, organizationId: studioAftercare.organizationId, locationId: studioAftercare.locationId, serviceType: studioAftercare.serviceType, category: studioAftercare.category, title: studioAftercare.title, instructions: studioAftercare.instructions, active: studioAftercare.active, sortOrder: studioAftercare.sortOrder }).from(studioAftercare)
      .where(and(eq(studioAftercare.organizationId, context.organizationId), eq(studioAftercare.active, true))).orderBy(asc(studioAftercare.sortOrder)).limit(100),
    getContextTimezone(context.organizationId, context.artistId),
  ]);
  if (!organization || !artist) throw new Error('Studio context is not available.');
  const locationIds = locations.map(location => location.id);
  const hours = locationIds.length ? await db.select({ organizationId: studioBusinessHours.organizationId, locationId: studioBusinessHours.locationId, dayOfWeek: studioBusinessHours.dayOfWeek, startMinute: studioBusinessHours.startMinute, endMinute: studioBusinessHours.endMinute })
    .from(studioBusinessHours).where(and(eq(studioBusinessHours.organizationId, context.organizationId), inArray(studioBusinessHours.locationId, locationIds)))
    .orderBy(asc(studioBusinessHours.dayOfWeek), asc(studioBusinessHours.startMinute)).limit(200) : [];
  const configuration = projectStudioAgentConfiguration({
    organizationId: context.organizationId,
    artistId: context.artistId,
    profile: organization,
    artist,
    receptionist: { tone: artist.receptionistTone, greeting: artist.receptionistGreeting, instructions: artist.receptionistInstructions },
    locations,
    hours,
    rules,
    faqs,
    aftercare,
    query,
    locationName,
  });
  if (!configuration) throw new Error('Studio context is not available.');
  return configuration;
}

export async function getStudioContext(context: MaiaAgentContext, options: { query?: string; locationName?: string } = {}) {
  const configuration = await getStudioPromptConfiguration(context, options.query, options.locationName);
  return configuration.clientFacing;
}

export async function searchServices(context: MaiaAgentContext, options: ServiceSearchOptions = {}) {
  const records = await loadActiveServiceRecords(context.organizationId);
  return searchServiceRecords(context.organizationId, records, options);
}

export async function getServicePricing(context: MaiaAgentContext, serviceId: string) {
  const [record] = await loadActiveServiceRecords(context.organizationId, serviceId);
  if (!record) throw new Error('Active service not found in this studio.');
  return servicePricingDto(record);
}

export async function listArtists(context: MaiaAgentContext, serviceId?: string) {
  const [artistRecords, serviceRecords] = await Promise.all([
    loadPublicArtistRecords(context.organizationId),
    loadActiveServiceRecords(context.organizationId),
  ]);
  return publicArtistDtos(context.organizationId, artistRecords, serviceRecords, serviceId);
}

export async function checkAvailability(context: MaiaAgentContext, input: {
  serviceId: string;
  fromDate: string;
  toDate?: string;
  artistPreference?: string;
  timePeriod?: AvailabilityPeriod;
}) {
  const [serviceRecords, artistRecords] = await Promise.all([
    loadActiveServiceRecords(context.organizationId),
    loadPublicArtistRecords(context.organizationId),
  ]);
  const selected = resolveServiceForArtist(context.organizationId, input.serviceId, input.artistPreference, serviceRecords, artistRecords);
  if (!selected) throw new Error('An active matching service and artist could not be found in this studio.');
  const timezone = await getContextTimezone(context.organizationId, selected.artist.id);
  const request = buildAvailabilityRequest({
    organizationId: context.organizationId,
    serviceId: input.serviceId,
    fromDate: input.fromDate,
    toDate: input.toDate,
    artistPreference: input.artistPreference,
    timeZone: timezone,
    now: new Date(),
    serviceRecords,
    artistRecords,
  });
  if (!request) throw new Error('An active matching service, artist, and date range could not be found in this studio.');
  return readOnlyAvailabilityLookup({
    organizationId: context.organizationId,
    artistId: request.artistId,
    serviceId: request.serviceId,
    durationMinutes: request.durationMinutes,
    from: request.from,
    to: request.to,
    now: request.now,
    timeZone: request.timeZone,
    artistName: request.artistName,
    period: input.timePeriod,
  }, (organizationId, artistId, request) => {
    if (organizationId !== context.organizationId) throw new Error('Availability organization does not match trusted context.');
    return getSlots(context, { ...request, artistId });
  });
}

export async function getClientAppointmentsForReceptionist(context: MaiaAgentContext) {
  const appointments = await getClientAppointments(context);
  return appointments.map(({ appointmentId, service, startsAt, endsAt, localStart, status, priceCents, depositRequired, depositCents, depositStatus }) => ({
    appointmentId,
    service,
    startsAt,
    endsAt,
    localStart,
    status,
    priceCents,
    depositRequired,
    depositCents,
    depositStatus,
  }));
}
