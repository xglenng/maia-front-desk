import { protectedRoute } from '@/packages/auth/server';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@db';
import { artists, organizations, phoneNumbers, twilioAccounts, twilioMessagingServices } from '@db/schema';
import { addNumberToMessagingService, createMessagingService, createTwilioSubaccount, decryptSecret, encryptSecret, findAvailableLocalNumber, purchasePhoneNumber } from '@integrations/twilio';
import { isE164PhoneNumber, mockPhoneNumber } from '@integrations/mock-twilio';

const schema = z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid(), areaCode: z.string().regex(/^\d{3}$/).optional() });

function webhookUrl() {
  const base = process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!base || base.includes('localhost')) throw new Error('Set TWILIO_WEBHOOK_BASE_URL to a publicly reachable HTTPS URL before provisioning a Twilio number.');
  return `${base.replace(/\/$/, '')}/api/twilio/inbound`;
}

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
    if (existingAccount && existingNumber) return NextResponse.json({ status: 'already_provisioned', phoneNumber: existingNumber.phoneNumber });

    let account = existingAccount;
    if (!account) {
      const created = await createTwilioSubaccount(`${org.name} - ${artist.displayName}`);
      account = (await db.insert(twilioAccounts).values({ organizationId, artistId, accountSid: created.sid, authTokenEncrypted: encryptSecret(created.auth_token), status: 'ACTIVE' }).returning())[0];
    }

    let service = existingService;
    const authToken = decryptSecret(account.authTokenEncrypted);
    if (!service) {
      const createdService = await createMessagingService(account.accountSid, authToken, `${org.name} SMS`, webhookUrl());
      service = (await db.insert(twilioMessagingServices).values({ organizationId, artistId, twilioAccountId: account.id, serviceSid: createdService.sid, status: 'ACTIVE' }).returning())[0];
    }

    const phone = await findAvailableLocalNumber(account.accountSid, authToken, areaCode);
    const purchased = await purchasePhoneNumber(account.accountSid, authToken, phone, webhookUrl());
    await addNumberToMessagingService(account.accountSid, authToken, service.serviceSid, purchased.sid);
    const [row] = await db.insert(phoneNumbers).values({ organizationId, artistId, phoneNumber: purchased.phone_number, provider: 'twilio', twilioAccountId: account.id, twilioPhoneNumberSid: purchased.sid, twilioMessagingServiceSid: service.serviceSid, complianceStatus: 'NOT_REGISTERED', lifecycleRole: 'TEMPORARY', isPrimary: true, active: false }).returning();
    return NextResponse.json({ status: 'provisioned_pending_compliance', phoneNumber: row.phoneNumber, phoneNumberSid: purchased.sid, messagingServiceSid: service.serviceSid, twilioAccountSid: account.accountSid, message: 'Number purchased. Outbound SMS remains disabled until A2P campaign approval.' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to provision Twilio resources.' }, { status: 500 });
  }
}


export const POST = protectedRoute(handlePOST, true);
