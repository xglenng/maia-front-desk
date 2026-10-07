export type StudioLocationRecord = {
  id: string;
  organizationId: string;
  name: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  businessHoursConfigured?: boolean;
  isPrimary: boolean;
  active: boolean;
};

export type StudioHoursRecord = {
  organizationId: string;
  locationId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};

export type StudioRuleRecord = {
  id: string;
  organizationId: string;
  artistId: string;
  category: string;
  rule: string;
  visibility: 'CLIENT_VISIBLE' | 'AI_INTERNAL' | string;
  priority: number;
  active: boolean;
};

export type StudioFaqRecord = {
  id: string;
  organizationId: string;
  locationId: string | null;
  category: string | null;
  question: string;
  answer: string;
  active: boolean;
  sortOrder: number;
};

export type StudioAftercareRecord = {
  id: string;
  organizationId: string;
  locationId: string | null;
  serviceType: string | null;
  category: string | null;
  title: string;
  instructions: string;
  active: boolean;
  sortOrder: number;
};

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const stopWords = new Set(['a', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'get', 'how', 'i', 'is', 'me', 'of', 'one', 'please', 'the', 'to', 'what', 'you']);

function terms(value: string | undefined) {
  return (value ?? '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/)
    .filter(word => word && !stopWords.has(word))
    .map(word => word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word);
}

function scoreText(text: string, queryTerms: string[]) {
  if (queryTerms.length === 0) return 1;
  const source = new Set(terms(text));
  return queryTerms.reduce((score, word) => score + (source.has(word) ? 1 : 0), 0);
}

function timeLabel(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function canManageStudioConfiguration(role: string, identityOrganizationId: string, requestedOrganizationId: string) {
  return role === 'OWNER' && identityOrganizationId === requestedOrganizationId;
}

export function isValidIanaTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function validBusinessHours(hours: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>) {
  if (hours.length > 14) return false;
  const ordered = [...hours].sort((left, right) => left.dayOfWeek - right.dayOfWeek || left.startMinute - right.startMinute);
  for (let index = 0; index < ordered.length; index++) {
    const current = ordered[index]!;
    if (!Number.isInteger(current.dayOfWeek) || current.dayOfWeek < 0 || current.dayOfWeek > 6) return false;
    if (!Number.isInteger(current.startMinute) || !Number.isInteger(current.endMinute) || current.startMinute < 0 || current.endMinute > 1440 || current.startMinute >= current.endMinute) return false;
    const previous = ordered[index - 1];
    if (previous?.dayOfWeek === current.dayOfWeek && previous.endMinute > current.startMinute) return false;
  }
  return true;
}

export function projectStudioAgentConfiguration(input: {
  organizationId: string;
  artistId: string;
  profile: { organizationId: string; publicName: string | null; publicPhone: string | null; publicEmail: string | null; website: string | null; timezone: string } | null;
  artist?: { organizationId: string; displayName: string; bio: string | null; responseLength: string } | null;
  receptionist?: { tone: string; greeting: string | null; instructions: string | null };
  locations: StudioLocationRecord[];
  hours: StudioHoursRecord[];
  rules: StudioRuleRecord[];
  faqs: StudioFaqRecord[];
  aftercare: StudioAftercareRecord[];
  query?: string;
  locationName?: string;
}) {
  if (!input.profile || input.profile.organizationId !== input.organizationId) return null;
  const locations = input.locations.filter(location => location.organizationId === input.organizationId && location.active);
  const queryTerms = terms(input.query);
  const requestedLocationTerms = terms(input.locationName);
  const requestedLocations = requestedLocationTerms.length
    ? locations.filter(location => scoreText(location.name, requestedLocationTerms) === requestedLocationTerms.length)
    : [];
  const selectedLocation = requestedLocationTerms.length
    ? requestedLocations.length === 1 ? requestedLocations[0] : null
    : locations.find(location => location.isPrimary) ?? null;
  const locationHours = (location: StudioLocationRecord) => input.hours
    .filter(hours => hours.organizationId === input.organizationId && hours.locationId === location.id)
    .sort((left, right) => left.dayOfWeek - right.dayOfWeek || left.startMinute - right.startMinute)
    .map(hours => ({ day: dayNames[hours.dayOfWeek] ?? 'Unknown', opens: timeLabel(hours.startMinute), closes: timeLabel(hours.endMinute) }));
  const visibleLocations = (selectedLocation ? [selectedLocation] : requestedLocationTerms.length ? [] : locations).slice(0, 6);
  const commonLocationKnowledge = (locationId: string | null) => locationId == null || (selectedLocation != null && locationId === selectedLocation.id);

  const clientPolicies = input.rules
    .filter(rule => rule.organizationId === input.organizationId && rule.artistId === input.artistId && rule.active && rule.visibility === 'CLIENT_VISIBLE')
    .map(rule => ({ rule, score: scoreText(`${rule.category} ${rule.rule}`, queryTerms) }))
    .filter(item => queryTerms.length === 0 || item.score > 0)
    .sort((left, right) => right.score - left.score || right.rule.priority - left.rule.priority)
    .slice(0, 10)
    .map(({ rule }) => ({ category: rule.category.slice(0, 80), rule: rule.rule.slice(0, 800) }));

  const faqs = input.faqs
    .filter(faq => faq.organizationId === input.organizationId && faq.active && commonLocationKnowledge(faq.locationId))
    .map(faq => ({ faq, score: scoreText(`${faq.category ?? ''} ${faq.question} ${faq.answer}`, queryTerms) }))
    .filter(item => queryTerms.length === 0 || item.score > 0)
    .sort((left, right) => right.score - left.score || left.faq.sortOrder - right.faq.sortOrder)
    .slice(0, 8)
    .map(({ faq }) => ({ question: faq.question.slice(0, 240), answer: faq.answer.slice(0, 1200), ...(faq.category ? { category: faq.category.slice(0, 80) } : {}) }));

  const aftercare = input.aftercare
    .filter(entry => entry.organizationId === input.organizationId && entry.active && commonLocationKnowledge(entry.locationId))
    .map(entry => ({ entry, score: scoreText(`${entry.serviceType ?? ''} ${entry.category ?? ''} ${entry.title} ${entry.instructions}`, queryTerms) }))
    .filter(item => queryTerms.length === 0 || item.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.sortOrder - right.entry.sortOrder)
    .slice(0, 6)
    .map(({ entry }) => ({ title: entry.title.slice(0, 160), ...(entry.serviceType ? { serviceType: entry.serviceType.slice(0, 80) } : {}), ...(entry.category ? { category: entry.category.slice(0, 80) } : {}), instructions: entry.instructions.slice(0, 1600) }));

  const clientFacing = {
    ...(input.profile.publicName ? { studioName: input.profile.publicName } : {}),
    timezone: selectedLocation?.timezone ?? input.profile.timezone,
    ...(input.profile.publicPhone ? { phone: input.profile.publicPhone } : {}),
    ...(input.profile.publicEmail ? { email: input.profile.publicEmail } : {}),
    ...(input.profile.website ? { website: input.profile.website } : {}),
    ...(input.artist?.organizationId === input.organizationId ? {
      artist: { name: input.artist.displayName, ...(input.artist.bio ? { bio: input.artist.bio } : {}) },
      receptionist: { responseLength: input.artist.responseLength },
    } : {}),
    locations: visibleLocations.map(location => ({
      name: location.name,
      ...(location.addressLine1 ? { addressLine1: location.addressLine1 } : {}),
      ...(location.addressLine2 ? { addressLine2: location.addressLine2 } : {}),
      ...(location.city ? { city: location.city } : {}),
      ...(location.region ? { region: location.region } : {}),
      ...(location.postalCode ? { postalCode: location.postalCode } : {}),
      ...(location.country ? { country: location.country } : {}),
      ...(location.phone ? { phone: location.phone } : {}),
      ...(location.email ? { email: location.email } : {}),
      timezone: location.timezone,
      businessHoursConfigured: location.businessHoursConfigured ?? locationHours(location).length > 0,
      businessHours: locationHours(location),
    })),
    clientPolicies,
    faqs,
    aftercare,
  };

  const internalInstructions = input.rules
    .filter(rule => rule.organizationId === input.organizationId && rule.artistId === input.artistId && rule.active && rule.visibility === 'AI_INTERNAL')
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 10)
    .map(rule => ({ category: rule.category.slice(0, 80), instruction: rule.rule.slice(0, 800) }));

  return {
    clientFacing,
    internalInstructions,
    receptionistGuidance: input.receptionist ? {
      tone: input.receptionist.tone.slice(0, 40),
      ...(input.receptionist.greeting ? { greeting: input.receptionist.greeting.slice(0, 240) } : {}),
      ...(input.receptionist.instructions ? { instructions: input.receptionist.instructions.slice(0, 1200) } : {}),
    } : undefined,
  };
}
