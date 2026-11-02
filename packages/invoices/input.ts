import {z} from 'zod';
export const invoiceInput=z.object({artistId:z.string().uuid(),requestId:z.string().uuid(),clientId:z.string().uuid().optional(),clientName:z.string().trim().min(1).max(160),clientEmail:z.union([z.string().trim().email().max(254),z.literal('')]).default(''),dueDays:z.number().int().min(1).max(90).default(1),note:z.string().trim().max(1000).default(''),lines:z.array(z.object({name:z.string().trim().min(1).max(160),quantity:z.number().int().min(1).max(99),unitCents:z.number().int().min(1).max(100_000_000)})).min(1).max(40)}).refine(value=>value.lines.reduce((total,line)=>total+line.quantity*line.unitCents,0)<=100_000_000,'Invoice total exceeds the limit.');

/** Stripe invoice due dates are payment terms, not automatic link expiry. */
export function invoiceDeadlineText(dueAt?:number|null){
 return dueAt&&Number.isFinite(dueAt)?` Payment due by ${new Date(dueAt*1000).toISOString()} (UTC).`:'';
}
