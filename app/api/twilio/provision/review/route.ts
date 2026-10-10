import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { identity,protectedRoute } from '@/packages/auth/server';
import { reviewPersistedProvision,ProvisionReviewConflict } from '@integrations/provision-review';
const command=z.object({organizationId:z.string().uuid(),operationId:z.string().uuid(),reference:z.string().trim().min(1).max(300),localResourceReviewed:z.literal(true)}).strict();
async function handlePOST(request:NextRequest) {
  const input=command.safeParse(await request.json());
  if(!input.success)return NextResponse.json({error:'Invalid review command.'},{status:400});
  const actor=await identity(request);
  if(!actor)return NextResponse.json({error:'Sign in required.'},{status:401});
  try{return NextResponse.json({...await reviewPersistedProvision(actor,input.data.operationId,input.data.reference),providerVerified:false,automaticRetryAllowed:false});}
  catch(error){return NextResponse.json({error:error instanceof ProvisionReviewConflict?error.message:'Unable to record provisioning review.'},{status:error instanceof ProvisionReviewConflict?409:500});}
}
export const POST=protectedRoute(handlePOST,true);
