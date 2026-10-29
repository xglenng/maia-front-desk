import {NextRequest,NextResponse} from 'next/server';
import {and,desc,eq,ilike,or,sql} from 'drizzle-orm';
import {z} from 'zod';
import {identity,protectedRoute} from '@/packages/auth/server';
import {db} from '@/packages/db/src';
import {appointments,artists,waiverSubmissions,waiverTemplates,waiverIdentityDocuments} from '@/packages/db/src/schema';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
async function handleGET(request:NextRequest){
 const user=await identity(request);if(!user)return NextResponse.json({error:'Sign in required.'},{status:401,headers});
 if(!['OWNER','ARTIST'].includes(user.role))return NextResponse.json({error:'Access denied.'},{status:403,headers});
 const query=z.object({id:z.string().uuid().optional(),q:z.string().trim().max(100).default(''),page:z.coerce.number().int().min(1).max(100000).default(1)}).safeParse(Object.fromEntries(request.nextUrl.searchParams));
 if(!query.success)return NextResponse.json({error:'Invalid archive request.'},{status:400,headers});
 const {id,q,page}=query.data;
 const conditions=[eq(waiverSubmissions.organizationId,user.organization_id)];
 if(user.role==='ARTIST')conditions.push(eq(artists.userId,user.id));
 if(id)conditions.push(eq(waiverSubmissions.id,id));
 if(q){const pattern=`%${q.replace(/[\\%_]/g,'\\$&')}%`;conditions.push(or(ilike(waiverSubmissions.signedName,pattern),ilike(waiverTemplates.name,pattern),ilike(artists.displayName,pattern))!);}
 const rows=await db.select({id:waiverSubmissions.id,signedName:waiverSubmissions.signedName,signedAt:waiverSubmissions.signedAt,appointmentAt:appointments.startsAt,artistName:artists.displayName,formName:waiverTemplates.name,version:waiverTemplates.version,
 ...(id?{signatureData:waiverSubmissions.signatureData,documentHash:waiverSubmissions.documentHash}:{}),
 photoAssignmentId:sql<string|null>`(SELECT ${waiverIdentityDocuments.assignmentId} FROM ${waiverIdentityDocuments} WHERE ${waiverIdentityDocuments.submissionId}=${waiverSubmissions.id} AND ${waiverIdentityDocuments.organizationId}=${waiverSubmissions.organizationId} LIMIT 1)`})
 .from(waiverSubmissions)
 .innerJoin(appointments,and(eq(appointments.id,waiverSubmissions.appointmentId),eq(appointments.organizationId,waiverSubmissions.organizationId)))
 .innerJoin(artists,and(eq(artists.id,appointments.artistId),eq(artists.organizationId,appointments.organizationId)))
 .innerJoin(waiverTemplates,and(eq(waiverTemplates.id,waiverSubmissions.waiverTemplateId),eq(waiverTemplates.organizationId,waiverSubmissions.organizationId)))
 .where(and(...conditions)).orderBy(desc(waiverSubmissions.signedAt),desc(waiverSubmissions.id)).limit(id?1:26).offset(id?0:(page-1)*25);
 if(id&&!rows.length)return NextResponse.json({error:'Signed form not found.'},{status:404,headers});
 if(id)return NextResponse.json({form:rows[0]},{headers:request.nextUrl.searchParams.get('download')==='1'?{...headers,'Content-Disposition':'attachment; filename="signed-consent.json"'}:headers});
 return NextResponse.json({forms:rows.slice(0,25),hasMore:rows.length>25},{headers});
}
export const GET=protectedRoute(handleGET,false);
