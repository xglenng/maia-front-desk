import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFArray,PDFDocument,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
import {buildConsentDraftPdf} from '../draft-preview-pdf';
import {nativeDefinition} from '../forms';

function contentStreams(pdf:PDFDocument){
 return pdf.getPages().flatMap(page=>{
  const contents=page.node.Contents();
  const streams=contents instanceof PDFArray?Array.from({length:contents.size()},(_,index)=>contents.lookup(index)):contents?[contents]:[];
  return streams.filter((stream):stream is PDFRawStream=>stream instanceof PDFRawStream).map(stream=>Buffer.from(decodePDFRawStream(stream).decode()).toString());
 });
}

function encoded(value:string){return Buffer.from(value,'ascii').toString('hex').toUpperCase();}

test('draft PDF uses the current edited fields and paginates with a draft mark on every page',async()=>{
 const definition=nativeDefinition.parse({body:'Unsaved consent wording '.repeat(900),fields:[
  {id:'choice',type:'RADIO',label:'Preferred placement',required:true,options:['Option one','Option two']},
  {id:'ack',type:'ACKNOWLEDGMENT',label:'I understand this unsaved draft',required:true},
 ]});
 const bytes=await buildConsentDraftPdf({name:'Unsaved form title',definition,logoUrl:null,minorSigner:false});
 const pdf=await PDFDocument.load(bytes);
 const streams=contentStreams(pdf);
 assert.ok(pdf.getPageCount()>1);
 assert.equal(streams.length>=pdf.getPageCount(),true);
 assert.ok(streams.join('').includes(encoded('Unsaved form title')));
 assert.ok(streams.join('').includes(encoded('Option one')));
 assert.ok(streams.join('').includes(encoded('I understand this unsaved draft (required)')));
 for(let index=0;index<pdf.getPageCount();index++){
  const contents=contentStreams(pdf)[index]||'';
  assert.ok(contents.includes(encoded('Draft preview')),`page ${index+1} should be marked Draft preview`);
 }
});

test('draft PDF uses adult and guardian-specific signature labels',async()=>{
 const definition=nativeDefinition.parse({body:'Consent text'});
 const adult=await PDFDocument.load(await buildConsentDraftPdf({name:'Adult form',definition,logoUrl:null,minorSigner:false}));
 const minor=await PDFDocument.load(await buildConsentDraftPdf({name:'Minor form',definition,logoUrl:null,minorSigner:true}));
 assert.ok(contentStreams(adult).join('').includes(encoded('Client signature')));
 assert.ok(contentStreams(minor).join('').includes(encoded('Parent or legal guardian signature')));
});
