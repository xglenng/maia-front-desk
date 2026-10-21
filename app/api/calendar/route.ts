import { ONBOARDING_PREVIEW_CLIENT_NOTE } from '@/packages/onboarding/readiness';
import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { and,asc,eq,gt,gte,isNull,lt,ne,or,sql } from 'drizzle-orm';
import { db } from '@/packages/db/src';
import { calendarTimeOff,appointments,artists,availabilityRules,calendarConnections,clients,organizations,schedulingConnections,services } from '@/packages/db/src/schema';
import { identity,protectedRoute } from '@/packages/auth/server';
import { localDateTimeToUtc } from '@/packages/booking/src/time';
import { addCalendarDate,calendarDate,calendarHoursSchema,nativeDeposit,rescheduleSchema,canRescheduleNative } from '@/packages/studio/native-calendar-policy';
import { lockArtistCalendar,nativeSlotAvailable } from '@/packages/booking/src/native-calendar.server';
import { scheduleConfirmedAppointmentAutomations } from '@/packages/automations/lifecycle.server';
const scope={artistId:z.string().uuid(),organizationId:z.string().uuid()};
async function nativeProvider(organizationId:string,artistId:string){
 const [[connection],google]=await Promise.all([db.select({provider:schedulingConnections.provider,status:schedulingConnections.status}).from(schedulingConnections).where(and(eq(schedulingConnections.organizationId,organizationId),eq(schedulingConnections.artistId,artistId))).limit(1),db.select({id:calendarConnections.id}).from(calendarConnections).where(and(eq(calendarConnections.organizationId,organizationId),eq(calendarConnections.artistId,artistId),eq(calendarConnections.active,true))).limit(1)]);
 return {native:(!connection||connection.status==='DISCONNECTED')&&!google.length,label:google.length?'Google Calendar':connection&&connection.status!=='DISCONNECTED'?connection.provider:'MAIA'};
}
async function get(request:NextRequest){
 const parsed=z.object({...scope,date:z.string().refine(calendarDate)}).safeParse(Object.fromEntries(request.nextUrl.searchParams));
 if(!parsed.success)return NextResponse.json({error:'Select an artist and a valid date.'},{status:400});
 const {organizationId,artistId,date}=parsed.data,user=(await identity(request))!;
 const [organization]=await db.select({timezone:organizations.timezone}).from(organizations).where(eq(organizations.id,organizationId));
 const timezone=organization?.timezone||'UTC',from=localDateTimeToUtc(date,timezone),to=localDateTimeToUtc(addCalendarDate(date,7),timezone);
 const [rows,serviceRows,clientRows,rules,provider,timeOff]=await Promise.all([
  db.select({id:appointments.id,startsAt:appointments.startsAt,endsAt:appointments.endsAt,status:appointments.status,holdExpiresAt:appointments.holdExpiresAt,depositCents:appointments.depositCents,depositStatus:appointments.depositStatus,scheduleRevision:appointments.scheduleRevision,priceCents:appointments.priceCents,client:clients.firstName,lastName:clients.lastName,service:services.name}).from(appointments).innerJoin(clients,and(eq(clients.id,appointments.clientId),eq(clients.organizationId,organizationId))).leftJoin(services,and(eq(services.id,appointments.serviceId),eq(services.organizationId,organizationId))).where(and(eq(appointments.organizationId,organizationId),eq(appointments.artistId,artistId),lt(appointments.startsAt,to),gte(appointments.endsAt,from))).orderBy(asc(appointments.startsAt)),
  db.select({id:services.id,name:services.name,durationMinutes:services.durationMinutes,basePriceCents:services.basePriceCents,depositType:services.depositType,depositAmountCents:services.depositAmountCents,depositPercent:services.depositPercent}).from(services).where(and(eq(services.organizationId,organizationId),eq(services.artistId,artistId),eq(services.active,true))).orderBy(asc(services.name)),
  db.select({id:clients.id,firstName:clients.firstName,lastName:clients.lastName}).from(clients).where(and(eq(clients.organizationId,organizationId),or(isNull(clients.notes),ne(clients.notes,ONBOARDING_PREVIEW_CLIENT_NOTE)),...(user.role==='ARTIST'?[sql`(EXISTS (SELECT 1 FROM appointments a WHERE a.client_id=${clients.id} AND a.organization_id=${organizationId} AND a.artist_id=${artistId}) OR EXISTS (SELECT 1 FROM conversations c WHERE c.client_id=${clients.id} AND c.organization_id=${organizationId} AND c.artist_id=${artistId} AND c.channel<>'WEB_TEST'))`]:[]))).orderBy(asc(clients.firstName)).limit(500),
  db.select().from(availabilityRules).where(and(eq(availabilityRules.organizationId,organizationId),eq(availabilityRules.artistId,artistId),eq(availabilityRules.active,true))).orderBy(asc(availabilityRules.dayOfWeek),asc(availabilityRules.startMinute)),nativeProvider(organizationId,artistId),
  db.select().from(calendarTimeOff).where(and(eq(calendarTimeOff.organizationId,organizationId),eq(calendarTimeOff.artistId,artistId),lt(calendarTimeOff.startsAt,to),gte(calendarTimeOff.endsAt,from))),
 ]);
 return NextResponse.json({timeOff,appointments:rows,services:serviceRows,clients:clientRows,hours:rules,timezone,provider});
}
const booking=z.object({...scope,requestId:z.string().uuid(),serviceId:z.string().uuid(),clientId:z.string().uuid().optional(),newClient:z.object({firstName:z.string().trim().min(2).max(120),phone:z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),email:z.string().trim().toLowerCase().email().max(254).optional()}).optional(),localStart:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),durationMinutes:z.number().int().min(5).max(1440),priceCents:z.number().int().min(0).max(10000000)}).refine(input=>Boolean(input.clientId)!==Boolean(input.newClient),'Choose an existing client or enter a new client.');
async function post(request:NextRequest){
 if((await request.clone().json()).action==='TIME_OFF')return timeOff(request);
 const parsed=booking.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:'Check client, service, date, duration and price.'},{status:400});
 const input=parsed.data,user=(await identity(request))!,provider=await nativeProvider(input.organizationId,input.artistId);
 if(!provider.native)return NextResponse.json({error:`This artist uses ${provider.label}. Manage bookings there; no external booking was changed.`},{status:409});
 try {
 const result=await db.transaction(async tx=>{
  await lockArtistCalendar(tx,input.organizationId,input.artistId);
  const [artist]=await tx.select().from(artists).where(and(eq(artists.id,input.artistId),eq(artists.organizationId,input.organizationId)));
  if(!artist?.bookingEnabled)throw new Error('Booking is disabled for this artist.');
  const [organization]=await tx.select({timezone:organizations.timezone}).from(organizations).where(eq(organizations.id,input.organizationId));
  const startsAt=localDateTimeToUtc(input.localStart,organization?.timezone||'UTC'),endsAt=new Date(startsAt.getTime()+input.durationMinutes*60000);
  if(!Number.isFinite(startsAt.getTime()))throw new Error('This local time does not exist. Choose another time.');
  const [existing]=await tx.select().from(appointments).where(and(eq(appointments.id,input.requestId),eq(appointments.organizationId,input.organizationId)));
  if(existing){if(existing.artistId!==input.artistId||existing.serviceId!==input.serviceId||existing.startsAt.getTime()!==startsAt.getTime()||existing.endsAt.getTime()!==endsAt.getTime()||existing.priceCents!==input.priceCents||(input.clientId&&existing.clientId!==input.clientId))throw new Error('This request was already used for another appointment.');if(input.newClient){const [priorClient]=await tx.select().from(clients).where(and(eq(clients.id,existing.clientId),eq(clients.organizationId,input.organizationId)));if(!priorClient||priorClient.firstName!==input.newClient.firstName||(priorClient.phone||'')!==(input.newClient.phone||''))throw new Error('This request was already used for another client.');}return {appointment:existing,duplicate:true};}
  const [service]=await tx.select().from(services).where(and(eq(services.id,input.serviceId),eq(services.artistId,input.artistId),eq(services.organizationId,input.organizationId),eq(services.active,true)));
  if(!service)throw new Error('Active service not found for this artist.');
  const depositCents=nativeDeposit(service,input.priceCents);
  if(!await nativeSlotAvailable(tx,input.organizationId,input.artistId,startsAt,endsAt))throw new Error('That time is outside bookable hours or is no longer available.');
  let clientId=input.clientId;
  if(clientId){
   const [client]=await tx.select({id:clients.id}).from(clients).where(and(eq(clients.id,clientId),eq(clients.organizationId,input.organizationId),or(isNull(clients.notes),ne(clients.notes,ONBOARDING_PREVIEW_CLIENT_NOTE))));
   if(!client)throw new Error('Client not found.');
   // protectedRoute checks tenant IDs; artist client access also requires an existing link.
   if(user.role==='ARTIST'){
    const found=await tx.execute(sql`SELECT id FROM clients c WHERE c.id=${clientId} AND c.organization_id=${input.organizationId} AND (EXISTS(SELECT 1 FROM conversations x WHERE x.client_id=c.id AND x.organization_id=c.organization_id AND x.artist_id=${input.artistId} AND x.channel<>'WEB_TEST') OR EXISTS(SELECT 1 FROM appointments x WHERE x.client_id=c.id AND x.organization_id=c.organization_id AND x.artist_id=${input.artistId}))`);
    if(!found.rowCount)throw new Error('Client is not assigned to this artist.');
   }
  }else clientId=(await tx.insert(clients).values({organizationId:input.organizationId,...input.newClient!}).returning({id:clients.id}))[0].id;
  const [appointment]=await tx.insert(appointments).values({id:input.requestId,organizationId:input.organizationId,artistId:input.artistId,serviceId:service.id,clientId,startsAt,endsAt,status:depositCents?'PAYMENT_PENDING':'CONFIRMED',priceCents:input.priceCents,depositCents:depositCents||null,depositStatus:depositCents?'PENDING':'WAIVED',paymentProvider:service.paymentProvider,schedulingProvider:'INTERNAL',notes:'Created manually in Maia calendar. Deposit-required slots are not reserved until payment is confirmed.'}).returning();
  return {appointment,duplicate:false};
 });
 if(result.appointment.status==='CONFIRMED')await scheduleConfirmedAppointmentAutomations(result.appointment.id);
 return NextResponse.json(result,{status:result.duplicate?200:201});
 }catch(error){return NextResponse.json({error:error instanceof Error&&!('code' in error)?error.message:'Unable to save appointment. Refresh and try again.'},{status:409});}
}
async function put(request:NextRequest){
 const parsed=z.object({...scope,hours:calendarHoursSchema}).safeParse(await request.json());
 if(!parsed.success)return NextResponse.json({error:'Enter valid, non-overlapping bookable hours.'},{status:400});
 const {organizationId,artistId,hours}=parsed.data;
 if(!(await nativeProvider(organizationId,artistId)).native)return NextResponse.json({error:'Manage bookable hours in the connected calendar provider.'},{status:409});
 await db.transaction(async tx=>{await lockArtistCalendar(tx,organizationId,artistId);await tx.delete(availabilityRules).where(and(eq(availabilityRules.organizationId,organizationId),eq(availabilityRules.artistId,artistId)));if(hours.length)await tx.insert(availabilityRules).values(hours.map(row=>({...row,organizationId,artistId,active:true})));});
 return NextResponse.json({ok:true});
}
export const GET=protectedRoute(get);
export const POST=protectedRoute(post);
export const PUT=protectedRoute(put);

