import { NextRequest,NextResponse } from 'next/server';
import { pool } from '@db';
import { z } from 'zod';
import { identity,protectedRoute } from '@/packages/auth/server';
import { createFirstLegalAccount,FirstAccountConflict } from '@/packages/compliance/first-account.server';
import { TwilioProvisionConfigurationError } from '@integrations/twilio-provision-preflight';
const command=z.object({organizationId:z.string().uuid(),legalCustomerId:z.string().uuid(),artistId:z.string().uuid(),liveAccountCreationAuthorized:z.literal(true)}).strict();
async function handlePOST(request:NextRequest) {
  const input=command.safeParse(await request.json());
  if(!input.success)return NextResponse.json({error:'Invalid account creation command.'},{status:400});
  const actor=await identity(request);if(!actor)return NextResponse.json({error:'Sign in required.'},{status:401});
  try{return NextResponse.json(await createFirstLegalAccount(actor,input.data));}
  catch(error){const conflict=error instanceof FirstAccountConflict || error instanceof TwilioProvisionConfigurationError;return NextResponse.json({error:conflict?error.message:'Account creation outcome requires review. Do not submit a replacement request.'},{status:conflict?409:500});}
}
export const POST=protectedRoute(handlePOST,true);

async function handleGET(request:NextRequest) {
  try {
    const result=await pool.query('SELECT id,legal_customer_id,artist_id,twilio_account_id,status,created_at,completed_at FROM twilio_account_creation_intents WHERE organization_id=$1',[request.nextUrl.searchParams.get('organizationId')]);
    return NextResponse.json({intents:result.rows,registrationApproved:false,automaticRetryAllowed:false});
  } catch {return NextResponse.json({error:'Unable to inspect account creation state.'},{status:500});}
}
export const GET=protectedRoute(handleGET,true);
