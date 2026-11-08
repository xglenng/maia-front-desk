import test from 'node:test';
import assert from 'node:assert/strict';
import {buildConsentStarter} from '../consent-starters';
import {nativeDefinition,validateNativeAnswers} from '../forms';
test('adult starters fit existing fields and resolve each artist brand without source studio data',()=>{
 for(const kind of ['TATTOO','PIERCING'] as const){
  const draft=buildConsentStarter(kind,' North & South $& Studio ',' Alex Rivera ');
  assert.ok(nativeDefinition.safeParse(draft.definition).success);
  const serialized=JSON.stringify(draft);
  assert.ok(serialized.includes('North & South $& Studio'));assert.ok(serialized.includes('Alex Rivera'));
  assert.doesNotMatch(serialized,/Embellished|\bVal\b|127 N 500 E|84770|\{\{/);
  assert.ok((draft.definition.fields?.length||0)<=40);
  assert.equal(draft.audience,'ADULT');
  assert.ok(!draft.definition.fields?.some(field=>field.id==='medical'));assert.equal(draft.definition.fields?.find(field=>field.id==='photo_id')?.required,false);
 }
});
test('minor starters request the minor and guardian details and identify the guardian as signer',()=>{
 for(const [kind,procedure] of [['MINOR_TATTOO','tattoo'],['MINOR_PIERCING','piercing']] as const){
  const draft=buildConsentStarter(kind,'Studio','Artist');
  const fields=draft.definition.fields||[];
  assert.equal(draft.audience,'MINOR');
  assert.equal(draft.name,`Minor ${procedure} consent`);
  assert.ok(fields.some(field=>field.id==='minor_name'&&field.type==='FULL_NAME'&&field.required));
  assert.ok(fields.some(field=>field.id==='minor_date_of_birth'&&field.type==='DATE'&&field.required));
  assert.ok(fields.some(field=>field.id==='guardian_name'&&field.type==='FULL_NAME'&&field.required));
  assert.ok(fields.some(field=>field.id==='guardian_relationship'&&field.type==='TEXT'&&field.required));
  assert.ok(fields.some(field=>field.id==='guardian_authority'&&field.type==='ACKNOWLEDGMENT'&&field.required));
  assert.equal(draft.definition.signerLabel,'Parent or legal guardian');
  assert.match(draft.definition.signerAgreement||'',/parent or legal guardian/i);
  assert.doesNotMatch(JSON.stringify(draft),/minimum age|must be \d{2}/i);
  assert.ok(nativeDefinition.safeParse(draft.definition).success);
 }
});
test('starters require identity and informed agreement but make photography optional',()=>{
 const {definition}=buildConsentStarter('TATTOO','Studio','Artist');
 const fields=definition.fields!;
 assert.equal(fields.find(field=>field.id==='photo_permission')?.required,false);
 assert.equal(fields.find(field=>field.id==='apprentice')?.required,false);
 assert.equal(validateNativeAnswers(definition,{}).success,false);
 const answers=Object.fromEntries(fields.filter(field=>field.required).map(field=>[field.id,field.type==='ACKNOWLEDGMENT'?true:field.type==='DATE'?'2000-01-01':field.type==='PHONE'?'+12025550123':'Synthetic response']));
 assert.equal(validateNativeAnswers(definition,answers).success,true);
 assert.equal(validateNativeAnswers(definition,{...answers,voluntary:false}).success,false);
});
test('template generation requires explicit branding and does not share mutable definitions',()=>{
 assert.throws(()=>buildConsentStarter('TATTOO',' ','Artist'));
 assert.throws(()=>buildConsentStarter('PIERCING','Studio',''));
 const first=buildConsentStarter('TATTOO','One','First');first.definition.fields![0].label='Changed';
 const second=buildConsentStarter('PIERCING','Two','Second');assert.notEqual(second.definition.fields![0].label,'Changed');
 assert.ok(!JSON.stringify(second).includes('First'));
});
