/** Quote scheduling must use the artist's recorded service, never a guessed search result. */
export function approvedAvailabilityInput<T extends { serviceId: string; artistPreference?: string }>(input: T, quote: { action: string; serviceId: string } | null) {
  return quote?.action === 'QUOTE_AI_SCHEDULING' ? { ...input, serviceId: quote.serviceId, artistPreference: undefined } : input;
}

export function isRecordedBooking(result: unknown): result is { appointmentId: string; status: string } {
  if (!result || typeof result !== 'object') return false;
  const value = result as Record<string, unknown>;
  return typeof value.appointmentId === 'string' && ['CONFIRMED', 'PAYMENT_PENDING', 'HELD'].includes(String(value.status));
}
