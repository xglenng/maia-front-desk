import { addLocalDays, localDateString, parseSchedulingDate } from '@/packages/scheduling/square/time';
import { presentAvailabilitySlot } from '@/packages/scheduling/presentation';
import type { AvailabilityRequest, AvailabilityResult } from '@/packages/scheduling/types';

export type ServiceRecord = {
  id: string;
  organizationId: string;
  artistId: string;
  artistName: string;
  serviceType: string;
  category: string | null;
  name: string;
  description: string | null;
  durationMinutes: number;
  pricingType: string;
  basePriceCents: number | null;
  hourlyRateCents: number | null;
  startingAt: boolean;
  depositType: string;
  depositAmountCents: number | null;
  depositPercent: number | null;
  requiresConsultation: boolean;
  requiresArtistApproval: boolean;
  active: boolean;
  sortOrder?: number;
};

export type ArtistRecord = {
  id: string;
  organizationId: string;
  displayName: string;
  bio: string | null;
  bookingEnabled?: boolean;
};

export function studioContextDto(input: {
  organizationId: string;
  organization: { id: string; name: string } | null;
  artist: { id: string; organizationId: string; displayName: string; bio: string | null; responseLength: string } | null;
  timezone: string;
  rules: Array<{ organizationId: string; artistId: string; category: string; rule: string }>;
}) {
  if (!input.organization || input.organization.id !== input.organizationId || !input.artist || input.artist.organizationId !== input.organizationId) return null;
  return {
    studioName: input.organization.name,
    timezone: input.timezone,
    artist: { name: input.artist.displayName, ...(input.artist.bio ? { bio: input.artist.bio } : {}) },
    receptionist: { responseLength: input.artist.responseLength },
    businessRules: input.rules
      .filter(rule => rule.organizationId === input.organizationId && rule.artistId === input.artist!.id)
      .map(rule => ({ category: rule.category, rule: rule.rule })),
  };
}

export type ServiceSearchOptions = {
  query?: string;
  serviceType?: string;
  category?: string;
  artistPreference?: string;
};

export type AvailabilityPeriod = 'morning' | 'afternoon' | 'evening';

export function resolveContextTimezone(artistTimezone: string | null | undefined, organizationTimezone: string | null | undefined) {
  return artistTimezone || organizationTimezone || 'UTC';
}

const stopWords = new Set(['a', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'get', 'how', 'i', 'is', 'me', 'of', 'offer', 'offers', 'please', 'the', 'to', 'what', 'which', 'you']);

function words(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word);
}

function queryWords(value: string | undefined) {
  return words(value).filter(word => !stopWords.has(word));
}

function includesAllWords(haystack: string, needles: string[]) {
  const haystackWords = new Set(words(haystack));
  return needles.every(word => haystackWords.has(word));
}

function searchScore(record: ServiceRecord, query: string[]) {
  const nameWords = new Set(words(record.name));
  const categoryWords = new Set(words(`${record.serviceType} ${record.category ?? ''}`));
  const descriptionWords = new Set(words(record.description));
  return query.reduce((score, word) => score + (nameWords.has(word) ? 4 : categoryWords.has(word) ? 2 : descriptionWords.has(word) ? 1 : 0), 0);
}

export function searchServiceRecords(organizationId: string, records: ServiceRecord[], options: ServiceSearchOptions = {}, limit = 12) {
  const query = queryWords(options.query);
  const serviceType = queryWords(options.serviceType);
  const category = queryWords(options.category);
  const artistPreference = queryWords(options.artistPreference);
  return records
    .filter(record => record.organizationId === organizationId && record.active)
    .filter(record => query.length === 0 || includesAllWords(`${record.name} ${record.serviceType} ${record.category ?? ''} ${record.description ?? ''}`, query))
    .filter(record => serviceType.length === 0 || includesAllWords(`${record.serviceType} ${record.category ?? ''}`, serviceType))
    .filter(record => category.length === 0 || includesAllWords(`${record.category ?? ''} ${record.serviceType}`, category))
    .filter(record => artistPreference.length === 0 || includesAllWords(record.artistName, artistPreference))
    .map((record, index) => ({ record, index, score: searchScore(record, query) }))
    .sort((left, right) => right.score - left.score || (left.record.sortOrder ?? left.index) - (right.record.sortOrder ?? right.index) || left.record.name.localeCompare(right.record.name))
    .slice(0, Math.max(0, limit))
    .map(({ record }) => ({
      serviceId: record.id,
      name: record.name,
      artistName: record.artistName,
      serviceType: record.serviceType,
      ...(record.category ? { category: record.category } : {}),
      ...(record.description ? { description: record.description } : {}),
      durationMinutes: record.durationMinutes,
      requiresConsultation: record.requiresConsultation,
      requiresArtistApproval: record.requiresArtistApproval,
    }));
}

