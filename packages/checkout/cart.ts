import {z} from 'zod';
export const cartSchema=z.object({artistId:z.string().uuid(),requestId:z.string().uuid(),lines:z.array(z.object({kind:z.enum(['SERVICE','ITEM','CUSTOM']),id:z.string().uuid().optional(),quantity:z.number().int().min(1).max(99),customName:z.string().trim().min(1).max(120).optional(),customPriceCents:z.number().int().min(1).max(100_000_000).optional()})).min(1).max(100),tipCents:z.number().int().min(0).max(100_000_000).default(0),note:z.string().max(1000).default(''),tender:z.enum(['CASH','EXTERNAL'])});
export type CartInput=z.infer<typeof cartSchema>;
export type CatalogEntry={id:string;kind:'SERVICE'|'ITEM';name:string;priceCents:number|null;category:string|null;taxBasisPoints:number};
export function priceCart(input:CartInput,catalog:CatalogEntry[]){
 const lines=input.lines.map(line=>{
  const entry=line.kind==='CUSTOM'?null:catalog.find(entry=>entry.kind===line.kind&&entry.id===line.id);
  if(line.kind!=='CUSTOM'&&!entry)throw Error('An item is unavailable. Refresh the catalog.');
  const price=entry?.priceCents??line.customPriceCents;
  if(!Number.isSafeInteger(price)||price!<1||price!>100_000_000)throw Error('Enter a price for variable-price items.');
  const name=entry?.name||line.customName;if(!name)throw Error('Add a name for the custom amount.');
  const subtotal=price!*line.quantity;const tax=Math.round(subtotal*(entry?.taxBasisPoints||0)/10000);
  return {kind:line.kind,id:entry?.id||null,name,quantity:line.quantity,unitPriceCents:price!,subtotalCents:subtotal,taxCents:tax};
 });
 const subtotalCents=lines.reduce((sum,line)=>sum+line.subtotalCents,0),taxCents=lines.reduce((sum,line)=>sum+line.taxCents,0),totalCents=subtotalCents+taxCents+input.tipCents;
 if(!Number.isSafeInteger(totalCents)||totalCents>100_000_000)throw Error('Sale total exceeds the allowed amount.');
 return {lines,subtotalCents,taxCents,tipCents:input.tipCents,totalCents};
}