async function patch(request:NextRequest){
 const parsed=rescheduleSchema.safeParse(await request.json());
 if(!parsed.success)return NextResponse.json({error:'Choose a valid appointment and start time.'},{status:400});
 const input=parsed.data;
 if(!(await nativeProvider(input.organizationId,input.artistId)).native)return NextResponse.json({error:'Reschedule this appointment in its connected calendar.'},{status:409});
 try{
 const appointment=await db.transaction(async tx=>{
  await lockArtistCalendar(tx,input.organizationId,input.artistId);
  const [current]=await tx.select().from(appointments).where(and(eq(appointments.id,input.appointmentId),eq(appointments.organizationId,input.organizationId),eq(appointments.artistId,input.artistId)));
  if(!current||!canRescheduleNative(current.status,current.schedulingProvider,current.providerBookingId)||current.calendarEventId)throw new Error('Only confirmed Maia appointments can be rescheduled here.');
  const [artist]=await tx.select().from(artists).where(and(eq(artists.id,input.artistId),eq(artists.organizationId,input.organizationId)));
  if(!artist?.bookingEnabled)throw new Error('Booking is disabled for this artist.');
  const [org]=await tx.select({timezone:organizations.timezone}).from(organizations).where(eq(organizations.id,input.organizationId));
  const startsAt=localDateTimeToUtc(input.localStart,org?.timezone||'UTC');
  const endsAt=new Date(startsAt.getTime()+current.endsAt.getTime()-current.startsAt.getTime());
  if(current.scheduleRevision!==input.expectedRevision)throw new Error('This appointment changed. Refresh before rescheduling.');
  if(!Number.isFinite(startsAt.getTime())||!await nativeSlotAvailable(tx,input.organizationId,input.artistId,startsAt,endsAt,current.id))throw new Error('That time is outside bookable hours or is no longer available.');
  if(current.startsAt.getTime()===startsAt.getTime())return current;
  return (await tx.update(appointments).set({startsAt,endsAt,scheduleRevision:current.scheduleRevision+1,updatedAt:new Date()}).where(and(eq(appointments.id,current.id),eq(appointments.organizationId,input.organizationId))).returning())[0];
 });
 // Existing jobs validate their schedule revision before delivery. Keep them for
 // audit rather than cancelling jobs that another reschedule may have queued.
 await scheduleConfirmedAppointmentAutomations(appointment.id);
 return NextResponse.json({appointment});
 }catch(error){return NextResponse.json({error:error instanceof Error&&!('code' in error)?error.message:'Unable to reschedule. Refresh and try again.'},{status:409});}
}
export const PATCH=protectedRoute(patch);

