import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { identity, protectedRoute } from '@/packages/auth/server';
import { db } from '@/packages/db/src';
import { requestAttachments } from '@/packages/db/src/schema';
import { accessibleRequest } from '@/packages/waivers/request-access.server';

type Context={params:Promise<{id:string}>};
async function handleGET(request:NextRequest,{params}:Context) {
  const user=await identity(request);
  if (!user) return NextResponse.json({error:'Sign in required.'},{status:401});
  const {id}=await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({error:'Request not found.'},{status:404});
  const submission=await accessibleRequest(user,id);
  if (!submission) return NextResponse.json({error:'Request not found.'},{status:404});
  const attachments=await db.select({id:requestAttachments.id,fieldId:requestAttachments.fieldId}).from(requestAttachments)
    .where(and(eq(requestAttachments.submissionId,id),eq(requestAttachments.organizationId,user.organization_id)));
  return NextResponse.json({submission:{id:submission.id,requestType:submission.requestType,clientName:submission.clientName,definition:submission.definition,answers:submission.answers,createdAt:submission.createdAt},attachments});
}
export const GET=protectedRoute(handleGET,false);
