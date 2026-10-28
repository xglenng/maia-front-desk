import test from 'node:test';
import assert from 'node:assert/strict';
import {canManageForm,nativeDefinition,publicFormUrl} from '../forms';
test('artists can manage only their own forms, owners can manage studio forms',()=>{
 assert.equal(canManageForm('ARTIST',['a'],'a'),true);
 assert.equal(canManageForm('ARTIST',['a'],'b'),false);
 assert.equal(canManageForm('ARTIST',['a'],null),false);
 assert.equal(canManageForm('OWNER',[],null),true);
});
test('external provider links reject unsafe protocols and embedded credentials',()=>{
 for(const url of ['javascript:alert(1)','http://forms.example','https://user:secret@forms.example'])assert.equal(publicFormUrl.safeParse(url).success,false);
 for(const url of ['https://form.jotform.com/123','https://docs.google.com/forms/d/example/viewform','https://example.typeform.com/to/example'])assert.equal(publicFormUrl.safeParse(url).success,true);
});
test('native forms require bounded studio-provided consent wording',()=>{
 assert.equal(nativeDefinition.safeParse({body:'   '}).success,false);
 assert.equal(nativeDefinition.safeParse({body:'x'.repeat(30001)}).success,false);
 assert.deepEqual(nativeDefinition.parse({body:' Studio wording '}),{body:'Studio wording'});
});
test('hosted routing builds an internal token link without leaking appointment or client IDs',async()=>{
 const {assignedFormUrl}=await import('../selection');
 assert.equal(assignedFormUrl({provider:'MAIA',formUrl:'/waiver'},'opaque','https://studio.example'), 'https://studio.example/waiver?waiverToken=opaque');
 assert.equal(assignedFormUrl({provider:'CUSTOM',formUrl:'https://forms.example/123?x=1'},'opaque',''), 'https://forms.example/123?x=1&waiverToken=opaque');
 assert.throws(()=>assignedFormUrl({provider:'MAIA',formUrl:'/waiver'},'opaque',''));
});
test('custom definitions reject duplicate IDs, invalid choices and oversized forms',()=>{
 const field={id:'a',type:'TEXT',label:'Question',required:true};
 assert.equal(nativeDefinition.safeParse({body:'Consent',fields:[field,field]}).success,false);
 assert.equal(nativeDefinition.safeParse({body:'Consent',fields:[{...field,type:'CHOICE',options:['Same','Same']}]}).success,false);
 assert.equal(nativeDefinition.safeParse({body:'Consent',fields:Array.from({length:41},(_,i)=>({...field,id:`q${i}`}))}).success,false);
});
test('custom responses enforce required acknowledgments, choice allowlists and field IDs',async()=>{
 const {validateNativeAnswers}=await import('../forms');
 const definition=nativeDefinition.parse({body:'Consent',fields:[{id:'name',type:'TEXT',label:'Preferred name',required:true},{id:'choice',type:'CHOICE',label:'Design',required:true,options:['A','B']},{id:'ack',type:'ACKNOWLEDGMENT',label:'Read policy',required:true}]});
 assert.equal(validateNativeAnswers(definition,{}).success,false);
 assert.equal(validateNativeAnswers(definition,{name:'Alex',choice:'C',ack:true}).success,false);
 assert.equal(validateNativeAnswers(definition,{name:'Alex',choice:'A',ack:false}).success,false);
 assert.equal(validateNativeAnswers(definition,{name:'Alex',choice:'A',ack:true,other:'injected'}).success,false);
 assert.equal(validateNativeAnswers(definition,{name:true,choice:'A',ack:true}).success,false);
 assert.deepEqual(validateNativeAnswers(definition,{name:' Alex ',choice:'A',ack:true}),{success:true,data:{name:'Alex',choice:'A',ack:true}});
 assert.deepEqual(validateNativeAnswers({body:'Legacy text'},undefined),{success:true,data:{}});
});
