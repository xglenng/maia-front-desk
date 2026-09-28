import type { schedulingConnections, serviceProviderMappings, services } from '@db/schema';

export type AvailabilitySlot = { start: string; end: string };

export type AvailabilityResult =
  | { status: 'AVAILABLE'; slots: AvailabilitySlot[] }
  | { status: 'NO_AVAILABILITY'; slots: [] }
  | { status: 'NOT_CONFIGURED'; slots: []; message: string }
  | { status: 'SERVICE_NOT_MAPPED'; slots: []; message: string }
  | { status: 'PROVIDER_ERROR'; slots: []; message: string };

export type AvailabilityRequest = {
  serviceId?: string;
  durationMinutes: number;
  from: string;
  to: string;
  now?: Date;
};

export type ProviderAvailabilityInput = AvailabilityRequest & {
  organizationId: string;
  artistId: string;
  locationTimezone?: string;
  connection?: typeof schedulingConnections.$inferSelect;
  mapping?: typeof serviceProviderMappings.$inferSelect;
  service?: typeof services.$inferSelect;
};

export interface SchedulingProvider {
  readonly key: string;
  getAvailability(input: ProviderAvailabilityInput): Promise<AvailabilityResult>;
  createBooking?(input: ProviderBookingInput): Promise<BookingResult>;
}
export type BookingRequest = {
  serviceId: string;
  clientId: string;
  start: string;
  idempotencyKey: string;
};

export type BookingResult =
  | { status: 'BOOKED'; provider: string; providerBookingId: string; providerCustomerId: string; start: string; end: string }
  | { status: 'SLOT_UNAVAILABLE'; message: string }
  | { status: 'NOT_CONFIGURED'; message: string }
  | { status: 'SERVICE_NOT_MAPPED'; message: string }
  | { status: 'CUSTOMER_ERROR'; message: string }
  | { status: 'PROVIDER_ERROR'; message: string };

export type ProviderBookingInput = BookingRequest & {
  organizationId: string;
  artistId: string;
  connection: typeof schedulingConnections.$inferSelect;
  mapping: typeof serviceProviderMappings.$inferSelect;
  service: typeof services.$inferSelect;
  client: { id: string; firstName: string; lastName: string | null; email: string | null; phone: string | null; providerCustomerId: string | null };
};
