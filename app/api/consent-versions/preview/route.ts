import {NextRequest,NextResponse} from 'next/server';
import {and,eq} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '@/packages/db/src';
import {consentFormVersions,organizations} from '@/packages/db/src/schema';
import {identity,protectedRoute} from '@/packages/auth/server';
import {consentEditorState,ConsentVersionError} from '@/packages/waivers/versions.server';
import {nativeDefinition} from '@/packages/waivers/forms';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
async function get(request:NextRequest){
 const query=z.object({formId:z.string().uuid(),source:z.enum(['draft','published']).default('published'),versionId:z.string().uuid().optional()}).safeParse(Object.fromEntries(request.nextUrl.searchParams));
 if(!query.success)return NextResponse.json({error:'Invalid preview.'},{status:400,headers});
 try{
  const user=(await identity(request))!,input=query.data,state=await consentEditorState(db,user,input.formId);
  let content={...state.form},versionLabel=state.publishedVersion?`Published version ${state.publishedVersion}`:'Legacy current configuration (not an issuance snapshot)';
  if(input.source==='draft'){
   if(input.versionId||!state.draft)throw new ConsentVersionError('Saved draft not found.',404);
   content={...content,name:state.draft.name,audience:state.draft.audience,definition:nativeDefinition.parse(state.draft.definition)};versionLabel=`Saved draft · revision ${state.draft.revision}`;
  }else if(input.versionId){
   const [version]=await db.select().from(consentFormVersions).where(and(eq(consentFormVersions.id,input.versionId),eq(consentFormVersions.organizationId,user.organization_id),eq(consentFormVersions.formId,input.formId)));
   if(!version)throw new ConsentVersionError('Published version not found.',404);
   content={...content,name:version.name,audience:version.audience,definition:nativeDefinition.parse(version.definition)};versionLabel=`Published version ${version.version}`;
  }
  const [organization]=await db.select({timezone:organizations.timezone}).from(organizations).where(eq(organizations.id,user.organization_id));
  return NextResponse.json({...content,timezone:organization.timezone,complete:false,preview:true,versionLabel},{headers});
 }catch(error){return NextResponse.json({error:error instanceof ConsentVersionError?error.message:'Preview unavailable. Confirm the consent migration is applied.'},{status:error instanceof ConsentVersionError?error.status:503,headers});}
}
export const GET=protectedRoute(get);
