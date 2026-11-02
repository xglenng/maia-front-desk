import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@db';
import { artists, legalCustomers, legalCustomerAccounts, twilioAccounts, twilioAccountCreationIntents, complianceProfiles } from '@db/schema';
import { identity, protectedSettingsRoute as protectedRoute } from '@/packages/auth/server';

async function handleGET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get('organizationId')!;
  try {
    const actor=await identity(request);
    const [customers, accounts, bindings, providers, intents, profiles] = await Promise.all([
      db.select({ id: legalCustomers.id, legalName: legalCustomers.legalName, customerType: legalCustomers.customerType }).from(legalCustomers).where(eq(legalCustomers.organizationId, organizationId)),
      db.select({ id: twilioAccounts.id, accountSid: twilioAccounts.accountSid, status: twilioAccounts.status }).from(twilioAccounts).where(eq(twilioAccounts.organizationId, organizationId)),
      db.select({ legalCustomerId: legalCustomerAccounts.legalCustomerId, accountId: legalCustomerAccounts.twilioAccountId }).from(legalCustomerAccounts).where(eq(legalCustomerAccounts.organizationId, organizationId)),
      db.select({ id: artists.id, displayName: artists.displayName, userId: artists.userId }).from(artists).where(eq(artists.organizationId, organizationId)),
      db.select({ id: twilioAccountCreationIntents.id, status: twilioAccountCreationIntents.status }).from(twilioAccountCreationIntents).where(eq(twilioAccountCreationIntents.organizationId, organizationId)),
      db.select({businessName:complianceProfiles.businessName}).from(complianceProfiles).where(eq(complianceProfiles.organizationId,organizationId)).limit(1),
    ]);
    return NextResponse.json({ customers, accounts, bindings, artists: providers.map(({id,displayName})=>({id,displayName})), intents, savedBusinessName:profiles[0]?.businessName ?? null, defaultArtistId:providers.find(artist=>artist.userId===actor?.id)?.id ?? null,
      liveCreationEnabled: process.env.MAIA_STAGING_ISOLATED !== '1' && process.env.TWILIO_PROVISION_MODE === 'live' && process.env.TWILIO_ACCOUNT_CREATION_ENABLED === 'true',
      providerVerified: false, registrationApproved: false },{headers:{"Cache-Control":"private, no-store"}});
  } catch { return NextResponse.json({ error: 'Unable to load legal-business setup.' }, { status: 500 }); }
}
export const GET = protectedRoute(handleGET, true);
