/** Quote scheduling must use the artist's recorded service, never a guessed search result. */
export function approvedAvailabilityInput<T extends { serviceId: string; artistPreference?: string }>(input: T, quote: { action: string; serviceId: string } | null) {
  return quote?.action === 'QUOTE_AI_SCHEDULING' ? { ...input, serviceId: quote.serviceId, artistPreference: undefined } : input;
}
