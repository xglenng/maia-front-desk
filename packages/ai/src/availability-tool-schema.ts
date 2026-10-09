import { z } from 'zod';

export const availabilityToolParameters = z.object({
  serviceId: z.string().uuid().describe('The selected serviceId returned by search_services.'),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Inclusive start date in YYYY-MM-DD format, interpreted in the selected studio timezone.'),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Optional inclusive end date; the complete range may span at most 31 calendar days.'),
  artistPreference: z.string().trim().min(1).max(100).optional().describe('Optional public artist name, normally selected from list_artists.'),
  timePeriod: z.enum(['morning', 'afternoon', 'evening']).optional().describe('Optional local slot-start preference: morning 06:00-12:00, afternoon 12:00-17:00, evening 17:00-22:00.'),
});
