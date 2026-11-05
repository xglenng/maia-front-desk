import { trackBusinessProfileReviews } from "@/packages/compliance/live-registration";
import { NextRequest, NextResponse } from 'next/server';
import { claimDueAutomationJobs } from '@/packages/automations/queue.server';
import { processClaimedAutomationJob } from '@/packages/automations/processor.server';

export async function POST(request: NextRequest) {
  const secret = process.env.AUTOMATION_CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const jobs = await claimDueAutomationJobs();
  const [results, businessProfilesChecked] = await Promise.all([
    Promise.all(jobs.map(processClaimedAutomationJob)),
    trackBusinessProfileReviews().catch(() => {
      console.warn("Unable to check Twilio business profile reviews");
      return 0;
    }),
  ]);
  return NextResponse.json({ processed: results.length, results, businessProfilesChecked });
}
