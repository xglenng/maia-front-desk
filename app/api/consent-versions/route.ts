import {NextRequest,NextResponse} from 'next/server';
import {and,eq,sql} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '@/packages/db/src';
import {consentFormDrafts,externalWaiverForms} from '@/packages/db/src/schema';
import {identity,protectedRoute} from '@/packages/auth/server';
import {nativeDefinition} from '@/packages/waivers/forms';
import {consentEditorState,ConsentVersionError,createPublishedConsentVersion,latestConsentVersion,legacyConsentReview,managedConsentForm,validateConsentDefinition} from '@/packages/waivers/versions.server';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
const id=z.string().uuid();
const schema=z.discriminatedUnion('action',[
 z.object({action:z.literal('SAVE_DRAFT'),formId:id,draftId:id.nullable(),revision:z.number().int().min(0),baseVersion:z.number().int().min(0),name:z.string().trim().min(1).max(160),audience:z.enum(['ANY','ADULT','MINOR']),definition:nativeDefinition}),
 z.object({action:z.literal('PUBLISH'),formId:id,draftId:id,revision:z.number().int().min(1)}),
 z.object({action:z.literal('PUBLISH_FUTURE'),formId:id,draftId:id,revision:z.number().int().min(1)}),
]);
function failure(error:unknown){return NextResponse.json({error:error instanceof ConsentVersionError?error.message:'Consent versions are unavailable. Confirm the migration is applied and retry.'},{status:error instanceof ConsentVersionError?error.status:503,headers});}
async function get(request:NextRequest){
 const formId=id.safeParse(request.nextUrl.searchParams.get('formId'));
 if(!formId.success)return NextResponse.json({error:'Invalid form.'},{status:400,headers});
 try{return NextResponse.json(await consentEditorState(db,(await identity(request))!,formId.data),{headers});}catch(error){return failure(error);}
}
async function post(request:NextRequest){
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message||'Invalid form.'},{status:400,headers});
 const user=(await identity(request))!,input=parsed.data;
 try{
  const result=await db.transaction(async tx=>{
   await tx.execute(sql`SELECT id FROM ${externalWaiverForms} WHERE id=${input.formId} AND organization_id=${user.organization_id} FOR UPDATE`);
   const form=await managedConsentForm(tx,user,input.formId);
   const published=await latestConsentVersion(tx,user.organization_id,form.id);
   const [draft]=await tx.select().from(consentFormDrafts).where(and(eq(consentFormDrafts.formId,form.id),eq(consentFormDrafts.organizationId,user.organization_id)));
   if(input.action==='SAVE_DRAFT'){
    if((published?.version||0)!==input.baseVersion||draft&&(draft.id!==input.draftId||draft.revision!==input.revision)||!draft&&(input.draftId!==null||input.revision!==0))throw new ConsentVersionError('This form or draft changed. Reload before saving; your unsaved changes have not been published.');
    await validateConsentDefinition(tx,user.organization_id,input.definition);
    const values={name:input.name,audience:input.audience,definition:input.definition,baseVersion:input.baseVersion,updatedByUserId:user.id,updatedAt:new Date()};
    const saved=draft?(await tx.update(consentFormDrafts).set({...values,revision:draft.revision+1}).where(and(eq(consentFormDrafts.id,draft.id),eq(consentFormDrafts.organizationId,user.organization_id))).returning())[0]:(await tx.insert(consentFormDrafts).values({...values,organizationId:user.organization_id,formId:form.id}).returning())[0];
    return {draft:saved,publishedVersion:published?.version||0};
   }
   if(!draft||draft.id!==input.draftId||draft.revision!==input.revision||draft.baseVersion!==(published?.version||0))throw new ConsentVersionError('The saved draft changed or was already published. Reload before publishing.');
   const review=await legacyConsentReview(tx,user.organization_id,form.id);
   const preserveLegacy=Boolean(review.unsigned||review.signedWithoutSnapshot);
   if(preserveLegacy&&input.action!=='PUBLISH_FUTURE')throw new ConsentVersionError(`Publication blocked: ${review.unsigned} unresolved legacy link(s) and ${review.signedWithoutSnapshot} signed record(s) without a verifiable snapshot need review. Existing records were not changed.`);
   const definition=nativeDefinition.parse(draft.definition);
   await validateConsentDefinition(tx,user.organization_id,definition);
   if(preserveLegacy){
    // Keep the old form's definition, audience and template untouched. Legacy
    // links continue resolving that retained form; future routing uses a new one.
    const [replacement]=await tx.insert(externalWaiverForms).values({
     organizationId:form.organizationId,provider:'MAIA',name:draft.name,
     formUrl:form.formUrl,category:form.category,audience:draft.audience,
     artistId:form.artistId,serviceId:form.serviceId,priority:form.priority,
     completionMode:form.completionMode,collectsMedicalData:form.collectsMedicalData,
     active:form.active,metadata:{supersedesFormId:form.id}
    }).returning();
    const version=await createPublishedConsentVersion(tx,replacement,{name:draft.name,audience:draft.audience,definition},1,user.id);
    await tx.update(externalWaiverForms).set({metadata:{supersedesFormId:form.id,templateId:version.templateId,definition}}).where(and(eq(externalWaiverForms.id,replacement.id),eq(externalWaiverForms.organizationId,user.organization_id)));
    await tx.update(externalWaiverForms).set({active:false,metadata:{...(form.metadata as object),archived:true,replacementFormId:replacement.id},updatedAt:new Date()}).where(and(eq(externalWaiverForms.id,form.id),eq(externalWaiverForms.organizationId,user.organization_id)));
    await tx.delete(consentFormDrafts).where(and(eq(consentFormDrafts.id,draft.id),eq(consentFormDrafts.organizationId,user.organization_id)));
    return {publishedVersion:version.version,draft:null,formId:replacement.id,preservedExistingLinks:true};
   }
   const version=await createPublishedConsentVersion(tx,form,{name:draft.name,audience:draft.audience,definition},(published?.version||0)+1,user.id);
   await tx.update(externalWaiverForms).set({name:version.name,audience:version.audience,metadata:{...(form.metadata as object),templateId:version.templateId,definition},updatedAt:new Date()}).where(and(eq(externalWaiverForms.id,form.id),eq(externalWaiverForms.organizationId,user.organization_id)));
   await tx.delete(consentFormDrafts).where(and(eq(consentFormDrafts.id,draft.id),eq(consentFormDrafts.organizationId,user.organization_id)));
   return {publishedVersion:version.version,draft:null,formId:form.id,preservedExistingLinks:false};
  });return NextResponse.json(result,{headers});
 }catch(error){return failure(error);}
}
export const GET=protectedRoute(get);
export const POST=protectedRoute(post);
