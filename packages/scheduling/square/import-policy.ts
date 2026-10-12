import type { SquareServiceVariation } from './client';

export function squareImportValues(service: SquareServiceVariation) {
  if (!service.name.trim() || service.name.length > 120 || !service.durationMinutes || service.durationMinutes < 0 || !Number.isInteger(service.durationMinutes) || service.durationMinutes > 1440) return null;
  const price = service.priceCents ?? null;
  if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > 2147483647 || service.currency !== 'USD')) return null;
  return {
    name: service.name.trim(), durationMinutes: service.durationMinutes,
    serviceType: /tattoo/i.test(service.name) ? 'TATTOO' : /piercing|lobes?/i.test(service.name) ? 'PIERCING' : 'OTHER',
    pricingType: price === null ? 'QUOTE' : 'FLAT', basePriceCents: price,
    requiresArtistApproval: price === null,
  };
}
