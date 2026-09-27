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
}