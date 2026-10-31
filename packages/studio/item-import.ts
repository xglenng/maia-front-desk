import {z} from 'zod';
import type {SquareServiceVariation} from '@/packages/scheduling/square/client';
export const importedItemSchema=z.object({name:z.string().trim().min(1).max(120),category:z.string().trim().max(80).nullable(),sku:z.string().trim().max(80).nullable(),priceCents:z.number().int().min(1).max(100_000_000).nullable(),taxBasisPoints:z.number().int().min(0).max(10000)}).strict();
export type ImportedItem=z.infer<typeof importedItemSchema>;
export const itemImportKey=(item:Pick<ImportedItem,'name'>)=>item.name.trim().toLocaleLowerCase('en-US');
export function squareRetailItems(rows:SquareServiceVariation[]){
 if(rows.length>250)throw Error('Import at most 250 items at a time.');
 let skipped=0;
 const items:ImportedItem[]=[];
 for(const row of rows){
  if(row.pricingType!=='FIXED_PRICING'&&row.pricingType!=='VARIABLE_PRICING'){skipped++;continue;}
  if(row.pricingType==='FIXED_PRICING'&&(row.currency!=='USD'||row.priceCents==null||!Number.isSafeInteger(row.priceCents)||row.priceCents<1||row.priceCents>100_000_000)){skipped++;continue;}
  items.push({name:row.name,category:row.category||null,sku:row.sku||null,priceCents:row.pricingType==='VARIABLE_PRICING'?null:row.priceCents!,taxBasisPoints:0});
 }
 return {items,skipped};
}
