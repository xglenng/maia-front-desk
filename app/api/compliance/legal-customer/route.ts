import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { identity, protectedRoute } from '@/packages/auth/server';
import { bindLegalCustomerAccount, createLegalCustomer, LegalCustomerConflict, resolveLegalCustomerAccount } from '@/packages/compliance/legal-customer.server';
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('CREATE'), organizationId: z.string().uuid(), legalName: z.string().trim().min(1).max(200), customerType: z.enum(['STUDIO', 'INDEPENDENT_BUSINESS']) }).strict(),
  z.object({ action: z.literal('BIND'), organizationId: z.string().uuid(), legalCustomerId: z.string().uuid(), twilioAccountId: z.string().uuid(), verificationReference: z.string().trim().min(1).max(300), ownershipReviewed: z.literal(true) }).strict()
]);
async function handlePOST(request: NextRequest) {
  const parsed = command.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid legal-customer command.' }, { status: 400 });
  const actor = await identity(request);
  if (!actor) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  try {
    const result = parsed.data.action === 'CREATE' ? await createLegalCustomer(actor, parsed.data) : await bindLegalCustomerAccount(actor, parsed.data);
    return NextResponse.json({ id: result.id, status: 'RECORDED', providerVerified: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof LegalCustomerConflict ? error.message : 'Unable to record legal-customer review.' }, { status: error instanceof LegalCustomerConflict ? 409 : 500 });
  }
}
async function handleGET(request: NextRequest) {
  try { return NextResponse.json({ ...await resolveLegalCustomerAccount(request.nextUrl.searchParams.get('organizationId')!), providerVerified: false }); }
  catch (error) { return NextResponse.json({ error: error instanceof LegalCustomerConflict ? error.message : 'Unable to resolve legal-customer account.' }, { status: error instanceof LegalCustomerConflict ? 409 : 500 }); }
}
export const POST = protectedRoute(handlePOST, true);
export const GET = protectedRoute(handleGET, true);
