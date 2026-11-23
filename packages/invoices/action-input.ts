import { z } from 'zod';

export const invoiceEmail = z.string().trim().email('Enter a valid customer email address.').max(254);
const optionalActionEmail = z.preprocess(value => typeof value === 'string' && !value.trim() ? undefined : value, invoiceEmail.optional());
export const invoiceActionInput = z.object({
 action:z.enum(['ISSUE','SYNC','SEND_SMS','SEND_EMAIL','VOID']),
 invoiceId:z.string().uuid(),
 customerEmail:optionalActionEmail,
 recipientEmail:optionalActionEmail,
});
