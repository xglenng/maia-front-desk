import { NextRequest, NextResponse } from 'next/server';
import { and, eq, lte } from 'drizzle-orm';
import { db } from '@db/index';
import { automationJobs, clients, conversations, externalWaiverAssignments, messages } from '@db/schema';
import { sendStudioSms } from '@integrations/studio-sms';

export async function POST(request: NextRequest) {
  const secret = process.env.AUTOMATION_CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const now = new Date();
  const jobs = await db.select().from(automationJobs).where(and(eq(automationJobs.status, 'PENDING'), lte(automationJobs.runAt, now))).limit(50);
  const results = [];
  for (const job of jobs) {
    try {
      const payload = typeof job.payload === 'object' && job.payload ? job.payload as Record<string, unknown> : {};
      if (job.type === 'WAIVER_REMINDER' && typeof payload.waiverAssignmentId === 'string') {
        const [assignment] = await db.select({ status: externalWaiverAssignments.status }).from(externalWaiverAssignments).where(and(eq(externalWaiverAssignments.id, payload.waiverAssignmentId), eq(externalWaiverAssignments.organizationId, job.organizationId)));
        if (!assignment || assignment.status !== 'SENT') {
          await db.update(automationJobs).set({ status: 'CANCELLED', updatedAt: now }).where(eq(automationJobs.id, job.id));
          results.push({ id: job.id, status: 'CANCELLED' });
          continue;
        }
      }
      const [client] = await db.select().from(clients).where(and(eq(clients.id, job.clientId), eq(clients.organizationId, job.organizationId)));
      const body = 'body' in payload ? String(payload.body) : '';
      if (!client?.phone || !client.smsOptIn || !body) throw new Error('Client not SMS eligible or job body missing.');
      const sent = await sendStudioSms({ organizationId: job.organizationId, artistId: job.artistId, to: client.phone, body });
      let [conversation] = await db.select().from(conversations).where(and(eq(conversations.organizationId, job.organizationId), eq(conversations.artistId, job.artistId), eq(conversations.clientId, job.clientId), eq(conversations.channel, 'SMS'), eq(conversations.status, 'OPEN'))).limit(1);
      if (!conversation) conversation = (await db.insert(conversations).values({ organizationId: job.organizationId, artistId: job.artistId, clientId: job.clientId, channel: 'SMS', status: 'OPEN', aiEnabled: true, lastMessageAt: now }).returning())[0];
      await db.insert(messages).values({ conversationId: conversation.id, senderType: 'SYSTEM', role: 'assistant', content: body, externalMessageId: sent.sid, metadata: { automationJobId: job.id, provider: 'twilio', studioPhone: sent.studioPhone } });
      await db.update(automationJobs).set({ status: 'SENT', sentAt: now, updatedAt: now }).where(eq(automationJobs.id, job.id));
      results.push({ id: job.id, status: 'SENT' });
    } catch (error) {
      await db.update(automationJobs).set({ status: 'FAILED', updatedAt: now, payload: { ...(typeof job.payload === 'object' && job.payload ? job.payload : {}), error: error instanceof Error ? error.message : 'Unknown error' } }).where(eq(automationJobs.id, job.id));
      results.push({ id: job.id, status: 'FAILED', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
  return NextResponse.json({ processed: results.length, results });
}
