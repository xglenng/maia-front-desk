import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { identity, protectedRoute } from '@/packages/auth/server';
import { db } from '@/packages/db/src';
import { requestAttachments } from '@/packages/db/src/schema';
import { accessibleRequest } from '@/packages/waivers/request-access.server';
import { readIdentityImage } from '@/packages/waivers/identity-image.server';

type Context={params:Promise<{id:string;imageId:string}>};
async function handleGET(request:NextRequest,{params}:Context) {
  const user=await identity(request);
  if (!user) return NextResponse.json({error:'Sign in required.'},{status:401});
  const {id,imageId}=await params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(imageId).success || !await accessibleRequest(user,id)) return NextResponse.json({error:'Image not found.'},{status:404});
  const [image]=await db.select().from(requestAttachments).where(and(eq(requestAttachments.id,imageId),eq(requestAttachments.submissionId,id),eq(requestAttachments.organizationId,user.organization_id)));
  if (!image) return NextResponse.json({error:'Image not found.'},{status:404});
  try {
    const bytes=readIdentityImage(image);
    return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; sandbox"}});
  } catch (error) {
    console.error('Request image retrieval failed',{errorType:error instanceof Error?error.name:'unknown'});
    return NextResponse.json({error:'Unable to retrieve image.'},{status:503});
  }
}
export const GET=protectedRoute(handleGET,false);
