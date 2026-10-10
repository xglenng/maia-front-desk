import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@db';
import { artists, legalCustomers, legalCustomerAccounts, twilioAccounts, twilioAccountCreationIntents } from '@db/schema';
import { protectedRoute } from '@/packages/auth/server';

async function handleGET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get('organizationId')!;
  try {
    const [customers, accounts, bindings, providers, intents] = await Promise.all([
      db.select({ id: legalCustomers.id, legalName: legalCustomers.legalName, customerType: legalCustomers.customerType }).from(legalCustomers).where(eq(legalCustomers.organizationId, organizationId)),
      db.select({ id: twilioAccounts.id, accountSid: twilioAccounts.accountSid, status: twilioAccounts.status }).from(twilioAccounts).where(eq(twilioAccounts.organizationId, organizationId)),
      db.select({ legalCustomerId: legalCustomerAccounts.legalCustomerId, accountId: legalCustomerAccounts.twilioAccountId }).from(legalCustomerAccounts).where(eq(legalCustomerAccounts.organizationId, organizationId)),
      db.select({ id: artists.id, displayName: artists.displayName }).from(artists).where(eq(artists.organizationId, organizationId)),
      db.select({ id: twilioAccountCreationIntents.id, status: twilioAccountCreationIntents.status }).from(twilioAccountCreationIntents).where(eq(twilioAccountCreationIntents.organizationId, organizationId)),
    ]);
    return NextResponse.json({ customers, accounts, bindings, artists: providers, intents,
      liveCreationEnabled: process.env.MAIA_STAGING_ISOLATED !== '1' && process.env.TWILIO_PROVISION_MODE === 'live' && process.env.TWILIO_ACCOUNT_CREATION_ENABLED === 'true',
      providerVerified: false, registrationApproved: false });
  } catch { return NextResponse.json({ error: 'Unable to load legal-business setup.' }, { status: 500 }); }
}
export const GET = protectedRoute(handleGET, true);
