import {NextRequest,NextResponse} from 'next/server';
import {identity,protectedRoute} from '@/packages/auth/server';
import {db} from '@/packages/db/src';
import {clients} from '@/packages/db/src/schema';
import {and,eq,sql} from 'drizzle-orm';
import {newClientInput} from '@/packages/studio/client-input';
async function post(request:NextRequest){
 const user=(await identity(request))!;
 // Studio-wide directory creation is owner-only. Artist creation remains scoped to booking/invoicing.
 if(user.role!=='OWNER')return NextResponse.json({error:'Only the studio owner can add clients to the directory.'},{status:403});
 const {organizationId:_organizationId,...body}=await request.json();
 const parsed=newClientInput.safeParse(body);
 if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||'Check client details.'},{status:400});
 const input=parsed.data;
 const result=await db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`client-create:${user.organization_id}`},0))`);
  if(input.phone){const [prior]=await tx.select({id:clients.id}).from(clients).where(and(eq(clients.organizationId,user.organization_id),eq(clients.phone,input.phone))).limit(1);if(prior)return {duplicate:true};}
  const [client]=await tx.insert(clients).values({organizationId:user.organization_id,firstName:input.name,phone:input.phone||null,email:input.email||null,dateOfBirth:input.dateOfBirth||null,smsOptIn:false,smsConsentStatus:'NOT_REQUESTED'}).returning({id:clients.id});return {client};
 });
 return result.duplicate?NextResponse.json({error:'A client with that phone number already exists.'},{status:409}):NextResponse.json(result,{status:201,headers:{'Cache-Control':'private, no-store'}});
}
export const POST=protectedRoute(post);
