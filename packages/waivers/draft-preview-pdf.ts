import {PDFDocument,StandardFonts,rgb,type PDFFont,type PDFImage} from 'pdf-lib';
import type {NativeDefinition} from './forms';

const PAGE_WIDTH=612;
const PAGE_HEIGHT=792;
const LEFT=52;
const RIGHT=560;
const CONTENT_WIDTH=RIGHT-LEFT;
const INK=rgb(0.13,0.12,0.11);
const MUTED=rgb(0.43,0.41,0.39);
const LINE=rgb(0.84,0.82,0.79);

function safeText(value:string,font:PDFFont){
 return Array.from(value,character=>{
  try{font.encodeText(character);return character;}
  catch{return character==='\n'?'\n':'?';}
 }).join('');
}

async function imageFromUrl(url:string):Promise<Uint8Array>{
 let response:Response;
 try{response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});}
 catch{throw Error('The studio logo could not be loaded. Check your connection and retry.');}
 if(!response.ok)throw Error('The studio logo could not be loaded. Remove it or try again.');
 const source=URL.createObjectURL(await response.blob());
 try{
  const image=new Image();
  await new Promise<void>((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('The studio logo could not be decoded. Remove it or try again.')),10000);
   image.onload=()=>{clearTimeout(timer);image.naturalWidth?resolve():reject(Error('The studio logo could not be decoded. Remove it or try again.'));};
   image.onerror=()=>{clearTimeout(timer);reject(Error('The studio logo could not be decoded. Remove it or try again.'));};
   image.src=source;
   if(image.complete){clearTimeout(timer);image.naturalWidth?resolve():reject(Error('The studio logo could not be decoded. Remove it or try again.'));}
  });
  const canvas=document.createElement('canvas');
  canvas.width=image.naturalWidth;
  canvas.height=image.naturalHeight;
  const context=canvas.getContext('2d');
  if(!context)throw Error('The studio logo could not be prepared for the PDF.');
  context.drawImage(image,0,0);
  const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('The studio logo could not be prepared for the PDF.')),'image/png'));
  return new Uint8Array(await png.arrayBuffer());
 }finally{URL.revokeObjectURL(source);}
}

