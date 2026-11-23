import {createHash} from 'node:crypto';
import {and,desc,eq,isNull,sql} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {appointments,artists,consentFormDrafts,consentFormVersions,externalWaiverAssignments,externalWaiverForms,studioLogoAssets,waiverSubmissions,waiverTemplates} from '@/packages/db/src/schema';
import {nativeDefinition,type NativeDefinition} from './forms';
import type {Identity} from '@/packages/auth/server';

export type ConsentDatabase=Pick<typeof db,'select'|'insert'|'update'|'delete'|'execute'>;
export class ConsentVersionError extends Error {constructor(message:string,readonly status=409){super(message);}}
export const contentHash=(name:string,audience:string,definition:NativeDefinition)=>createHash('sha256').update(JSON.stringify({name,audience,definition})).digest('hex');
export async function managedConsentForm(database:ConsentDatabase,user:Identity,id:string){
 const [form]=await database.select().from(externalWaiverForms).where(and(eq(externalWaiverForms.id,id),eq(externalWaiverForms.organizationId,user.organization_id)));
 if(!form||form.provider!=='MAIA'||(form.metadata as {archived?:boolean})?.archived)throw new ConsentVersionError('Maia consent form not found.',404);
 if(user.role!=='OWNER'){
  const [artist]=form.artistId?await database.select({id:artists.id}).from(artists).where(and(eq(artists.id,form.artistId),eq(artists.organizationId,user.organization_id),eq(artists.userId,user.id))):[];
  if(!artist)throw new ConsentVersionError('Maia consent form not found.',404);
 }
 return form;
}
export async function latestConsentVersion(database:ConsentDatabase,organizationId:string,formId:string){
 return (await database.select().from(consentFormVersions).where(and(eq(consentFormVersions.organizationId,organizationId),eq(consentFormVersions.formId,formId))).orderBy(desc(consentFormVersions.version)).limit(1))[0]??null;
}
export async function validateConsentDefinition(database:ConsentDatabase,organizationId:string,definition:NativeDefinition){
 if(definition.logoAssetId){const [logo]=await database.select({id:studioLogoAssets.id}).from(studioLogoAssets).where(and(eq(studioLogoAssets.id,definition.logoAssetId),eq(studioLogoAssets.organizationId,organizationId)));if(!logo)throw new ConsentVersionError('Studio logo not found.',400);}
 if(definition.fields?.some(f=>f.type==='PHOTO_ID')){const {identityImageStorageReady}=await import('./identity-image.server');if(!identityImageStorageReady())throw new ConsentVersionError('Private photo ID storage must be configured.',503);}
}
export function signedConsentSnapshot(signatureData:string,body:string){
 try{const evidence=JSON.parse(signatureData),definition=nativeDefinition.safeParse(evidence.definition);if(!definition.success||definition.data.body!==body||!['ANY','ADULT','MINOR'].includes(evidence.audience))return null;return {definition:definition.data,audience:evidence.audience as 'ANY'|'ADULT'|'MINOR'};}catch{return null;}
}
export async function legacyConsentReview(database:ConsentDatabase,organizationId:string,formId:string){
 const rows=await database.select({assignment:externalWaiverAssignments,signatureData:waiverSubmissions.signatureData,body:waiverTemplates.body}).from(externalWaiverAssignments)
 .leftJoin(waiverSubmissions,and(eq(waiverSubmissions.organizationId,externalWaiverAssignments.organizationId),eq(waiverSubmissions.appointmentId,externalWaiverAssignments.appointmentId),sql`${waiverSubmissions.clientId} IS NOT DISTINCT FROM ${externalWaiverAssignments.clientId}`,sql`${waiverSubmissions.id}::text = ${externalWaiverAssignments.providerMetadata}->>'submissionId'`))
 .leftJoin(waiverTemplates,and(eq(waiverTemplates.id,waiverSubmissions.waiverTemplateId),eq(waiverTemplates.organizationId,waiverSubmissions.organizationId)))
 .where(and(eq(externalWaiverAssignments.organizationId,organizationId),eq(externalWaiverAssignments.waiverFormId,formId),isNull(externalWaiverAssignments.nativeVersionId),sql`${externalWaiverAssignments.status} <> 'VOID'`));
 let unsigned=0,signedWithoutSnapshot=0;
 for(const row of rows){if(!['COMPLETED','REVIEWED'].includes(row.assignment.status))unsigned++;else if(!row.signatureData||!row.body||!signedConsentSnapshot(row.signatureData,row.body))signedWithoutSnapshot++;}
 return {unsigned,signedWithoutSnapshot};
}
export async function createPublishedConsentVersion(database:ConsentDatabase,form:typeof externalWaiverForms.$inferSelect,values:{name:string;audience:string;definition:NativeDefinition},version:number,userId:string|null){
 const [template]=await database.insert(waiverTemplates).values({organizationId:form.organizationId,name:values.name,version,body:values.definition.body,active:false}).returning();
 return (await database.insert(consentFormVersions).values({organizationId:form.organizationId,formId:form.id,version,name:values.name,audience:values.audience,definition:values.definition,templateId:template.id,contentHash:contentHash(values.name,values.audience,values.definition),createdByUserId:userId}).returning())[0];
}
/** All issuance paths hold the form lock shared with publishing and settings. No legacy assignments are backfilled. */
export async function createConsentAssignment(database:ConsentDatabase,values:typeof externalWaiverAssignments.$inferInsert,selected?:{name:string;audience:string}){
 await database.execute(sql`SELECT id FROM ${externalWaiverForms} WHERE id=${values.waiverFormId} AND organization_id=${values.organizationId} FOR UPDATE`);
 const [form]=await database.select().from(externalWaiverForms).where(and(eq(externalWaiverForms.id,values.waiverFormId),eq(externalWaiverForms.organizationId,values.organizationId)));
 if(!form||!form.active||(form.metadata as {archived?:boolean})?.archived)throw new ConsentVersionError('Consent form is not available.');
 const [appointment]=await database.select().from(appointments).where(and(eq(appointments.id,values.appointmentId),eq(appointments.organizationId,values.organizationId)));
 if(!appointment||appointment.clientId!==(values.clientId??null)||form.artistId&&form.artistId!==appointment.artistId||form.serviceId&&form.serviceId!==appointment.serviceId)throw new ConsentVersionError('Consent assignment does not match this appointment.');
 let versionId:string|null=null;
 if(form.provider==='MAIA'){
  let version=await latestConsentVersion(database,form.organizationId,form.id);
  if(!version){
   const metadata=form.metadata as {definition?:unknown;templateId?:string}|null;
   const definition=nativeDefinition.safeParse(metadata?.definition);
   if(!definition.success)throw new ConsentVersionError('The current legacy definition needs review before issuing a new link.');
   const [template]=metadata?.templateId?await database.select().from(waiverTemplates).where(and(eq(waiverTemplates.id,metadata.templateId),eq(waiverTemplates.organizationId,form.organizationId))):[];
   if(!template||template.body!==definition.data.body)throw new ConsentVersionError('The current legacy template needs review before issuing a new link.');
   await validateConsentDefinition(database,form.organizationId,definition.data);
   version=await createPublishedConsentVersion(database,form,{name:form.name,audience:form.audience,definition:definition.data},1,null);
   // This is the unchanged current configuration becoming version 1 for new
   // links, not a historical backfill. Advance any draft's baseline without
   // changing its content, and invalidate stale editors via its revision.
   await database.update(consentFormDrafts).set({baseVersion:1,revision:sql`${consentFormDrafts.revision} + 1`,updatedAt:new Date()}).where(and(eq(consentFormDrafts.formId,form.id),eq(consentFormDrafts.organizationId,form.organizationId),eq(consentFormDrafts.baseVersion,0)));
  }
  if(selected&&(version.audience!==selected.audience||version.name!==selected.name))throw new ConsentVersionError('Consent form changed during selection. Retry this appointment.');
  versionId=version.id;
 }
 return (await database.insert(externalWaiverAssignments).values({...values,nativeVersionId:versionId}).returning())[0];
}
export async function consentEditorState(database:ConsentDatabase,user:Identity,id:string){
 const form=await managedConsentForm(database,user,id);
 const published=await latestConsentVersion(database,form.organizationId,id);
 const [draft]=await database.select().from(consentFormDrafts).where(and(eq(consentFormDrafts.formId,id),eq(consentFormDrafts.organizationId,form.organizationId)));
 const definition=nativeDefinition.safeParse(published?.definition||(form.metadata as {definition?:unknown})?.definition);
 if(!definition.success)throw new ConsentVersionError('This legacy form definition cannot be safely loaded. Review its retained records first.');
 const versions=await database.select({id:consentFormVersions.id,version:consentFormVersions.version,createdAt:consentFormVersions.createdAt,name:consentFormVersions.name}).from(consentFormVersions).where(and(eq(consentFormVersions.organizationId,form.organizationId),eq(consentFormVersions.formId,id))).orderBy(desc(consentFormVersions.version));
 return {form:{id,artistId:form.artistId,name:published?.name||form.name,audience:published?.audience||form.audience,definition:definition.data},publishedVersion:published?.version||0,draft:draft||null,versions,legacyReview:await legacyConsentReview(database,form.organizationId,id)};
}
