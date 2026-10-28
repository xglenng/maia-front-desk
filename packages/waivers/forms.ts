import {z} from 'zod';
export const publicFormUrl=z.string().url().max(2000).refine(value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}},'Use a public HTTPS form link without embedded credentials.');
const fieldBase={id:z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),label:z.string().trim().min(1).max(300),required:z.boolean()};
const choices=z.array(z.string().trim().min(1).max(200)).min(2).max(20).refine(items=>new Set(items).size===items.length,'Choices must be unique.');
const question=z.discriminatedUnion('type',[
 z.object({...fieldBase,type:z.literal('TEXT')}),
 z.object({...fieldBase,type:z.literal('LONG_TEXT')}),
 z.object({...fieldBase,type:z.literal('ACKNOWLEDGMENT')}),
 z.object({...fieldBase,type:z.literal('CHOICE'),options:choices}),
 z.object({...fieldBase,type:z.literal('RADIO'),options:choices}),
 z.object({...fieldBase,type:z.literal('MULTI_CHOICE'),options:choices}),
 z.object({...fieldBase,type:z.literal('EMAIL')}),
 z.object({...fieldBase,type:z.literal('PHONE')}),
 z.object({...fieldBase,type:z.literal('DATE')}),
 z.object({...fieldBase,type:z.literal('NUMBER')}),
 z.object({...fieldBase,type:z.literal('FULL_NAME')}),
 z.object({...fieldBase,type:z.literal('ADDRESS')}),
 z.object({...fieldBase,type:z.literal('HEADING')}),
 z.object({...fieldBase,type:z.literal('PARAGRAPH')}),
 z.object({...fieldBase,type:z.literal('DIVIDER')}),
]);
export const nativeDefinition=z.object({body:z.string().trim().min(1).max(30000),fields:z.array(question).max(40).optional()}).refine(value=>new Set(value.fields?.map(field=>field.id)).size===(value.fields?.length||0),'Question IDs must be unique.');
export type NativeField=z.infer<typeof question>;
export const nativeAnswers=z.record(z.union([z.string().max(5000),z.boolean(),z.array(z.string().max(200)).max(20)])).refine(value=>Object.keys(value).length<=40);
export type NativeAnswers=z.infer<typeof nativeAnswers>;
export function validateNativeAnswers(definition:NativeDefinition,input:unknown):{success:true;data:NativeAnswers}|{success:false;error:string}{
 const parsed=nativeAnswers.safeParse(input??{});
 if(!parsed.success)return {success:false,error:'Invalid answers.'};
 const fields=definition.fields||[];
 if(Object.keys(parsed.data).some(id=>!fields.some(field=>field.id===id)))return {success:false,error:'Unknown question.'};
 const answers:NativeAnswers={};
 for(const field of fields){
  const value=parsed.data[field.id];
  if(['HEADING','PARAGRAPH','DIVIDER'].includes(field.type)){
   if(value!==undefined)return {success:false,error:'Display elements do not accept answers.'};
   continue;
  }
  if(field.type==='MULTI_CHOICE'){
   if(value!==undefined&&(!Array.isArray(value)||value.some(item=>!field.options.includes(item))))return {success:false,error:'Choose only listed answers.'};
   const selected=Array.isArray(value)?value:[];
   if(new Set(selected).size!==selected.length)return {success:false,error:'Duplicate choices are not allowed.'};
   if(field.required&&!selected.length)return {success:false,error:`Please answer: ${field.label}`};
   answers[field.id]=field.options.filter(option=>selected.includes(option));continue;
  }
  if(field.type==='ACKNOWLEDGMENT'){
   if(value!==undefined&&typeof value!=='boolean')return {success:false,error:'Invalid acknowledgment.'};
   if(field.required&&value!==true)return {success:false,error:`Please acknowledge: ${field.label}`};
   answers[field.id]=value===true;
  }else{
   if(value!==undefined&&typeof value!=='string')return {success:false,error:'Invalid answer.'};
   const text=typeof value==='string'?value.trim():'';
   if(field.required&&!text)return {success:false,error:`Please answer: ${field.label}`};
   if(text.length>(field.type==='LONG_TEXT'||field.type==='ADDRESS'?5000:500))return {success:false,error:'Answer is too long.'};
   if(text&&(field.type==='CHOICE'||field.type==='RADIO')&&!field.options.includes(text))return {success:false,error:'Choose one of the listed answers.'};
   if(text&&field.type==='EMAIL'&&!z.string().email().safeParse(text).success)return {success:false,error:'Enter a valid email address.'};
   if(text&&field.type==='PHONE'&&!/^\+?[0-9() .-]{7,30}$/.test(text))return {success:false,error:'Enter a valid phone number.'};
   if(text&&field.type==='NUMBER'&&(!/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)||!Number.isFinite(Number(text))))return {success:false,error:'Enter a valid number.'};
   if(text&&field.type==='DATE'&&(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text))return {success:false,error:'Enter a valid date.'};
   answers[field.id]=text;
  }
 }
 return {success:true,data:answers};
}
export type NativeDefinition=z.infer<typeof nativeDefinition>;
export function canManageForm(role:string,userArtistIds:string[],formArtistId:string|null){return role==='OWNER'||Boolean(formArtistId&&userArtistIds.includes(formArtistId));}
