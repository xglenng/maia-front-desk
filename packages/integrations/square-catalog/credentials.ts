import {and,eq} from 'drizzle-orm';
import {db} from '@/packages/db/src';
import {squareCatalogConnections} from '@/packages/db/src/schema';
import {decryptComplianceSecret,encryptComplianceSecret} from '@/packages/compliance/secrets';
import {squareBaseUrl} from '@/packages/scheduling/square/config';
import {parseSquareOAuthTokenResponse} from '@/packages/scheduling/square/oauth-token';
export async function catalogAccessToken(connection:typeof squareCatalogConnections.$inferSelect){
 if(connection.status!=='CONNECTED')throw Error('Square is disconnected.');
 if(connection.expiresAt.getTime()>Date.now()+60000)return decryptComplianceSecret(connection.accessTokenEncrypted);
 if(!process.env.SQUARE_APPLICATION_ID||!process.env.SQUARE_APPLICATION_SECRET)throw Error('Square is not configured.');
 const response=await fetch(`${squareBaseUrl()}/oauth2/token`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:process.env.SQUARE_APPLICATION_ID,client_secret:process.env.SQUARE_APPLICATION_SECRET,grant_type:'refresh_token',refresh_token:decryptComplianceSecret(connection.refreshTokenEncrypted)})});
 if(!response.ok)throw Error('Reconnect Square to refresh catalog access.');
 const token=parseSquareOAuthTokenResponse(await response.json(),{merchantRequired:false});
 if(token.merchantId&&token.merchantId!==connection.merchantId)throw Error('Square merchant changed. Reconnect the catalog.');
 const saved=await db.update(squareCatalogConnections).set({accessTokenEncrypted:encryptComplianceSecret(token.accessToken),refreshTokenEncrypted:encryptComplianceSecret(token.refreshToken),expiresAt:token.expiresAt,updatedAt:new Date()}).where(and(eq(squareCatalogConnections.id,connection.id),eq(squareCatalogConnections.organizationId,connection.organizationId),eq(squareCatalogConnections.artistId,connection.artistId),eq(squareCatalogConnections.status,'CONNECTED'),eq(squareCatalogConnections.updatedAt,connection.updatedAt))).returning({id:squareCatalogConnections.id});
 if(!saved.length)throw Error('Square connection changed. Reload the catalog.');
 return token.accessToken;
}
