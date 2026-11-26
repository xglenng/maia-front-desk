import 'server-only';
import {and,eq} from 'drizzle-orm';
import type Stripe from 'stripe';
import {db} from '@/packages/db/src';
import {studioInvoices,studioPaymentAccounts} from '@/packages/db/src/schema';
import {getStripe} from '@/packages/integrations/payments';
import {counterCardConfiguration} from '@/packages/checkout/card-config.server';
import {readInvoiceShareToken,invoiceReference,safeInvoicePaymentUrl} from './share-token.server';
import {invoicePaymentMatches,invoicePublishableKey} from './embedded-policy';
import {reconcilePaidInvoice} from './reconcile.server';

export async function embeddedInvoicePayment(token:string,stripe?:Stripe){
 if(process.env.MAIA_INVOICE_EMBEDDED_ENABLED!=='true')throw Error('Embedded invoice payment is unavailable.');
 const access=readInvoiceShareToken(token);if(!access)return null;
 const [row]=await db.select().from(studioInvoices).where(and(eq(studioInvoices.id,access.invoiceId),eq(studioInvoices.organizationId,access.organizationId))).limit(1);
 const url=safeInvoicePaymentUrl(row?.hostedUrl||null);
 if(!row||!url||invoiceReference(url)!==access.reference||!['OPEN','PAID'].includes(row.status)||!row.stripeAccountId||!row.stripeInvoiceId)return null;
 const {livemode}=counterCardConfiguration();
 const publishableKey=invoicePublishableKey(process.env.STRIPE_PUBLISHABLE_KEY,livemode);
 const [account]=await db.select().from(studioPaymentAccounts).where(and(eq(studioPaymentAccounts.organizationId,row.organizationId),eq(studioPaymentAccounts.stripeAccountId,row.stripeAccountId))).limit(1);
 if(!account||account.livemode!==livemode)return null;
 const remote=await (stripe||getStripe()).invoices.retrieve(row.stripeInvoiceId,{expand:['confirmation_secret']},{stripeAccount:row.stripeAccountId});
 if(!invoicePaymentMatches(row,remote,livemode))throw Error('Invoice payment reference mismatch.');
 const summary={lines:row.lines,totalCents:row.totalCents,dueAt:remote.due_date,number:remote.number,testMode:!livemode};
 if(remote.status==='paid'){
  await reconcilePaidInvoice(row.id,row.stripeAccountId,remote,livemode);
  return {...summary,state:'PAID' as const};
 }
 if(remote.status!=='open'||row.status==='PAID')return null;
 if(!Number.isSafeInteger(remote.amount_remaining)||remote.amount_remaining<=0||remote.amount_remaining>row.totalCents)throw Error('Invoice balance needs review.');
 const clientSecret=remote.confirmation_secret?.client_secret;
 if(!clientSecret||!/^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/.test(clientSecret))throw Error('The invoice’s secure payment form is unavailable.');
 return {...summary,state:'OPEN' as const,amountRemaining:remote.amount_remaining,publishableKey,stripeAccountId:row.stripeAccountId,clientSecret};
}
