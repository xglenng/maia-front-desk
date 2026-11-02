import { z } from 'zod';
import { normalizePhone } from '@/packages/consent';

export const calendarClientSchema = z.object({
  firstName: z.string().trim().min(2).max(120),
  phone: z.string().max(60).transform((value, context) => {
    try { return normalizePhone(value); }
    catch {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a 10-digit US phone number, or an international number beginning with +.' });
      return z.NEVER;
    }
  }).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
});
