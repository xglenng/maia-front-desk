import { z } from 'zod';

export const industryOptions = [
  { value: 'TATTOO', label: 'Tattoo' },
  { value: 'PIERCING', label: 'Piercing' },
  { value: 'HAIR', label: 'Hair' },
  { value: 'NAILS', label: 'Nails' },
  { value: 'ESTHETICS', label: 'Esthetics' },
  { value: 'OTHER', label: 'Other' },
] as const;
export const industry = z.enum(['TATTOO', 'PIERCING', 'HAIR', 'NAILS', 'ESTHETICS', 'OTHER']);
export type Industry = z.infer<typeof industry>;
export const industrySettings = z.object({
  industries: z.array(industry).min(1).max(6).refine(values => new Set(values).size === values.length, 'Select each specialty only once.'),
  staffTerm: z.string().trim().min(1).max(60),
  consentFormsEnabled: z.boolean(),
  requestFormsEnabled: z.boolean(),
}).strict();

export function suggestedStaffTerm(industries: Industry[]) {
  if (industries.length !== 1) return 'provider';
  return { TATTOO: 'artist', PIERCING: 'piercer', HAIR: 'stylist', NAILS: 'nail technician', ESTHETICS: 'esthetician', OTHER: 'provider' }[industries[0]];
}
