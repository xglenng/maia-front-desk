import { z } from 'zod';

export const quoteActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('APPROVE'), serviceId: z.string().uuid(), priceCents: z.number().int().nonnegative().max(10000000), durationMinutes: z.number().int().min(1).max(1440) }).strict(),
  z.object({ action: z.literal('LINK_BOOKING'), bookingId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/) }).strict(),
]);

export type QuoteState = { action: 'QUOTE_APPROVED' | 'QUOTE_BOOKING_LINKED' | 'QUOTE_ACCEPTED'; serviceId: string; priceCents: number; durationMinutes: number; appointmentId?: string; bookingId?: string; startsAt?: string; endsAt?: string };

export function matchesQuoteBooking(input: { status?: string; locationId?: string; expectedLocation: string; teamMembers: Array<string | undefined>; expectedTeam: string; customerId: string; expectedCustomerId: string | null; customerPhone?: string; clientPhone: string | null; duration: number; expectedDuration: number }): boolean {
  const digits = (phone: string | null | undefined) => phone?.replace(/\D/g, '') || '';
  return input.status === 'ACCEPTED' && input.locationId === input.expectedLocation && input.teamMembers.length > 0 && input.teamMembers.every(team => team === input.expectedTeam) && input.duration === input.expectedDuration &&
    (input.customerId === input.expectedCustomerId || (Boolean(digits(input.clientPhone)) && digits(input.customerPhone) === digits(input.clientPhone)));
}

export function parseQuoteState(action: string, details: unknown): QuoteState | null {
  if (action !== 'QUOTE_APPROVED' && action !== 'QUOTE_BOOKING_LINKED' && action !== 'QUOTE_ACCEPTED') return null;
  const value = z.object({ serviceId: z.string().uuid(), priceCents: z.number().int().nonnegative(), durationMinutes: z.number().int().positive(), appointmentId: z.string().uuid().optional(), bookingId: z.string().optional(), startsAt: z.string().datetime().optional(), endsAt: z.string().datetime().optional() }).safeParse(details);
  if (!value.success) return null;
  if (action !== 'QUOTE_APPROVED' && (!value.data.bookingId || !value.data.startsAt || !value.data.endsAt)) return null;
  return { ...value.data, action };
}

export function explicitQuoteAgreement(text: string): boolean {
  return /^(yes|yes please|yes that works|yes that works for me|that works|that works for me|sounds good|sounds good to me|i agree|agreed|ok|okay|ok let.s do it|okay let.s do it|let.s do it)[.! ]*$/i.test(text.trim());
}
export function matchesConfirmedQuoteTerms(input: { text: string; replyAt: Date; termsAt: Date; presented?: { bookingId?: string; priceCents?: number; startsAt?: string }; approved: { bookingId?: string; priceCents: number; startsAt?: string } }) {
  return input.replyAt > input.termsAt && explicitQuoteAgreement(input.text) && Boolean(input.approved.bookingId && input.approved.startsAt) && input.presented?.bookingId === input.approved.bookingId && input.presented?.priceCents === input.approved.priceCents && input.presented?.startsAt === input.approved.startsAt;
}
export function approvedQuoteDeposit(priceCents: number, service: { depositType: string; depositAmountCents: number | null; depositPercent: number | null }) {
  if (service.depositType === 'FIXED') return service.depositAmountCents && service.depositAmountCents > 0 ? service.depositAmountCents : 0;
  if (service.depositType === 'PERCENT' && service.depositPercent && service.depositPercent >= 1 && service.depositPercent <= 100) return Math.round(priceCents * service.depositPercent / 100);
  return 0;
}
