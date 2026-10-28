import {z} from 'zod';
export const extractedServices=z.object({services:z.array(z.object({name:z.string().trim().min(1).max(120),description:z.string().max(500).nullable(),durationMinutes:z.number().int().min(1).max(1440).nullable(),price:z.number().min(0).max(21474836).nullable(),pricingType:z.enum(['FLAT','HOURLY','QUOTE']),category:z.string().max(80).nullable()})).min(1).max(100)});
export function extractionCsv(input:z.infer<typeof extractedServices>){
 const cell=(value:unknown)=>`"${String(value??'').replaceAll('"','""')}"`;
 return ['Name,Service Type,Duration Minutes,Pricing Type,Price,Category,Description',...input.services.map(service=>[service.name,'OTHER',service.durationMinutes,service.pricingType,service.price===null?'':service.price.toFixed(2),service.category,service.description].map(cell).join(','))].join('\r\n');
}