export async function buildConsentDraftPdf({name,definition,logoUrl,minorSigner}:{name:string;definition:NativeDefinition;logoUrl:string|null;minorSigner:boolean}):Promise<Uint8Array>{
 const pdf=await PDFDocument.create();
 const font=await pdf.embedFont(StandardFonts.Helvetica);
 const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 let logo:PDFImage|undefined;
 if(logoUrl){
  try{logo=await pdf.embedPng(await imageFromUrl(logoUrl));}
  catch(error){throw error instanceof Error?error:Error('The studio logo could not be added to the PDF.');}
 }
 let page=pdf.addPage([PAGE_WIDTH,PAGE_HEIGHT]);
 let y=PAGE_HEIGHT-54;
 function addPage(){
  page=pdf.addPage([PAGE_WIDTH,PAGE_HEIGHT]);
  y=PAGE_HEIGHT-54;
  page.drawText('Draft preview',{x:LEFT,y,size:10,font:bold,color:MUTED});
  page.drawLine({start:{x:LEFT,y:y-10},end:{x:RIGHT,y:y-10},thickness:0.7,color:LINE});
  y-=32;
 }
 function ensure(height:number){
  if(y-height<55)addPage();
 }
 function wrap(value:string,size:number,face:PDFFont){
  const output:string[]=[];
  const sanitized=safeText(value,face);
  for(const paragraph of sanitized.split('\n')){
   const words=paragraph.split(/\s+/).filter(Boolean);
   let line='';
   for(const word of words){
    const candidate=line?`${line} ${word}`:word;
    if(face.widthOfTextAtSize(candidate,size)<=CONTENT_WIDTH){line=candidate;continue;}
    if(line)output.push(line);
    if(face.widthOfTextAtSize(word,size)<=CONTENT_WIDTH){line=word;continue;}
    let part='';
    for(const character of word){
     if(face.widthOfTextAtSize(part+character,size)>CONTENT_WIDTH&&part){output.push(part);part='';}
     part+=character;
    }
    line=part;
   }
   output.push(line);
  }
  return output.length?output:[''];
 }
 function text(value:string,size=11,face:PDFFont=font,color=INK,leading=size+5){
  for(const line of wrap(value,size,face)){
   ensure(leading);
   if(line)page.drawText(line,{x:LEFT,y,size,font:face,color});
   y-=leading;
  }
 }
 function rule(gap=12){
  y-=gap/2;
  ensure(8);
  page.drawLine({start:{x:LEFT,y},end:{x:RIGHT,y},thickness:0.6,color:LINE});
  y-=gap/2+8;
 }
 function marker(x:number,atY:number,round=false){
  if(round)page.drawCircle({x:x+4,y:atY+3,size:8,borderColor:MUTED,borderWidth:0.8});
  else page.drawRectangle({x,y:atY,width:8,height:8,borderColor:MUTED,borderWidth:0.8});
 }

 page.drawText('Draft preview',{x:LEFT,y,size:10,font:bold,color:MUTED});
 page.drawLine({start:{x:LEFT,y:y-10},end:{x:RIGHT,y:y-10},thickness:0.7,color:LINE});
 y-=34;
 if(logo){
  const scale=Math.min(CONTENT_WIDTH/logo.width,96/logo.height,1);
  const width=logo.width*scale,height=logo.height*scale;
  ensure(height+20);
  page.drawImage(logo,{x:LEFT,y:y-height,width,height});
  y-=height+20;
 }
 text(name.trim()||'Untitled consent form',20,bold,INK,26);
 y-=8;
 rule(8);
 text('Consent text',12,bold);
 text(definition.body,11,font,INK,16);
 for(const field of definition.fields||[]){
  if(field.type==='DIVIDER'){rule(14);continue;}
  if(field.type==='HEADING'){
   y-=6;text(field.label,14,bold,INK,19);continue;
  }
  if(field.type==='PARAGRAPH'){
   y-=2;text(field.label,11,font,INK,16);continue;
  }
  const required=field.required?' (required)':' (optional)';
  y-=5;
  ensure(wrap(`${field.label}${required}`,11,bold).length*16+12);
  text(`${field.label}${required}`,11,bold,INK,16);
  if(field.type==='ACKNOWLEDGMENT'){
   ensure(32);marker(LEFT+2,y-2);text('Acknowledgment not checked',10,font,MUTED,14);y-=3;
   continue;
  }
  if(field.type==='CHOICE'||field.type==='RADIO'||field.type==='MULTI_CHOICE'){
   for(const option of field.options){
    ensure(20);marker(LEFT+10,y-2,field.type==='RADIO');
    const lines=wrap(option,10,font);
    for(const [index,line] of lines.entries()){
     if(index)ensure(15);
     page.drawText(line,{x:LEFT+26,y,size:10,font,color:INK});
     y-=15;
    }
   }
   y-=4;continue;
  }
  if(field.type==='PHOTO_ID'){
   ensure(46);page.drawRectangle({x:LEFT,y:y-34,width:CONTENT_WIDTH,height:34,borderColor:LINE,borderWidth:0.8});
   page.drawText('Photo ID upload area',{x:LEFT+10,y:y-21,size:9,font,color:MUTED});y-=46;continue;
  }
  const lineCount=field.type==='LONG_TEXT'||field.type==='ADDRESS'?3:1;
  for(let i=0;i<lineCount;i++){
   ensure(26);y-=13;
   page.drawLine({start:{x:LEFT,y},end:{x:RIGHT,y},thickness:0.7,color:LINE});
  }
  y-=6;
 }
 y-=8;
 rule(10);
 const nameLabel=minorSigner?'Parent or legal guardian’s full legal name':'Full legal name';
 const signatureLabel=minorSigner?'Parent or legal guardian signature':'Client signature';
 text(nameLabel,11,bold);
 ensure(32);y-=12;page.drawLine({start:{x:LEFT,y},end:{x:RIGHT,y},thickness:0.8,color:LINE});y-=24;
 text(signatureLabel,12,bold);
 ensure(140);
 page.drawRectangle({x:LEFT,y:y-108,width:CONTENT_WIDTH,height:108,borderColor:LINE,borderWidth:0.8});
 y-=126;
 for(const [index,current] of pdf.getPages().entries()){
  current.drawText('Draft preview',{x:LEFT,y:26,size:9,font:bold,color:MUTED});
  current.drawText(`Page ${index+1}`,{x:RIGHT-40,y:26,size:9,font,color:MUTED});
 }
 return pdf.save();
}
