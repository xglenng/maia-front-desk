import { protectedRoute } from '@/packages/auth/server';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@db';
import { artists, organizations, phoneNumbers, twilioAccounts, twilioMessagingServices } from '@db/schema';
import { addNumberToMessagingService, createMessagingService, decryptSecret, encryptSecret, findAvailableLocalNumber, purchasePhoneNumber } from '@integrations/twilio';
import { TwilioProvisionConfigurationError, twilioProvisionPreflight } from '@integrations/twilio-provision-preflight';
import { resolveLegalCustomerAccount, LegalCustomerConflict } from '@/packages/compliance/legal-customer.server';
import { provisionOperation, ProvisionReconciliationRequired } from '@integrations/provision-operation';
import { isE164PhoneNumber, mockPhoneNumber } from '@integrations/mock-twilio';

const schema = z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid(), areaCode: z.string().regex(/^\d{3}$/).optional() });

async function handlePOST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { organizationId, artistId, areaCode } = parsed.data;
  try {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
    const [artist] = await db.select().from(artists).where(and(eq(artists.id, artistId), eq(artists.organizationId, organizationId)));
    if (!org || !artist) return NextResponse.json({ error: 'Organization or artist not found.' }, { status: 404 });

    const existingAccount = (await db.select().from(twilioAccounts).where(and(eq(twilioAccounts.organizationId, organizationId), eq(twilioAccounts.artistId, artistId))))[0];
    const existingService = (await db.select().from(twilioMessagingServices).where(and(eq(twilioMessagingServices.organizationId, organizationId), eq(twilioMessagingServices.artistId, artistId))))[0];
    const existingNumber = (await db.select().from(phoneNumbers).where(and(eq(phoneNumbers.organizationId, organizationId), eq(phoneNumbers.artistId, artistId), eq(phoneNumbers.isPrimary, true))))[0];
    if (process.env.TWILIO_PROVISION_MODE === 'mock') {
      const mockPhone = mockPhoneNumber(artistId);
      if (existingNumber && !isE164PhoneNumber(existingNumber.phoneNumber)) {
        const isMockRecord = existingNumber.twilioPhoneNumberSid?.startsWith('PNMOCK') || existingAccount?.accountSid.startsWith('ACMOCK');
        if (!isMockRecord) return NextResponse.json({ error: 'The existing primary number is not valid E.164 and is not a mock record. Correct it before provisioning.' }, { status: 409 });
        const [repairedNumber] = await db.update(phoneNumbers).set({ phoneNumber: mockPhone, active: true, complianceStatus: 'MOCK_APPROVED', lifecycleRole: 'TEMPORARY', updatedAt: new Date() }).where(eq(phoneNumbers.id, existingNumber.id)).returning();
        return NextResponse.json({ status: 'repaired_provisioning', mode: 'mock', phoneNumber: repairedNumber.phoneNumber, phoneNumberSid: repairedNumber.twilioPhoneNumberSid, messagingServiceSid: existingService?.serviceSid, twilioAccountSid: existingAccount?.accountSid, message: 'Invalid mock phone number repaired with a digits-only testing number. Mock numbers cannot send or receive real messages.' });
      }
      if (existingAccount && existingService && existingNumber) return NextResponse.json({ status: 'already_provisioned', mode: 'mock', phoneNumber: existingNumber.phoneNumber, phoneNumberSid: existingNumber.twilioPhoneNumberSid, messagingServiceSid: existingService.serviceSid, twilioAccountSid: existingAccount.accountSid, message: 'Mock number is ready for workflow testing only. It cannot send or receive real messages.' });
      const mockAccount = existingAccount ?? (await db.insert(twilioAccounts).values({ organizationId, artistId, accountSid: `ACMOCK${artistId.replaceAll('-', '').slice(0, 30)}`, authTokenEncrypted: encryptSecret(`mock-token-${artistId}`), status: 'ACTIVE' }).returning())[0];
      const mockService = existingService ?? (await db.insert(twilioMessagingServices).values({ organizationId, artistId, twilioAccountId: mockAccount.id, serviceSid: `MGMOCK${artistId.replaceAll('-', '').slice(0, 30)}`, status: 'ACTIVE' }).returning())[0];
      if (existingNumber) return NextResponse.json({ status: 'repaired_provisioning', mode: 'mock', phoneNumber: existingNumber.phoneNumber, phoneNumberSid: existingNumber.twilioPhoneNumberSid, messagingServiceSid: mockService.serviceSid, twilioAccountSid: mockAccount.accountSid, message: 'Partial mock setup repaired. This number is for workflow testing only and cannot send or receive real messages.' });
      const [mockNumber] = await db.insert(phoneNumbers).values({ organizationId, artistId, phoneNumber: mockPhone, provider: 'twilio', twilioAccountId: mockAccount.id, twilioPhoneNumberSid: `PNMOCK${artistId.replaceAll('-', '').slice(0, 30)}`, twilioMessagingServiceSid: mockService.serviceSid, complianceStatus: 'MOCK_APPROVED', lifecycleRole: 'TEMPORARY', isPrimary: true, active: true }).returning();
      return NextResponse.json({ status: existingAccount || existingService ? 'repaired_provisioning' : 'provisioned', mode: 'mock', phoneNumber: mockNumber.phoneNumber, phoneNumberSid: mockNumber.twilioPhoneNumberSid, messagingServiceSid: mockService.serviceSid, twilioAccountSid: mockAccount.accountSid, message: existingAccount || existingService ? 'Partial mock setup repaired and a digits-only testing number was created. It cannot send or receive real messages.' : 'Mock number is ready for workflow testing only. It cannot send or receive real messages.' });
    }
    const binding = await resolveLegalCustomerAccount(organizationId);
    const [account] = await db.select().from(twilioAccounts).where(and(eq(twilioAccounts.organizationId, organizationId), eq(twilioAccounts.id, binding.accountId)));
    if (!account || (existingAccount && existingAccount.id !== account.id)) throw new LegalCustomerConflict('Artist account conflicts with the reviewed legal customer.');
    const { inboundUrl } = twilioProvisionPreflight({ account, service: existingService, number: existingNumber });
    if (existingService && existingNumber && existingNumber.twilioMessagingServiceSid === existingService.serviceSid) return NextResponse.json({ status: 'already_provisioned', phoneNumber: existingNumber.phoneNumber });
    const operation = <T,>(step: string, work: () => Promise<T>) => provisionOperation(organizationId, artistId, account.id, step, work);

    let service = existingService;
    const authToken = decryptSecret(account.authTokenEncrypted);
    if (!service) {
      service = await operation('SERVICE', async () => {
        const createdService = await createMessagingService(account.accountSid, authToken, `${org.name} SMS`, inboundUrl);
        return (await db.insert(twilioMessagingServices).values({ organizationId, artistId, twilioAccountId: account.id, serviceSid: createdService.sid, status: 'ACTIVE' }).returning())[0];
      });
    }

    if (existingNumber) {
      await operation('ASSOCIATE', async () => {
        await addNumberToMessagingService(account.accountSid, authToken, service.serviceSid, existingNumber.twilioPhoneNumberSid!);
        await db.update(phoneNumbers).set({ twilioMessagingServiceSid: service.serviceSid, updatedAt: new Date() }).where(and(eq(phoneNumbers.id, existingNumber.id), eq(phoneNumbers.organizationId, organizationId), eq(phoneNumbers.artistId, artistId)));
      });
      return NextResponse.json({ status: 'repaired_provisioning', phoneNumber: existingNumber.phoneNumber, messagingServiceSid: service.serviceSid, message: 'Existing number associated with its Messaging Service. Registration approval is verified separately.' });
    }

    const row = await operation('NUMBER', async () => {
      const phone = await findAvailableLocalNumber(account.accountSid, authToken, areaCode);
      const purchased = await purchasePhoneNumber(account.accountSid, authToken, phone, inboundUrl);
      return (await db.insert(phoneNumbers).values({ organizationId, artistId, phoneNumber: purchased.phone_number, provider: 'twilio', twilioAccountId: account.id, twilioPhoneNumberSid: purchased.sid, complianceStatus: 'NOT_REGISTERED', lifecycleRole: 'TEMPORARY', isPrimary: true, active: false }).returning())[0];
    });
    await operation('ASSOCIATE', async () => {
        await addNumberToMessagingService(account.accountSid, authToken, service.serviceSid, row.twilioPhoneNumberSid!);
        await db.update(phoneNumbers).set({ twilioMessagingServiceSid: service.serviceSid, updatedAt: new Date() }).where(and(eq(phoneNumbers.id, row.id), eq(phoneNumbers.organizationId, organizationId)));
    });
    return NextResponse.json({ status: 'provisioned_pending_compliance', phoneNumber: row.phoneNumber, phoneNumberSid: row.twilioPhoneNumberSid, messagingServiceSid: service.serviceSid, twilioAccountSid: account.accountSid, message: 'Number purchased. Outbound SMS remains disabled until A2P campaign approval.' });
  } catch (error) {
    if (error instanceof LegalCustomerConflict || error instanceof ProvisionReconciliationRequired || error instanceof TwilioProvisionConfigurationError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error({ event: 'twilio_provision_failed', errorType: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'Unable to provision Twilio resources. Review the provisioning state before retrying.' }, { status: 500 });
  }
}


export const POST = protectedRoute(handlePOST, true);
