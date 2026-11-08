import {createHash} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {NextResponse} from 'next/server';
import {db} from '@/packages/db/src';
import {studioLogoAssets} from '@/packages/db/src/schema';

export async function GET(_request:Request,{params}:{params:Promise<{assetId:string}>}){
 const {assetId}=await params;
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId))return new Response(null,{status:404});
 const [asset]=await db.select({contentType:studioLogoAssets.contentType,byteLength:studioLogoAssets.byteLength,sha256:studioLogoAssets.sha256,data:studioLogoAssets.data}).from(studioLogoAssets).where(eq(studioLogoAssets.id,assetId)).limit(1);
 if(!asset||asset.contentType!=='image/webp')return new Response(null,{status:404});
 const bytes=Buffer.from(asset.data,'base64');
 if(bytes.length!==asset.byteLength||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)return NextResponse.json({error:'Logo image integrity check failed.'},{status:500});
 return new Response(new Uint8Array(bytes),{headers:{'Content-Type':asset.contentType,'Content-Length':String(bytes.length),'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