export function findActiveService(organizationId: string, serviceId: string, records: ServiceRecord[]) {
  return records.find(record => record.id === serviceId && record.organizationId === organizationId && record.active) ?? null;
}

export function resolveServiceForArtist(
  organizationId: string,
  serviceId: string,
  artistPreference: string | undefined,
  serviceRecords: ServiceRecord[],
  artistRecords: ArtistRecord[],
) {
  const requestedService = findActiveService(organizationId, serviceId, serviceRecords);
  if (!requestedService) return null;
  const artistMatches = artistPreference
    ? artistRecords.filter(artist => artist.organizationId === organizationId && artist.bookingEnabled !== false && includesAllWords(artist.displayName, queryWords(artistPreference)))
    : artistRecords.filter(artist => artist.organizationId === organizationId && artist.bookingEnabled !== false && artist.id === requestedService.artistId);
  if (artistMatches.length !== 1) return null;
  const artist = artistMatches[0]!;
  const service = serviceRecords.find(record => record.organizationId === organizationId && record.artistId === artist.id && record.active &&
    words(record.name).join(' ') === words(requestedService.name).join(' ') &&
    words(record.serviceType).join(' ') === words(requestedService.serviceType).join(' ') &&
    words(record.category).join(' ') === words(requestedService.category).join(' '));
  return service ? { artist, service } : null;
}

function priceLabel(type: 'FLAT' | 'HOURLY' | 'QUOTE' | 'UNKNOWN', amountCents: number | null, startingAt: boolean) {
  if (type === 'QUOTE') return 'Quote required';
  if ((type !== 'FLAT' && type !== 'HOURLY') || amountCents == null || !Number.isSafeInteger(amountCents) || amountCents < 0) return undefined;
  const amount = `$${(amountCents / 100).toFixed(2)}`;
  const prefix = startingAt ? 'Starting at ' : '';
  return type === 'HOURLY' ? `${prefix}${amount} per hour` : `${prefix}${amount}`;
}

export function servicePricingDto(record: ServiceRecord) {
  const type = record.pricingType.toUpperCase();
  const pricingType = type === 'FLAT' || type === 'HOURLY' || type === 'QUOTE' ? type : 'UNKNOWN';
  const amountCents = pricingType === 'FLAT' ? record.basePriceCents : pricingType === 'HOURLY' ? record.hourlyRateCents : null;
  const depositType = record.depositType.toUpperCase();
  const deposit = depositType === 'FIXED'
    ? { type: 'FIXED' as const, ...(record.depositAmountCents != null && Number.isSafeInteger(record.depositAmountCents) && record.depositAmountCents >= 0 ? { amountCents: record.depositAmountCents } : {}) }
    : depositType === 'PERCENT'
      ? { type: 'PERCENT' as const, ...(record.depositPercent != null && Number.isSafeInteger(record.depositPercent) && record.depositPercent >= 0 && record.depositPercent <= 100 ? { percent: record.depositPercent } : {}) }
      : { type: depositType === 'NONE' ? 'NONE' as const : 'UNKNOWN' as const };
  return {
    serviceId: record.id,
    name: record.name,
    artistName: record.artistName,
    pricingType,
    ...(amountCents != null ? { amountCents } : {}),
    ...(priceLabel(pricingType, amountCents, record.startingAt) ? { priceLabel: priceLabel(pricingType, amountCents, record.startingAt) } : {}),
    startingAt: pricingType === 'QUOTE' ? false : record.startingAt,
    durationMinutes: record.durationMinutes,
    deposit,
    requiresConsultation: record.requiresConsultation,
    requiresArtistApproval: record.requiresArtistApproval,
  };
}

export function publicArtistDtos(organizationId: string, artists: ArtistRecord[], services: ServiceRecord[], serviceId?: string) {
  const activeServices = services.filter(service => service.organizationId === organizationId && service.active && (!serviceId || service.id === serviceId));
  if (serviceId && activeServices.length === 0) return [];
  const eligibleArtistIds = serviceId ? new Set(activeServices.map(service => service.artistId)) : undefined;
  return artists
    .filter(artist => artist.organizationId === organizationId && artist.bookingEnabled !== false && (!eligibleArtistIds || eligibleArtistIds.has(artist.id)))
    .map(artist => ({
      name: artist.displayName,
      ...(artist.bio ? { bio: artist.bio } : {}),
      services: activeServices.filter(service => service.artistId === artist.id).map(service => ({
        name: service.name,
        serviceType: service.serviceType,
        ...(service.category ? { category: service.category } : {}),
      })),
    }));
}

