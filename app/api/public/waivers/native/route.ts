import {createHash} from 'node:crypto';
import {and,eq,sql,inArray} from 'drizzle-orm';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from '@/packages/db/src';
import {appointments,externalWaiverAssignments,externalWaiverForms,waiverTemplates,waiverSubmissions,externalWaiverEvents,automationJobs,waiverIdentityDocuments} from '@/packages/db/src/schema';
import {nativeDefinition,nativeAnswers,validateNativeAnswers} from '@/packages/waivers/forms';
import {boundedBody} from '@/packages/waivers/bounded-body';
import {drawnSignature} from '@/packages/waivers/signature';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const tokenSchema=z.string().regex(/^[a-f0-9]{48}$/);
async function resolve(token:string){
 const [row]=await db.select({assignment:externalWaiverAssignments,form:externalWaiverForms,appointment:appointments}).from(externalWaiverAssignments)
 .innerJoin(externalWaiverForms,and(eq(externalWaiverAssignments.waiverFormId,externalWaiverForms.id),eq(externalWaiverAssignments.organizationId,externalWaiverForms.organizationId)))
 .innerJoin(appointments,and(eq(externalWaiverAssignments.appointmentId,appointments.id),eq(externalWaiverAssignments.organizationId,appointments.organizationId)))
 .where(eq(externalWaiverAssignments.trackingTokenHash,digest(token)));
 if(!row||row.form.provider!=='MAIA'||row.assignment.status==='VOID'||!row.form.active||['CANCELLED','NO_SHOW'].includes(row.appointment.status)||Date.now()>row.appointment.startsAt.getTime()+7*86400000)return null;
 const meta=row.form.metadata as {templateId?:string;definition?:unknown}|null;
 const definition=nativeDefinition.safeParse(meta?.definition);
 if(!definition.success||!meta?.templateId)return null;
 const [template]=await db.select().from(waiverTemplates).where(and(eq(waiverTemplates.id,meta.templateId),eq(waiverTemplates.organizationId,row.assignment.organizationId)));
 if(!template||template.body!==definition.data.body)return null;
 return {...row,template,definition:definition.data};
}
export async function GET(request:NextRequest){
 const token=tokenSchema.safeParse(request.nextUrl.searchParams.get('token'));if(!token.success)return NextResponse.json({error:'Invalid form link.'},{status:404});
 const row=await resolve(token.data);if(!row)return NextResponse.json({error:'This form link is unavailable or expired.'},{status:404});
 return NextResponse.json({name:row.form.name,definition:row.definition,complete:['COMPLETED','REVIEWED'].includes(row.assignment.status)},{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
const submission=z.object({token:tokenSchema,signedName:z.string().trim().min(2).max(200),agreed:z.literal(true),answers:nativeAnswers.optional(),signature:drawnSignature});
export async function POST(request:NextRequest){
 const origin=request.headers.get('origin');
 if(!origin||![request.nextUrl.origin,process.env.NEXT_PUBLIC_APP_URL].includes(origin))return NextResponse.json({error:'Invalid request origin.'},{status:403});
 const contentType=request.headers.get('content-type')||'';
 const multipart=contentType.startsWith('multipart/form-data;');
 if(!multipart&&!contentType.startsWith('application/json'))return NextResponse.json({error:'Use JSON or a multipart form.'},{status:415});
 let input;let photoId:File|null=null;
 try{
  const raw=await boundedBody(request,multipart?5*1024*1024+200000:150000);
  if(multipart){
   const parts=await new Response(new Uint8Array(raw),{headers:{'content-type':contentType}}).formData();
   if([...parts.keys()].some(key=>!['payload','photoId'].includes(key))||parts.getAll('payload').length!==1||parts.getAll('photoId').length>1)throw Error('Invalid parts');
   const payload=parts.get('payload'),file=parts.get('photoId');
   if(typeof payload!=='string'||Buffer.byteLength(payload)>150000||file!==null&&typeof file==='string')throw Error('Invalid form');
   photoId=file as File|null;input=submission.safeParse(JSON.parse(payload));
  }else input=submission.safeParse(JSON.parse(raw.toString('utf8')));
 }catch{return NextResponse.json({error:'Invalid form or upload exceeds the 5 MB limit.'},{status:400});}
 if(!input.success)return NextResponse.json({error:'Complete the signature and agreement.'},{status:400});
 const row=await resolve(input.data.token);if(!row)return NextResponse.json({error:'This form link is unavailable or expired.'},{status:404});
 if(['COMPLETED','REVIEWED'].includes(row.assignment.status))return NextResponse.json({complete:true});
 const checked=validateNativeAnswers(row.definition,input.data.answers);
 if(!checked.success)return NextResponse.json({error:checked.error},{status:400});
 const photoField=row.definition.fields?.find(field=>field.type==='PHOTO_ID');
 if(photoId&&!photoField)return NextResponse.json({error:'This form does not request photo ID.'},{status:400});
 if(photoField?.required&&!photoId)return NextResponse.json({error:'Upload the photo ID requested by this studio.'},{status:400});
 let identityImage:Awaited<ReturnType<typeof import('@/packages/waivers/identity-image.server').prepareIdentityImage>>|null=null;
 if(photoId){try{const storage=await import('@/packages/waivers/identity-image.server');identityImage=await storage.prepareIdentityImage(photoId);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to process photo ID.'},{status:400});}}
 const values=input.data;const now=new Date();
 try{await db.transaction(async tx=>{
  await tx.execute(sql`SELECT id FROM external_waiver_assignments WHERE id=${row.assignment.id} AND organization_id=${row.assignment.organizationId} FOR UPDATE`);
  const [current]=await tx.select().from(externalWaiverAssignments).where(and(eq(externalWaiverAssignments.id,row.assignment.id),eq(externalWaiverAssignments.organizationId,row.assignment.organizationId)));
  if(['COMPLETED','REVIEWED'].includes(current.status))return;
  if(current.status==='VOID')throw Error('Form was voided.');
  const latest=await resolve(values.token);if(!latest)throw Error('Form unavailable.');
  const signatureData=JSON.stringify({agreed:true,definition:row.definition,answers:checked.data,drawnSignature:values.signature,...(identityImage?{photoId:{fieldId:photoField!.id,sha256:identityImage.sha256,contentType:identityImage.contentType,byteLength:identityImage.byteLength}}:{})});
  const documentHash=digest(JSON.stringify({templateId:row.template.id,version:row.template.version,body:row.template.body,signatureData,signedName:values.signedName,signedAt:now.toISOString(),appointmentId:row.assignment.appointmentId,clientId:row.assignment.clientId}));
  const [signed]=await tx.insert(waiverSubmissions).values({organizationId:row.assignment.organizationId,appointmentId:row.assignment.appointmentId,clientId:row.assignment.clientId,waiverTemplateId:row.template.id,signedName:values.signedName,signatureData,signedAt:now,documentHash,userAgent:request.headers.get('user-agent')?.slice(0,1000)}).returning({id:waiverSubmissions.id});
  if(identityImage)await tx.insert(waiverIdentityDocuments).values({organizationId:row.assignment.organizationId,assignmentId:row.assignment.id,submissionId:signed.id,fieldId:photoField!.id,...identityImage});
  await tx.update(externalWaiverAssignments).set({status:'COMPLETED',completedAt:now,updatedAt:now,providerMetadata:{submissionId:signed.id}}).where(eq(externalWaiverAssignments.id,row.assignment.id));
  await tx.insert(externalWaiverEvents).values({organizationId:row.assignment.organizationId,assignmentId:row.assignment.id,action:'SIGNED',details:{submissionId:signed.id,documentHash}});
  await tx.update(automationJobs).set({status:'CANCELLED',completedAt:now,lastErrorCode:'WAIVER_COMPLETED',lockedAt:null,lockExpiresAt:null,lockToken:null,updatedAt:now}).where(and(eq(automationJobs.organizationId,row.assignment.organizationId),eq(automationJobs.appointmentId,row.assignment.appointmentId),eq(automationJobs.type,'WAIVER_REMINDER'),inArray(automationJobs.status,['PENDING','RETRY','PROCESSING'])));
 });}catch{return NextResponse.json({error:'Unable to record this signature. Please retry or contact the studio.'},{status:409});}
 return NextResponse.json({complete:true});
}
