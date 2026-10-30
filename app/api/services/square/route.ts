import {NextRequest,NextResponse} from 'next/server';
import {and,eq} from 'drizzle-orm';
import {z} from 'zod';
import {identity,protectedRoute} from '@/packages/auth/server';
import {canAccessArtist} from '@/packages/inbox/state';
import {db} from '@/packages/db/src';
import {artists,squareCatalogConnections} from '@/packages/db/src/schema';
import {catalogAccessToken} from '@/packages/integrations/square-catalog/credentials';
import {squareCatalogCsv} from '@/packages/integrations/square-catalog/policy';
import {encryptComplianceSecret} from '@/packages/compliance/secrets';
import {SquareApiClient} from '@/packages/scheduling/square/client';
async function artistScope(request:NextRequest,id:unknown){
 const user=await identity(request);if(!user)return null;
 const valid=z.string().uuid().safeParse(id);if(!valid.success)return null;
 const [artist]=await db.select().from(artists).where(and(eq(artists.id,valid.data),eq(artists.organizationId,user.organization_id))).limit(1);
 return artist&&canAccessArtist(user.role,user.id,artist.userId)?{organizationId:user.organization_id,artistId:artist.id}:null;
}
async function handleGET(request:NextRequest){
 const scope=await artistScope(request,request.nextUrl.searchParams.get('artistId'));if(!scope)return NextResponse.json({error:'Artist not found.'},{status:404});
 const [connection]=await db.select().from(squareCatalogConnections).where(and(eq(squareCatalogConnections.organizationId,scope.organizationId),eq(squareCatalogConnections.artistId,scope.artistId))).limit(1);
 const connected=connection?.status==='CONNECTED';
 let configured=Boolean(process.env.SQUARE_APPLICATION_ID&&process.env.SQUARE_APPLICATION_SECRET);try{encryptComplianceSecret('configuration-check');}catch{configured=false;}
 if(request.nextUrl.searchParams.get('preview')!=='1')return NextResponse.json({connected,configured,...(connected?{merchantId:connection.merchantId}:{}),schedulingUnchanged:true});
 if(!connected)return NextResponse.json({error:'Connect your Square service catalog first.'},{status:409});
 if(process.env.MAIA_STAGING_ISOLATED==='1')return NextResponse.json({error:'Live Square reads are disabled in isolated previews.'},{status:503});
 try{
  const catalogFetch:typeof fetch=(url,init)=>fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});
  const catalog=await new SquareApiClient(await catalogAccessToken(connection),catalogFetch).listServiceVariations(true);
  const result=squareCatalogCsv(catalog);
  if(!result.count)return NextResponse.json({error:`No importable appointment services found. ${result.skipped} unsupported services skipped.`},{status:409});
  return NextResponse.json({...result,note:`Read ${result.count} Square services. ${result.skipped} unsupported prices skipped. Review all values before importing. Your calendar and existing services are unchanged.`});
 }catch{return NextResponse.json({error:'Unable to read Square services. Reconnect if access has expired, or try again later.'},{status:502});}
}
async function handlePOST(request:NextRequest){
 const input=z.object({artistId:z.string().uuid(),action:z.literal('DISCONNECT')}).safeParse(await request.json());if(!input.success)return NextResponse.json({error:'Invalid connection request.'},{status:400});
 const scope=await artistScope(request,input.data.artistId);if(!scope)return NextResponse.json({error:'Artist not found.'},{status:404});
 // Clear only Maia's catalog credentials. Do not revoke the app at Square: that could affect an independent scheduling connection.
 await db.update(squareCatalogConnections).set({status:'DISCONNECTED',accessTokenEncrypted:'',refreshTokenEncrypted:'',expiresAt:new Date(),updatedAt:new Date()}).where(and(eq(squareCatalogConnections.organizationId,scope.organizationId),eq(squareCatalogConnections.artistId,scope.artistId)));
 return NextResponse.json({connected:false,schedulingUnchanged:true});
}
export const GET=protectedRoute(handleGET);
export const POST=protectedRoute(handlePOST);
