import { z } from 'zod';

export const invoiceEmail = z.string().trim().email('Enter a valid customer email address.').max(254);
const optionalActionEmail = z.preprocess(value => typeof value === 'string' && !value.trim() ? undefined : value, invoiceEmail.optional());
export const invoiceActionInput = z.object({
 action:z.enum(['ISSUE','SYNC','SEND_SMS','SEND_EMAIL','VOID','MARK_PAID','RESEND_EMAIL']),
 invoiceId:z.string().uuid(),
 requestId:z.string().uuid().optional(),
 customerEmail:optionalActionEmail,
 recipientEmail:optionalActionEmail,
}).refine(value=>value.action!=='RESEND_EMAIL'||Boolean(value.requestId),'A resend request is required.');
