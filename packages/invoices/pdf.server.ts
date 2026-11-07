import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import type {studioInvoices} from '@/packages/db/src/schema';

export async function draftInvoicePdf(row:typeof studioInvoices.$inferSelect){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 let page=pdf.addPage([612,792]),y=748;
 const text=(value:string,size=11,emphasis=false)=>{
  const face=emphasis?bold:font;
  const safe=Array.from(value,character=>{try{face.encodeText(character);return character;}catch{return character==='\n'?' ':'?';}}).join('');
  const segments:string[]=[];let current='';
  for(const character of safe){if(face.widthOfTextAtSize(current+character,size)>510){segments.push(current);current='';}current+=character;}
  if(current||!segments.length)segments.push(current);
  for(const segment of segments){
   if(y<55){page=pdf.addPage([612,792]);y=748;}
   page.drawText(segment,{x:48,y,size,font:face,color:rgb(0.13,0.12,0.11)});y-=size+8;
  }
 };
 const money=(cents:number)=>`$${(cents/100).toFixed(2)}`;
 text('DRAFT - NOT AN ISSUED INVOICE',18,true);
 text('Preview only. No payment is due and no payment link has been created.',10);
 y-=12;text(`Customer: ${row.clientName}`,12,true);
 if(row.clientEmail)text(`Email: ${row.clientEmail}`);
 text(`Payment due within ${row.dueDays===1?'24 hours':`${row.dueDays} days`} of issue.`);
 y-=12;text('Items',13,true);
 for(const line of row.lines as Array<{name:string;quantity:number;unitCents:number}>){
  text(`${line.name} | ${line.quantity} x ${money(line.unitCents)} | ${money(line.quantity*line.unitCents)}`);
 }
 y-=8;text(`Total: ${money(row.totalCents)}`,14,true);
 if(row.note){y-=10;text(`Note: ${row.note}`);}
 return pdf.save();
}