export function availabilityDateWindow(fromDate: string, toDate: string | undefined, timeZone: string, now = new Date()) {
  const endDate = toDate ?? fromDate;
  const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  if (!datePattern.test(fromDate) || !datePattern.test(endDate) || endDate < fromDate) return null;
  const startCalendar = Date.parse(`${fromDate}T00:00:00Z`);
  const endCalendar = Date.parse(`${endDate}T00:00:00Z`);
  const calendarDays = (endCalendar - startCalendar) / 86_400_000 + 1;
  if (!Number.isInteger(calendarDays) || calendarDays < 1 || calendarDays > 31) return null;
  try {
    const from = parseSchedulingDate(fromDate, timeZone, now);
    const endStart = parseSchedulingDate(endDate, timeZone, now);
    if (localDateString(from, timeZone) !== fromDate || localDateString(endStart, timeZone) !== endDate) return null;
    const to = addLocalDays(endStart, 1, timeZone);
    if (to <= from) return null;
    return { from: from.toISOString(), to: to.toISOString() };
  } catch {
    return null;
  }
}

export function buildAvailabilityRequest(input: {
  organizationId: string;
  serviceId: string;
  fromDate: string;
  toDate?: string;
  artistPreference?: string;
  timeZone: string;
  now: Date;
  serviceRecords: ServiceRecord[];
  artistRecords: ArtistRecord[];
}) {
  const selection = resolveServiceForArtist(input.organizationId, input.serviceId, input.artistPreference, input.serviceRecords, input.artistRecords);
  if (!selection) return null;
  const window = availabilityDateWindow(input.fromDate, input.toDate, input.timeZone, input.now);
  if (!window) return null;
  return {
    artistId: selection.artist.id,
    artistName: selection.artist.displayName,
    serviceId: selection.service.id,
    durationMinutes: selection.service.durationMinutes,
    from: window.from,
    to: window.to,
    now: input.now,
    timeZone: input.timeZone,
  };
}

function matchesPeriod(start: string, timeZone: string, period?: AvailabilityPeriod) {
  if (!period) return true;
  const date = new Date(start);
  if (!Number.isFinite(date.getTime())) return false;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const minuteOfDay = Number(values.hour) * 60 + Number(values.minute);
  if (period === 'morning') return minuteOfDay >= 6 * 60 && minuteOfDay < 12 * 60;
  if (period === 'afternoon') return minuteOfDay >= 12 * 60 && minuteOfDay < 17 * 60;
  return minuteOfDay >= 17 * 60 && minuteOfDay < 22 * 60;
}

export type ReadOnlyAvailabilityInput = {
  organizationId: string;
  artistId: string;
  serviceId: string;
  durationMinutes: number;
  from: string;
  to: string;
  now: Date;
  timeZone: string;
  artistName: string;
  period?: AvailabilityPeriod;
};

export async function readOnlyAvailabilityLookup(
  input: ReadOnlyAvailabilityInput,
  lookup: (organizationId: string, artistId: string, request: AvailabilityRequest) => Promise<AvailabilityResult>,
) {
  const result = await lookup(input.organizationId, input.artistId, {
    serviceId: input.serviceId,
    durationMinutes: input.durationMinutes,
    from: input.from,
    to: input.to,
    now: input.now,
  });
  if (result.status !== 'AVAILABLE') return { status: result.status, timezone: input.timeZone, slots: [] as Array<{ startsAt: string; endsAt: string; displayTime: string; artistName: string }> };
  const slots = result.slots
    .filter(slot => new Date(slot.start).getTime() >= input.now.getTime())
    .filter(slot => matchesPeriod(slot.start, input.timeZone, input.period))
    .map(slot => {
      const presented = presentAvailabilitySlot(slot, input.timeZone);
      return {
        startsAt: presented.start,
        endsAt: presented.end,
        displayTime: `${presented.localStart} to ${presented.localEnd}`,
        artistName: input.artistName,
      };
    });
  return { status: slots.length ? 'AVAILABLE' as const : 'NO_AVAILABILITY' as const, timezone: input.timeZone, slots };
}
