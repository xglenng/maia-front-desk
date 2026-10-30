import {NextRequest,NextResponse} from 'next/server';
import {and,eq} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {artists,squareCatalogOAuthStates,squareCatalogConnections} from '@/packages/db/src/schema';
import {digest} from '@/packages/auth/crypto';
import {canAccessArtist} from '@/packages/inbox/state';
import {encryptComplianceSecret} from '@/packages/compliance/secrets';
import {squareBaseUrl,squareRedirectUri} from '@/packages/scheduling/square/config';
import {parseSquareOAuthTokenResponse} from '@/packages/scheduling/square/oauth-token';
export async function completeCatalogCallback(request:NextRequest,user:{id:string;organization_id:string;role:string}){
 const state=request.nextUrl.searchParams.get('state');if(!state||!/^[a-f0-9]{64}$/.test(state))return null;
 // Separate state storage prevents catalog authorization from ever replacing scheduling credentials.
 const [consumed]=await db.delete(squareCatalogOAuthStates).where(and(eq(squareCatalogOAuthStates.tokenHash,digest(state)),eq(squareCatalogOAuthStates.userId,user.id),eq(squareCatalogOAuthStates.organizationId,user.organization_id))).returning();
 if(!consumed)return null;
 const back=(status:string)=>new NextResponse(null,{status:303,headers:{Location:`/settings/services?artistId=${encodeURIComponent(consumed.artistId)}&import=apps&squareCatalog=${status}`}});
 if(consumed.expiresAt.getTime()<=Date.now())return back('invalid-state');
 const [artist]=await db.select().from(artists).where(and(eq(artists.id,consumed.artistId),eq(artists.organizationId,user.organization_id))).limit(1);
 if(!artist||!canAccessArtist(user.role,user.id,artist.userId))return back('invalid-state');
 if(request.nextUrl.searchParams.has('error'))return back('denied');
 const code=request.nextUrl.searchParams.get('code');if(!code)return back('failed');
 if(!process.env.SQUARE_APPLICATION_ID||!process.env.SQUARE_APPLICATION_SECRET)return back('not-configured');
 try{
  const response=await fetch(`${squareBaseUrl()}/oauth2/token`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:process.env.SQUARE_APPLICATION_ID,client_secret:process.env.SQUARE_APPLICATION_SECRET,code,grant_type:'authorization_code',redirect_uri:squareRedirectUri(request.nextUrl.origin)})});
  if(!response.ok)return back('failed');
  const token=parseSquareOAuthTokenResponse(await response.json(),{merchantRequired:true});
  const values={merchantId:token.merchantId!,accessTokenEncrypted:encryptComplianceSecret(token.accessToken),refreshTokenEncrypted:encryptComplianceSecret(token.refreshToken),expiresAt:token.expiresAt,status:'CONNECTED',updatedAt:new Date()};
  await db.insert(squareCatalogConnections).values({organizationId:user.organization_id,artistId:artist.id,...values}).onConflictDoUpdate({target:[squareCatalogConnections.organizationId,squareCatalogConnections.artistId],set:values});
  return back('connected');
 }catch{return back('failed');}
}
