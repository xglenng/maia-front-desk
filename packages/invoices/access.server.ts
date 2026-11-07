import {and,eq} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {artists,studioInvoices} from '@/packages/db/src/schema';
import type {Identity} from '@/packages/auth/server';

export async function allowedInvoiceArtist(user:Identity,artistId:string){
 const [artist]=await db.select({id:artists.id}).from(artists).where(and(eq(artists.id,artistId),eq(artists.organizationId,user.organization_id),user.role==='OWNER'?undefined:eq(artists.userId,user.id)));
 return Boolean(artist);
}
export async function authorizedInvoice(user:Identity,id:string){
 const [row]=await db.select().from(studioInvoices).where(and(eq(studioInvoices.id,id),eq(studioInvoices.organizationId,user.organization_id)));
 return row&&await allowedInvoiceArtist(user,row.artistId)?row:null;
}
