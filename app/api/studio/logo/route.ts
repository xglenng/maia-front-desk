import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {and,eq} from 'drizzle-orm';
import {NextRequest,NextResponse} from 'next/server';
import {identity,protectedSettingsRoute} from '@/packages/auth/server';
import {canManageStudioSettings} from '@/packages/auth/settings-policy';
import {db} from '@/packages/db/src';
import {studioLogoAssets} from '@/packages/db/src/schema';
import {boundedBody} from '@/packages/waivers/bounded-body';

const maxUploadBytes=2*1024*1024;
const maxRequestBytes=maxUploadBytes+64*1024;
const maxStoredBytes=512*1024;
async function handleGET(request:NextRequest){
 const user=await identity(request);if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 if(!canManageStudioSettings(user.role))return NextResponse.json({error:'Access denied.'},{status:403});
 const [asset]=await db.select({id:studioLogoAssets.id}).from(studioLogoAssets).where(and(eq(studioLogoAssets.organizationId,user.organization_id),eq(studioLogoAssets.active,true))).limit(1);
 return NextResponse.json({assetId:asset?.id??null,url:asset?`/api/public/studio-logo/${asset.id}`:null},{headers:{'Cache-Control':'private, no-store'}});
}
async function handlePOST(request:NextRequest){
 const user=await identity(request);if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 if(!canManageStudioSettings(user.role))return NextResponse.json({error:'Access denied.'},{status:403});
 let file:FormDataEntryValue|null;
 try{const raw=await boundedBody(request,maxRequestBytes),form=await new Response(new Uint8Array(raw),{headers:{'content-type':request.headers.get('content-type')||''}}).formData();if([...form.keys()].some(key=>key!=='logo')||form.getAll('logo').length!==1)return NextResponse.json({error:'Upload one studio logo image.'},{status:400});file=form.get('logo');}
 catch(error){return NextResponse.json({error:error instanceof Error&&error.message==='Request is too large.'?'Logo upload exceeds the 2 MB limit.':'Upload one studio logo image.'},{status:400});}
 if(!file||typeof file==='string'||!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>maxUploadBytes)return NextResponse.json({error:'Choose a JPEG, PNG, or WebP logo no larger than 2 MB.'},{status:400});
 let bytes:Buffer;
 try{
  const input=Buffer.from(await file.arrayBuffer());
  const image=sharp(input,{limitInputPixels:12_000_000,failOn:'warning',animated:false});
  const metadata=await image.metadata();
  if(!['jpeg','png','webp'].includes(metadata.format||'')||(metadata.pages||1)!==1)throw Error('Unsupported image.');
  bytes=await image.rotate().resize({width:1600,height:800,fit:'inside',withoutEnlargement:true}).webp({quality:85,alphaQuality:90}).toBuffer();
 }catch{return NextResponse.json({error:'Use a readable single-image JPEG, PNG, or WebP logo.'},{status:400});}
 if(!bytes.length||bytes.length>maxStoredBytes)return NextResponse.json({error:'The optimized logo must be no larger than 512 KB.'},{status:400});
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const [asset]=await db.transaction(async tx=>{
  await tx.update(studioLogoAssets).set({active:false}).where(and(eq(studioLogoAssets.organizationId,user.organization_id),eq(studioLogoAssets.active,true)));
  return tx.insert(studioLogoAssets).values({organizationId:user.organization_id,contentType:'image/webp',byteLength:bytes.length,sha256,data:bytes.toString('base64'),active:true}).returning({id:studioLogoAssets.id});
 });
 return NextResponse.json({assetId:asset.id,url:`/api/public/studio-logo/${asset.id}`},{status:201,headers:{'Cache-Control':'private, no-store'}});
}
async function handleDELETE(request:NextRequest){
 const user=await identity(request);if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 if(!canManageStudioSettings(user.role))return NextResponse.json({error:'Access denied.'},{status:403});
 await db.update(studioLogoAssets).set({active:false}).where(and(eq(studioLogoAssets.organizationId,user.organization_id),eq(studioLogoAssets.active,true)));
 return NextResponse.json({removed:true});
}
export const GET=protectedSettingsRoute(handleGET,false);
export async function POST(request:NextRequest){
 const user=await identity(request);
 if(!user)return NextResponse.json({error:'Sign in required.'},{status:401});
 if(!canManageStudioSettings(user.role))return NextResponse.json({error:'Access denied.'},{status:403});
 if(request.headers.get('origin')!==request.nextUrl.origin)return NextResponse.json({error:'Invalid request origin.'},{status:403});
 const response=await handlePOST(request);response.headers.set('Cache-Control','no-store');return response;
}
export const DELETE=protectedSettingsRoute(handleDELETE,false);
