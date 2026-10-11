type Service = { durationMinutes: number; pricingType: string; requiresArtistApproval?: boolean };

// Zero represents an inquiry whose duration is pending; it is never a bookable duration.
export function validServiceDuration(service: Service): boolean {
  return Number.isInteger(service.durationMinutes) && service.durationMinutes <= 1440 &&
    (service.durationMinutes > 0 || (service.durationMinutes === 0 && service.pricingType === 'QUOTE' && service.requiresArtistApproval === true));
}

export function needsServiceQuote(service: Service): boolean {
  return service.durationMinutes <= 0 || (service.pricingType === 'QUOTE' && service.requiresArtistApproval === true);
}
