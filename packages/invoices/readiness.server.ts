import 'server-only';
import {db} from '@/packages/db/src';
import {studioPaymentAccounts} from '@/packages/db/src/schema';
import {eq} from 'drizzle-orm';
import {counterCardConfiguration} from '@/packages/checkout/card-config.server';
import {stripeAccountReady} from '@/packages/integrations/stripe-connect-policy';
export async function invoicePaymentsReady(organizationId:string){
 try{const {livemode}=counterCardConfiguration();const [account]=await db.select().from(studioPaymentAccounts).where(eq(studioPaymentAccounts.organizationId,organizationId)).limit(1);return Boolean(account&&account.livemode===livemode&&stripeAccountReady({charges_enabled:account.chargesEnabled,payouts_enabled:account.payoutsEnabled,details_submitted:account.detailsSubmitted}));}catch{return false;}
}
