export const APPOINTMENT_REMINDER_MINUTES = [120, 360, 720, 1440, 2880] as const;
export const APPOINTMENT_WAIVER_MINUTES = [120, 240, 360, 720] as const;
export const FOLLOWUP_HOURS = [12, 24, 48, 72] as const;
export const REVIEW_FOLLOWUP_HOURS = [24, 48, 72, 168] as const;
export const SHORT_NOTICE_DELAY_MS = 5 * 60_000;
export type ShortNoticeMode = 'SKIP' | 'SEND_AFTER_DELAY';
export type DepositPaymentProvider = 'SQUARE' | 'STRIPE' | 'VENMO_MANUAL';

export function resolveDepositPaymentProvider(appointmentProvider: string | null, serviceProvider: string | null): DepositPaymentProvider | null {
  const provider = appointmentProvider || serviceProvider || 'SQUARE';
  return ['SQUARE', 'STRIPE', 'VENMO_MANUAL'].includes(provider) ? provider as DepositPaymentProvider : null;
}

export function appointmentReminderPlan(input: {
  now: Date;
  startsAt: Date;
  leadMinutes: number;
  shortNoticeMode: ShortNoticeMode;
}) {
  const remainingMs = input.startsAt.getTime() - input.now.getTime();
  const leadMs = input.leadMinutes * 60_000;
  if (remainingMs <= SHORT_NOTICE_DELAY_MS) return { kind: 'SKIP' as const };
  if (remainingMs >= leadMs) return { kind: 'STANDARD' as const, runAt: new Date(input.startsAt.getTime() - leadMs) };
  if (input.shortNoticeMode === 'SKIP') return { kind: 'SKIP' as const };
  return { kind: 'UPCOMING' as const, runAt: new Date(input.now.getTime() + SHORT_NOTICE_DELAY_MS) };
}

export function appointmentLifecycleDedupeKey(type: string, appointmentId: string, scheduleRevision: number) {
  return `${type}:${appointmentId}:${scheduleRevision}`;
}

export function appointmentCompletionDedupeKey(type: 'AFTERCARE_FOLLOWUP' | 'REVIEW_FOLLOWUP', appointmentId: string, completedAt: Date) {
  return `${type}:${appointmentId}:${completedAt.toISOString()}`;
}

export type AftercareCandidate = {
  id: string;
  organizationId: string;
  locationId: string | null;
  serviceType: string | null;
  category: string | null;
  active: boolean;
  sortOrder: number;
};

export function selectAppointmentAftercare<T extends AftercareCandidate>(candidates: T[], input: {
  organizationId: string;
  locationId: string | null;
  serviceType: string | null;
  category: string | null;
}) {
  return candidates.filter(item => item.active && item.organizationId === input.organizationId)
    .filter(item => !item.locationId || item.locationId === input.locationId)
    .filter(item => !item.serviceType || item.serviceType.toLowerCase() === input.serviceType?.toLowerCase())
    .filter(item => !item.category || item.category.toLowerCase() === input.category?.toLowerCase())
    .map(item => ({ item, score: (item.locationId ? 80 : 0) + (item.serviceType ? 40 : 0) + (item.category ? 20 : 0) - item.sortOrder / 1000 }))
    .sort((left, right) => right.score - left.score)[0]?.item ?? null;
}

export function venmoPaymentInstructions(input: {
  enabled: boolean;
  username: string | null;
  paymentUrl: string | null;
  instructions: string | null;
}) {
  if (!input.enabled || !input.username || !/^[A-Za-z0-9._-]{2,32}$/.test(input.username) || !input.instructions?.trim() || input.instructions.length > 500) return null;
  if (input.paymentUrl && !isVenmoPaymentUrl(input.paymentUrl)) return null;
  return {
    provider: 'VENMO_MANUAL' as const,
    handle: input.username,
    paymentUrl: input.paymentUrl,
    instructions: input.instructions,
    paymentStatus: 'AWAITING_MANUAL_CONFIRMATION' as const,
  };
}

export function isVenmoPaymentUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['venmo.com', 'www.venmo.com'].includes(url.hostname.toLowerCase()) && !url.username && !url.password;
  } catch { return false; }
}

export function isGoogleReviewUrl(value: string | null) {
  try {
    if (!value) return false;
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const googleHost = hostname === 'google.com' || hostname.endsWith('.google.com') || hostname === 'g.page' || hostname === 'goo.gl';
    return url.protocol === 'https:' && googleHost && !url.username && !url.password;
  } catch { return false; }
}
