import {NextRequest,NextResponse} from 'next/server';
import {and,eq} from 'drizzle-orm';
import {z} from 'zod';
import {identity,protectedRoute} from '@/packages/auth/server';
import {canAccessArtist} from '@/packages/inbox/state';
import {db} from '@/packages/db/src';
import {artists,squareCatalogOAuthStates} from '@/packages/db/src/schema';
import {digest,token} from '@/packages/auth/crypto';
import {encryptComplianceSecret} from '@/packages/compliance/secrets';
import {squareBaseUrl,squareOAuthSession,squareRedirectUri} from '@/packages/scheduling/square/config';
import {squareCatalogScopes} from '@/packages/integrations/square-catalog/policy';
async function handleGET(request:NextRequest){
 const user=await identity(request);if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 const parsed=z.string().uuid().safeParse(request.nextUrl.searchParams.get('artistId'));if(!parsed.success)return NextResponse.json({error:'Choose an artist.'},{status:400});
 const [artist]=await db.select().from(artists).where(and(eq(artists.id,parsed.data),eq(artists.organizationId,user.organization_id))).limit(1);
 if(!artist||!canAccessArtist(user.role,user.id,artist.userId))return NextResponse.json({error:'Artist not found.'},{status:404});
 if(!process.env.SQUARE_APPLICATION_ID||!process.env.SQUARE_APPLICATION_SECRET)return NextResponse.json({error:'Square OAuth is not configured on the server.'},{status:503});
 try{encryptComplianceSecret('configuration-check');}catch{return NextResponse.json({error:'Encrypted connection storage is not configured.'},{status:503});}
 if(process.env.MAIA_STAGING_ISOLATED==='1'&&process.env.MAIA_STAGING_SQUARE_SANDBOX!=='1')return NextResponse.json({error:'Square authorization is disabled in this isolated preview.'},{status:503});
 const state=token();
 await db.insert(squareCatalogOAuthStates).values({tokenHash:digest(state),userId:user.id,organizationId:user.organization_id,artistId:artist.id,expiresAt:new Date(Date.now()+600000)});
 const authorization=new URL(`${squareBaseUrl()}/oauth2/authorize`);
 authorization.searchParams.set('client_id',process.env.SQUARE_APPLICATION_ID);authorization.searchParams.set('response_type','code');authorization.searchParams.set('scope',squareCatalogScopes.join(' '));authorization.searchParams.set('state',state);authorization.searchParams.set('redirect_uri',squareRedirectUri(request.nextUrl.origin));
 const session=squareOAuthSession();if(session)authorization.searchParams.set('session',session);
 return NextResponse.redirect(authorization);
}
export const GET=protectedRoute(handleGET);
