import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@db/index';
import { messages, phoneNumbers, twilioAccounts } from '@db/schema';
import { accessibleConversation } from '@/packages/inbox/server';
import { protectedRoute } from '@/packages/auth/server';
import { twilioMediaIdentity } from '@/packages/inbox/twilio-media-policy';
import { decryptSecret } from '@integrations/twilio';

type Context = { params: Promise<{ id: string; messageId: string; index: string }> };
async function handleGET(request: NextRequest, { params }: Context) {
  const { id, messageId, index } = await params;
  const access = await accessibleConversation(request, id);
  if (!access.ok) return access.error;
  if (!/^\d$/.test(index)) return new NextResponse('Not found', { status: 404 });
  const [message] = await db.select().from(messages).where(and(eq(messages.id, messageId), eq(messages.conversationId, id))).limit(1);
  const metadata = message?.metadata as { provider?: string; studioPhone?: string; attachments?: Array<{ url?: string }> } | null;
  const url = metadata?.attachments?.[Number(index)]?.url;
  const media = url && twilioMediaIdentity(url);
  if (!media || metadata?.provider !== 'twilio' || media.messageSid !== message.externalMessageId || !metadata.studioPhone) return new NextResponse('Not found', { status: 404 });
  const [number] = await db.select().from(phoneNumbers).where(and(eq(phoneNumbers.organizationId, access.user.organization_id), eq(phoneNumbers.artistId, access.row.conversation.artistId), eq(phoneNumbers.phoneNumber, metadata.studioPhone), eq(phoneNumbers.provider, 'twilio'))).limit(1);
  if (!number) return new NextResponse('Not found', { status: 404 });
  const [account] = number.twilioAccountId ? await db.select().from(twilioAccounts).where(and(eq(twilioAccounts.id, number.twilioAccountId), eq(twilioAccounts.organizationId, access.user.organization_id))).limit(1) : [];
  const accountSid = account?.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = account ? decryptSecret(account.authTokenEncrypted) : process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken || media.accountSid !== accountSid) return new NextResponse('Media unavailable', { status: 404 });
  try {
    let response = await fetch(url!, { headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}` }, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const target = new URL(response.headers.get('location') || '', url);
      if (target.protocol !== 'https:' || target.port || target.username || target.password || !(target.hostname === 'media.twiliocdn.com' || target.hostname.endsWith('.twiliocdn.com'))) return new NextResponse('Media unavailable', { status: 502 });
      response = await fetch(target, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    }
    const contentType = response.headers.get('content-type')?.split(';')[0] || '';
    if (!response.ok || !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(contentType) || !response.body) return new NextResponse('Media unavailable', { status: 502 });
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > 5 * 1024 * 1024) { await reader.cancel(); return new NextResponse('Image too large', { status: 413 }); }
      chunks.push(part.value);
    }
    return new NextResponse(Buffer.concat(chunks), { headers: { 'Content-Type': contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
  } catch { return new NextResponse('Media unavailable', { status: 502 }); }
}
export const GET = protectedRoute(handleGET);
