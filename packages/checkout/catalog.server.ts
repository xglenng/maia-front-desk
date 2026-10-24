import {and,eq,asc} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {retailItems,services} from '@/packages/db/src/schema';
import type {CatalogEntry} from './cart';
export async function checkoutCatalog(organizationId:string,artistId:string):Promise<CatalogEntry[]>{
 const [serviceRows,itemRows]=await Promise.all([
 db.select().from(services).where(and(eq(services.organizationId,organizationId),eq(services.artistId,artistId),eq(services.active,true))).orderBy(asc(services.name)),
 db.select().from(retailItems).where(and(eq(retailItems.organizationId,organizationId),eq(retailItems.artistId,artistId),eq(retailItems.active,true))).orderBy(asc(retailItems.name))]);
 return [...serviceRows.map(s=>({id:s.id,kind:'SERVICE' as const,name:s.name,priceCents:s.pricingType==='FLAT'&&!s.startingAt?s.basePriceCents:null,category:s.category,taxBasisPoints:0})),...itemRows.map(i=>({id:i.id,kind:'ITEM' as const,name:i.name,priceCents:i.priceCents,category:i.category,taxBasisPoints:i.taxBasisPoints}))];
}
