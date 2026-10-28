import {createHash} from 'node:crypto';
import {and,eq,sql,inArray} from 'drizzle-orm';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from '@/packages/db/src';
import {appointments,externalWaiverAssignments,externalWaiverForms,waiverTemplates,waiverSubmissions,externalWaiverEvents,automationJobs} from '@/packages/db/src/schema';
import {nativeDefinition,nativeAnswers,validateNativeAnswers} from '@/packages/waivers/forms';
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
 if(Number(request.headers.get('content-length')||0)>150000)return NextResponse.json({error:'Form is too large.'},{status:413});
 let input;try{const raw=await request.text();if(Buffer.byteLength(raw,'utf8')>150000)return NextResponse.json({error:'Form is too large.'},{status:413});input=submission.safeParse(JSON.parse(raw));}catch{return NextResponse.json({error:'Invalid form.'},{status:400});}
 if(!input.success)return NextResponse.json({error:'Complete the signature and agreement.'},{status:400});
 const row=await resolve(input.data.token);if(!row)return NextResponse.json({error:'This form link is unavailable or expired.'},{status:404});
 const checked=validateNativeAnswers(row.definition,input.data.answers);
 if(!checked.success)return NextResponse.json({error:checked.error},{status:400});
 const values=input.data;const now=new Date();
 try{await db.transaction(async tx=>{
  await tx.execute(sql`SELECT id FROM external_waiver_assignments WHERE id=${row.assignment.id} AND organization_id=${row.assignment.organizationId} FOR UPDATE`);
  const [current]=await tx.select().from(externalWaiverAssignments).where(and(eq(externalWaiverAssignments.id,row.assignment.id),eq(externalWaiverAssignments.organizationId,row.assignment.organizationId)));
  if(['COMPLETED','REVIEWED'].includes(current.status))return;
  if(current.status==='VOID')throw Error('Form was voided.');
  const signatureData=JSON.stringify({agreed:true,definition:row.definition,answers:checked.data,drawnSignature:values.signature});
  const documentHash=digest(JSON.stringify({templateId:row.template.id,version:row.template.version,body:row.template.body,signatureData,signedName:values.signedName,signedAt:now.toISOString(),appointmentId:row.assignment.appointmentId,clientId:row.assignment.clientId}));
  const [signed]=await tx.insert(waiverSubmissions).values({organizationId:row.assignment.organizationId,appointmentId:row.assignment.appointmentId,clientId:row.assignment.clientId,waiverTemplateId:row.template.id,signedName:values.signedName,signatureData,signedAt:now,documentHash,userAgent:request.headers.get('user-agent')?.slice(0,1000)}).returning({id:waiverSubmissions.id});
  await tx.update(externalWaiverAssignments).set({status:'COMPLETED',completedAt:now,updatedAt:now,providerMetadata:{submissionId:signed.id}}).where(eq(externalWaiverAssignments.id,row.assignment.id));
  await tx.insert(externalWaiverEvents).values({organizationId:row.assignment.organizationId,assignmentId:row.assignment.id,action:'SIGNED',details:{submissionId:signed.id,documentHash}});
  await tx.update(automationJobs).set({status:'CANCELLED',completedAt:now,lastErrorCode:'WAIVER_COMPLETED',lockedAt:null,lockExpiresAt:null,lockToken:null,updatedAt:now}).where(and(eq(automationJobs.organizationId,row.assignment.organizationId),eq(automationJobs.appointmentId,row.assignment.appointmentId),eq(automationJobs.type,'WAIVER_REMINDER'),inArray(automationJobs.status,['PENDING','RETRY','PROCESSING'])));
 });}catch{return NextResponse.json({error:'Unable to record this signature. Please retry or contact the studio.'},{status:409});}
 return NextResponse.json({complete:true});
}
