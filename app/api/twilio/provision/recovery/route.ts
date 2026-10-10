import { NextRequest, NextResponse } from 'next/server';
import { protectedRoute } from '@/packages/auth/server';
import { provisioningRecoveryReport } from '@integrations/provision-recovery';
async function handleGET(request: NextRequest) {
  try {
    return NextResponse.json({ operations:await provisioningRecoveryReport(request.nextUrl.searchParams.get('organizationId')!), providerVerified:false });
  } catch {
    return NextResponse.json({ error:'Unable to inspect local provisioning state.' }, { status:500 });
  }
}
export const GET = protectedRoute(handleGET,true);
