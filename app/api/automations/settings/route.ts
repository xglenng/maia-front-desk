import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { identity, protectedRoute } from '@/packages/auth/server';
import { db } from '@db/index';
import { artists } from '@db/schema';
import { isGoogleReviewUrl, isVenmoPaymentUrl } from '@/packages/automations/lifecycle-policy';

const settingsSchema = z.object({
  artistId: z.string().uuid(),
  smsResponseDelaySeconds: z.number().int().refine(value => [0, 60, 120, 300].includes(value)),
  metaResponseDelaySeconds: z.number().int().refine(value => [0, 60, 120, 300].includes(value)),
  venmoEnabled: z.boolean(),
  venmoUsername: z.string().trim().transform(value => value.replace(/^@/, '')).nullable(),
  venmoPaymentUrl: z.string().trim().nullable().refine(value => !value || isVenmoPaymentUrl(value), 'Use an HTTPS Venmo profile URL.'),
  venmoPaymentInstructions: z.string().trim().max(500).nullable(),
  appointmentReminderEnabled: z.boolean(),
  appointmentReminderMinutes: z.number().int().refine(value => [120, 360, 720, 1440, 2880].includes(value)),
  appointmentReminderShortNoticeMode: z.enum(['SKIP', 'SEND_AFTER_DELAY']),
  appointmentWaiverSendEnabled: z.boolean(),
  appointmentWaiverSendMinutes: z.number().int().refine(value => [120, 240, 360, 720].includes(value)),
  aftercareFollowupEnabled: z.boolean(),
  aftercareFollowupHours: z.number().int().refine(value => [12, 24, 48, 72].includes(value)),
  reviewFollowupEnabled: z.boolean(),
  reviewFollowupHours: z.number().int().refine(value => [24, 48, 72, 168].includes(value)),
  googleReviewUrl: z.string().trim().nullable().refine(value => !value || isGoogleReviewUrl(value), 'Use an HTTPS Google review URL.'),
  reviewFollowupMessage: z.string().trim().max(500).nullable(),
}).superRefine((value, context) => {
  if (value.venmoUsername && !/^[A-Za-z0-9._-]{2,32}$/.test(value.venmoUsername)) context.addIssue({ code: 'custom', path: ['venmoUsername'], message: 'Enter a 2-32 character Venmo username.' });
  if (value.venmoEnabled && (!value.venmoUsername || !value.venmoPaymentInstructions)) context.addIssue({ code: 'custom', path: ['venmoEnabled'], message: 'Add a Venmo username and payment instructions before enabling Venmo.' });
  if (value.reviewFollowupEnabled && (!value.googleReviewUrl || !value.reviewFollowupMessage)) context.addIssue({ code: 'custom', path: ['reviewFollowupEnabled'], message: 'Add a Google review URL and client message before enabling follow-up.' });
});

async function handleGET(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (user.role !== 'OWNER') return NextResponse.json({ error: 'Owner access is required.' }, { status: 403 });
  const rows = await db.select({
    id: artists.id,
    displayName: artists.displayName,
    smsResponseDelaySeconds: artists.smsResponseDelaySeconds,
    metaResponseDelaySeconds: artists.metaResponseDelaySeconds,
    venmoEnabled: artists.venmoEnabled,
    venmoUsername: artists.venmoUsername,
    venmoPaymentUrl: artists.venmoPaymentUrl,
    venmoPaymentInstructions: artists.venmoPaymentInstructions,
    appointmentReminderEnabled: artists.appointmentReminderEnabled,
    appointmentReminderMinutes: artists.appointmentReminderMinutes,
    appointmentReminderShortNoticeMode: artists.appointmentReminderShortNoticeMode,
    appointmentWaiverSendEnabled: artists.appointmentWaiverSendEnabled,
    appointmentWaiverSendMinutes: artists.appointmentWaiverSendMinutes,
    aftercareFollowupEnabled: artists.aftercareFollowupEnabled,
    aftercareFollowupHours: artists.aftercareFollowupHours,
    reviewFollowupEnabled: artists.reviewFollowupEnabled,
    reviewFollowupHours: artists.reviewFollowupHours,
    googleReviewUrl: artists.googleReviewUrl,
    reviewFollowupMessage: artists.reviewFollowupMessage,
  }).from(artists).where(eq(artists.organizationId, user.organization_id)).orderBy(artists.displayName);
  const requestedId = request.nextUrl.searchParams.get('artistId');
  const selected = rows.find(row => row.id === requestedId) ?? rows[0] ?? null;
  return NextResponse.json({ artists: rows, selected });
}

