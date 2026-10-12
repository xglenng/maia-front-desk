import { z } from 'zod';

export const quoteActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('APPROVE'), serviceId: z.string().uuid(), priceCents: z.number().int().nonnegative().max(10000000), durationMinutes: z.number().int().min(1).max(1440) }).strict(),
  z.object({ action: z.literal('LINK_BOOKING'), bookingId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/) }).strict(),
]);

export type QuoteState = { action: 'QUOTE_APPROVED' | 'QUOTE_BOOKING_LINKED'; serviceId: string; priceCents: number; durationMinutes: number; bookingId?: string; startsAt?: string; endsAt?: string };

export function matchesQuoteBooking(input: { status?: string; locationId?: string; expectedLocation: string; teamMembers: Array<string | undefined>; expectedTeam: string; customerId: string; expectedCustomerId: string | null; customerPhone?: string; clientPhone: string | null; duration: number; expectedDuration: number }): boolean {
  const digits = (phone: string | null | undefined) => phone?.replace(/\D/g, '') || '';
  return input.status === 'ACCEPTED' && input.locationId === input.expectedLocation && input.teamMembers.length > 0 && input.teamMembers.every(team => team === input.expectedTeam) && input.duration === input.expectedDuration &&
    (input.customerId === input.expectedCustomerId || (Boolean(digits(input.clientPhone)) && digits(input.customerPhone) === digits(input.clientPhone)));
}

export function parseQuoteState(action: string, details: unknown): QuoteState | null {
  if (action !== 'QUOTE_APPROVED' && action !== 'QUOTE_BOOKING_LINKED') return null;
  const value = z.object({ serviceId: z.string().uuid(), priceCents: z.number().int().nonnegative(), durationMinutes: z.number().int().positive(), bookingId: z.string().optional(), startsAt: z.string().datetime().optional(), endsAt: z.string().datetime().optional() }).safeParse(details);
  if (!value.success) return null;
  if (action === 'QUOTE_BOOKING_LINKED' && (!value.data.bookingId || !value.data.startsAt || !value.data.endsAt)) return null;
  return { ...value.data, action };
}
