import {NextRequest,NextResponse} from 'next/server';
import {and,eq} from 'drizzle-orm';
import {z} from 'zod';
import {identity,protectedRoute} from '@/packages/auth/server';
import {canAccessArtist} from '@/packages/inbox/state';
import {db} from '@/packages/db/src';
import {appointments,artists,externalWaiverAssignments,externalWaiverEvents,waiverIdentityDocuments} from '@/packages/db/src/schema';
type Context={params:Promise<{id:string}>};
async function handleGET(request:NextRequest,{params}:Context){
 const user=await identity(request);if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 const {id}=await params;if(!z.string().uuid().safeParse(id).success)return NextResponse.json({error:'Photo ID not found.'},{status:404});
 const [row]=await db.select({document:waiverIdentityDocuments,artistUserId:artists.userId}).from(waiverIdentityDocuments)
 .innerJoin(externalWaiverAssignments,and(eq(externalWaiverAssignments.id,waiverIdentityDocuments.assignmentId),eq(externalWaiverAssignments.organizationId,waiverIdentityDocuments.organizationId)))
 .innerJoin(appointments,and(eq(appointments.id,externalWaiverAssignments.appointmentId),eq(appointments.organizationId,externalWaiverAssignments.organizationId)))
 .innerJoin(artists,and(eq(artists.id,appointments.artistId),eq(artists.organizationId,appointments.organizationId)))
 .where(and(eq(waiverIdentityDocuments.assignmentId,id),eq(waiverIdentityDocuments.organizationId,user.organization_id))).limit(1);
 if(!row||!canAccessArtist(user.role,user.id,row.artistUserId))return NextResponse.json({error:'Photo ID not found.'},{status:404});
 try{
  const {readIdentityImage}=await import('@/packages/waivers/identity-image.server');
  const bytes=readIdentityImage(row.document);
  await db.insert(externalWaiverEvents).values({organizationId:user.organization_id,assignmentId:id,userId:user.id,action:'PHOTO_ID_ACCESSED'});
  return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'image/jpeg','Content-Disposition':'attachment; filename="photo-id.jpg"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }catch{return NextResponse.json({error:'Unable to retrieve photo ID.'},{status:503});}
}
export const GET=protectedRoute(handleGET,false);
