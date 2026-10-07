import { NextRequest, NextResponse } from 'next/server';
import { claimDueAutomationJobs } from '@/packages/automations/queue.server';
import { processClaimedAutomationJob } from '@/packages/automations/processor.server';

export async function POST(request: NextRequest) {
  const secret = process.env.AUTOMATION_CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const jobs = await claimDueAutomationJobs();
  const results = await Promise.all(jobs.map(processClaimedAutomationJob));
  return NextResponse.json({ processed: results.length, results });
}
