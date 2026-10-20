import { z } from 'zod';
export const calendarHoursSchema=z.array(z.object({dayOfWeek:z.number().int().min(0).max(6),startMinute:z.number().int().min(0).max(1439),endMinute:z.number().int().min(1).max(1440)}).refine(row=>row.endMinute>row.startMinute,'End must be after start.')).max(28).refine(rows=>!rows.some((a,i)=>rows.some((b,j)=>i<j&&a.dayOfWeek===b.dayOfWeek&&a.startMinute<b.endMinute&&a.endMinute>b.startMinute)),'Hours must not overlap.');
export function nativeDeposit(service:{depositType:string;depositAmountCents:number|null;depositPercent:number|null},priceCents:number) {
 if(service.depositType==='NONE')return 0;
 if(service.depositType==='FIXED'&&Number.isInteger(service.depositAmountCents)&&service.depositAmountCents!>0)return service.depositAmountCents!;
 if(service.depositType==='PERCENT'&&Number.isInteger(service.depositPercent)&&service.depositPercent!>0&&service.depositPercent!<=100)return Math.round(priceCents*service.depositPercent!/100);
 throw new Error('The service deposit configuration needs attention.');
}
export function calendarDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function addCalendarDate(value:string,days:number){const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
