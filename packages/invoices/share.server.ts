import {and,eq,inArray} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {organizations,studioInvoices,studioLogoAssets} from '@/packages/db/src/schema';
import {invoiceReference,readInvoiceShareToken,safeInvoicePaymentUrl} from './share-token.server';

export async function publicInvoiceShare(token:string){
 const access=readInvoiceShareToken(token);
 if(!access)return null;
 const [row]=await db.select({hostedUrl:studioInvoices.hostedUrl,name:organizations.name,publicName:organizations.publicName})
  .from(studioInvoices).innerJoin(organizations,eq(organizations.id,studioInvoices.organizationId))
  .where(and(eq(studioInvoices.id,access.invoiceId),eq(studioInvoices.organizationId,access.organizationId),inArray(studioInvoices.status,['OPEN','PAID']))).limit(1);
 const paymentUrl=safeInvoicePaymentUrl(row?.hostedUrl??null);
 if(!row||!paymentUrl||invoiceReference(paymentUrl)!==access.reference)return null;
 const [logo]=await db.select({id:studioLogoAssets.id}).from(studioLogoAssets)
  .where(and(eq(studioLogoAssets.organizationId,access.organizationId),eq(studioLogoAssets.active,true))).limit(1);
 return {studioName:row.publicName?.trim()||row.name,paymentUrl,logoUrl:logo?`/api/public/studio-logo/${logo.id}`:null};
}
export function htmlText(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
