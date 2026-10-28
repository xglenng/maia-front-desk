import 'server-only';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {encryptComplianceSecret,decryptComplianceSecret} from '@/packages/compliance/secrets';
export const MAX_ID_UPLOAD_BYTES=5*1024*1024;
export function identityImageStorageReady(){
 const value=process.env.COMPLIANCE_ENCRYPTION_KEY||process.env.TWILIO_ENCRYPTION_KEY;
 return Boolean(value&&Buffer.from(value,'base64').length===32);
}
export async function prepareIdentityImage(file:File){
 if(!identityImageStorageReady())throw Error('Private photo ID storage is not configured.');
 if(!['image/jpeg','image/png'].includes(file.type)||!file.size||file.size>MAX_ID_UPLOAD_BYTES)throw Error('Upload a JPEG or PNG image no larger than 5 MB.');
 try{
  const input=Buffer.from(await file.arrayBuffer());
  const jpeg=input.subarray(0,3).equals(Buffer.from([255,216,255]));
  const png=input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(!jpeg&&!png)throw Error('Unsupported image');
  const image=sharp(input,{limitInputPixels:25_000_000,failOn:'warning',animated:false});
  const metadata=await image.metadata();
  if(!['jpeg','png'].includes(metadata.format||'')||(metadata.pages||1)!==1)throw Error('Unsupported image');
  // Decode and re-encode to remove original metadata and reject disguised/non-image payloads.
  const bytes=await image.rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:85}).toBuffer();
  if(!bytes.length||bytes.length>2*1024*1024)throw Error('Image too large');
  return {contentType:'image/jpeg',byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),encryptedImage:encryptComplianceSecret(bytes.toString('base64'))};
 }catch{throw Error('Use a readable JPEG or PNG photo ID image no larger than 5 MB.');}
}
export function readIdentityImage(document:{encryptedImage:string;sha256:string;byteLength:number}){
 const bytes=Buffer.from(decryptComplianceSecret(document.encryptedImage),'base64');
 if(bytes.length!==document.byteLength||createHash('sha256').update(bytes).digest('hex')!==document.sha256)throw Error('Identity image integrity check failed.');
 return bytes;
}
