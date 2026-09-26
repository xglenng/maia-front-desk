type PricingValues = {
  pricingType: string;
  basePriceCents?: number | null;
  hourlyRateCents?: number | null;
  startingAt?: boolean;
};

type ExistingPricing = {
  pricingType: string;
  basePriceCents: number | null;
  hourlyRateCents: number | null;
  startingAt: boolean;
};

export function normalizeServicePricing(input: PricingValues, current?: ExistingPricing) {
  const typeChanged = current != null && input.pricingType !== current.pricingType;
  const hasBasePrice = Object.prototype.hasOwnProperty.call(input, 'basePriceCents');
  const hasHourlyRate = Object.prototype.hasOwnProperty.call(input, 'hourlyRateCents');

  return {
    basePriceCents: input.pricingType === 'FLAT'
      ? hasBasePrice ? input.basePriceCents ?? null : current && !typeChanged ? current.basePriceCents : null
      : null,
    hourlyRateCents: input.pricingType === 'HOURLY'
      ? hasHourlyRate ? input.hourlyRateCents ?? null : current && !typeChanged ? current.hourlyRateCents : null
      : null,
    startingAt: input.pricingType === 'QUOTE' ? false : input.startingAt ?? current?.startingAt ?? false,
  };
}