async function timeOff(request:NextRequest){
 const parsed=z.object({...scope,id:z.string().uuid(),localStart:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),localEnd:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),label:z.string().trim().min(1).max(100)}).safeParse(await request.json());
 if(!parsed.success)return NextResponse.json({error:'Enter a valid time-off period.'},{status:400});
 const input=parsed.data;
 if(!(await nativeProvider(input.organizationId,input.artistId)).native)return NextResponse.json({error:'Manage time off in the connected calendar.'},{status:409});
 try{
 const result=await db.transaction(async tx=>{
  await lockArtistCalendar(tx,input.organizationId,input.artistId);
  const [org]=await tx.select({timezone:organizations.timezone}).from(organizations).where(eq(organizations.id,input.organizationId));
  const startsAt=localDateTimeToUtc(input.localStart,org?.timezone||'UTC'),endsAt=localDateTimeToUtc(input.localEnd,org?.timezone||'UTC');
  if(!Number.isFinite(startsAt.getTime())||!Number.isFinite(endsAt.getTime())||endsAt<=startsAt||startsAt<=new Date())throw new Error('Choose a future period with the end after the start.');
  const [existing]=await tx.select().from(calendarTimeOff).where(and(eq(calendarTimeOff.id,input.id),eq(calendarTimeOff.organizationId,input.organizationId),eq(calendarTimeOff.artistId,input.artistId)));
  if(existing){if(existing.startsAt.getTime()!==startsAt.getTime()||existing.endsAt.getTime()!==endsAt.getTime()||existing.label!==input.label)throw new Error('This request was already used. Refresh and try again.');return existing;}
  const [conflict]=await tx.select({id:appointments.id}).from(appointments).where(and(eq(appointments.organizationId,input.organizationId),eq(appointments.artistId,input.artistId),lt(appointments.startsAt,endsAt),gt(appointments.endsAt,startsAt),or(eq(appointments.status,'CONFIRMED'),eq(appointments.status,'COMPLETED'),and(eq(appointments.status,'PAYMENT_PENDING'),gte(appointments.holdExpiresAt,new Date())),and(or(eq(appointments.status,'TENTATIVE'),eq(appointments.status,'AI_HOLD')),or(isNull(appointments.holdExpiresAt),gte(appointments.holdExpiresAt,new Date())))))).limit(1);
  if(conflict)throw new Error('This period overlaps an appointment or active hold. Move it before adding time off.');
  return (await tx.insert(calendarTimeOff).values({id:input.id,organizationId:input.organizationId,artistId:input.artistId,startsAt,endsAt,label:input.label}).returning())[0];
 });
 return NextResponse.json({timeOff:result});
 }catch(error){return NextResponse.json({error:error instanceof Error&&!('code' in error)?error.message:'Unable to save time off.'},{status:409});}
}
async function removeTimeOff(request:NextRequest){
 const input=z.object({...scope,id:z.string().uuid()}).safeParse(Object.fromEntries(request.nextUrl.searchParams));
 if(!input.success)return NextResponse.json({error:'Select a time-off period.'},{status:400});
 const {organizationId,artistId,id}=input.data;
 if(!(await nativeProvider(organizationId,artistId)).native)return NextResponse.json({error:'Manage time off in the connected calendar.'},{status:409});
 await db.transaction(async tx=>{await lockArtistCalendar(tx,organizationId,artistId);await tx.delete(calendarTimeOff).where(and(eq(calendarTimeOff.id,id),eq(calendarTimeOff.organizationId,organizationId),eq(calendarTimeOff.artistId,artistId)));});
 return NextResponse.json({ok:true});
}
export const DELETE=protectedRoute(removeTimeOff);