async function handlePUT(request: NextRequest) {
  const user = await identity(request);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (user.role !== 'OWNER') return NextResponse.json({ error: 'Owner access is required.' }, { status: 403 });
  const parsed = settingsSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [artist] = await db.update(artists).set({
    smsResponseDelaySeconds: parsed.data.smsResponseDelaySeconds,
    metaResponseDelaySeconds: parsed.data.metaResponseDelaySeconds,
    venmoEnabled: parsed.data.venmoEnabled,
    venmoUsername: parsed.data.venmoUsername || null,
    venmoPaymentUrl: parsed.data.venmoPaymentUrl || null,
    venmoPaymentInstructions: parsed.data.venmoPaymentInstructions || null,
    appointmentReminderEnabled: parsed.data.appointmentReminderEnabled,
    appointmentReminderMinutes: parsed.data.appointmentReminderMinutes,
    appointmentReminderShortNoticeMode: parsed.data.appointmentReminderShortNoticeMode,
    appointmentWaiverSendEnabled: parsed.data.appointmentWaiverSendEnabled,
    appointmentWaiverSendMinutes: parsed.data.appointmentWaiverSendMinutes,
    aftercareFollowupEnabled: parsed.data.aftercareFollowupEnabled,
    aftercareFollowupHours: parsed.data.aftercareFollowupHours,
    reviewFollowupEnabled: parsed.data.reviewFollowupEnabled,
    reviewFollowupHours: parsed.data.reviewFollowupHours,
    googleReviewUrl: parsed.data.googleReviewUrl || null,
    reviewFollowupMessage: parsed.data.reviewFollowupMessage || null,
  }).where(and(eq(artists.id, parsed.data.artistId), eq(artists.organizationId, user.organization_id))).returning({
    id: artists.id,
    displayName: artists.displayName,
    smsResponseDelaySeconds: artists.smsResponseDelaySeconds,
    metaResponseDelaySeconds: artists.metaResponseDelaySeconds,
    venmoEnabled: artists.venmoEnabled,
    venmoUsername: artists.venmoUsername,
    venmoPaymentUrl: artists.venmoPaymentUrl,
    venmoPaymentInstructions: artists.venmoPaymentInstructions,
    appointmentReminderEnabled: artists.appointmentReminderEnabled,
    appointmentReminderMinutes: artists.appointmentReminderMinutes,
    appointmentReminderShortNoticeMode: artists.appointmentReminderShortNoticeMode,
    appointmentWaiverSendEnabled: artists.appointmentWaiverSendEnabled,
    appointmentWaiverSendMinutes: artists.appointmentWaiverSendMinutes,
    aftercareFollowupEnabled: artists.aftercareFollowupEnabled,
    aftercareFollowupHours: artists.aftercareFollowupHours,
    reviewFollowupEnabled: artists.reviewFollowupEnabled,
    reviewFollowupHours: artists.reviewFollowupHours,
    googleReviewUrl: artists.googleReviewUrl,
    reviewFollowupMessage: artists.reviewFollowupMessage,
  });
  if (!artist) return NextResponse.json({ error: 'Artist not found.' }, { status: 404 });
  return NextResponse.json({ artist });
}

export const GET = protectedRoute(handleGET, false);
export const PUT = protectedRoute(handlePUT, false);
