import 'server-only';
import {and,eq,or,sql} from 'drizzle-orm';
import type Stripe from 'stripe';
import {db} from '@/packages/db/src';
import {artists,invoiceNotifications,studioInvoices,users} from '@/packages/db/src/schema';
import {invoiceFields} from './fields';

type InvoicePayment = Pick<Stripe.Invoice,'id'|'livemode'|'currency'|'status'|'total'|'hosted_invoice_url'|'metadata'>;
export async function reconcilePaidInvoice(invoiceId:string, accountId:string, remote:InvoicePayment, livemode:boolean) {
 return db.transaction(async tx=>{
  await tx.execute(sql`SELECT id FROM studio_invoices WHERE id=${invoiceId} FOR UPDATE`);
  const [invoice]=await tx.select().from(studioInvoices).where(eq(studioInvoices.id,invoiceId));
  if(!invoice || invoice.stripeAccountId!==accountId || invoice.stripeInvoiceId!==remote.id ||
   remote.livemode!==livemode || remote.currency!=='usd' || remote.status!=='paid' ||
   remote.total!==invoice.totalCents || remote.metadata?.maiaInvoiceId!==invoice.id ||
   remote.metadata?.organizationId!==invoice.organizationId || remote.metadata?.artistId!==invoice.artistId)
   throw Error('Invoice payment details do not match the saved invoice.');
  const [artist]=await tx.select({userId:artists.userId}).from(artists)
   .where(and(eq(artists.id,invoice.artistId),eq(artists.organizationId,invoice.organizationId)));
  if(!artist)throw Error('Invoice artist not found.');
  const recipients=await tx.select({id:users.id}).from(users).where(and(eq(users.organizationId,invoice.organizationId),
   or(eq(users.role,'OWNER'),artist.userId ? and(eq(users.role,'ARTIST'),eq(users.id,artist.userId)) : undefined)));
  const [updated]=await tx.update(studioInvoices).set({status:'PAID',hostedUrl:remote.hosted_invoice_url,updatedAt:new Date()})
   .where(and(eq(studioInvoices.id,invoice.id),eq(studioInvoices.organizationId,invoice.organizationId))).returning(invoiceFields);
  if(recipients.length)await tx.insert(invoiceNotifications).values(recipients.map(recipient=>({
   organizationId:invoice.organizationId,invoiceId:invoice.id,userId:recipient.id,
  }))).onConflictDoNothing({target:[invoiceNotifications.invoiceId,invoiceNotifications.userId]});
  return updated;
 });
}
