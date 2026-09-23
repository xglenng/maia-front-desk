import { protectedRoute } from '@/packages/auth/server';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@db';
import { artists, phoneNumbers, twilioAccounts, twilioMessagingServices } from '@db/schema';

async function handleGET(req: Request) {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get('organizationId');
  if (!organizationId) return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
  const artistId = url.searchParams.get('artistId');
  const artistsRows = artistId
    ? await db.select({ id: artists.id, displayName: artists.displayName }).from(artists).where(and(eq(artists.organizationId, organizationId), eq(artists.id, artistId)))
    : await db.select({ id: artists.id, displayName: artists.displayName }).from(artists).where(eq(artists.organizationId, organizationId));
  const results = [];
  for (const artist of artistsRows) {
    const [account] = await db.select({ sid: twilioAccounts.accountSid, status: twilioAccounts.status }).from(twilioAccounts).where(and(eq(twilioAccounts.organizationId, organizationId), eq(twilioAccounts.artistId, artist.id))).limit(1);
    const [service] = await db.select({ sid: twilioMessagingServices.serviceSid, status: twilioMessagingServices.status }).from(twilioMessagingServices).where(and(eq(twilioMessagingServices.organizationId, organizationId), eq(twilioMessagingServices.artistId, artist.id))).limit(1);
    const [number] = await db.select({ phoneNumber: phoneNumbers.phoneNumber, sid: phoneNumbers.twilioPhoneNumberSid, active: phoneNumbers.active, complianceStatus: phoneNumbers.complianceStatus, lifecycleRole: phoneNumbers.lifecycleRole }).from(phoneNumbers).where(and(eq(phoneNumbers.organizationId, organizationId), eq(phoneNumbers.artistId, artist.id), eq(phoneNumbers.isPrimary, true))).limit(1);
    results.push({ artist, account: account ?? null, messagingService: service ?? null, phoneNumber: number ?? null, provisioned: Boolean(account && service && number) });
  }
  return NextResponse.json({ artists: results });
}

export const GET = protectedRoute(handleGET, false);
