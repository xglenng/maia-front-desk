import test from 'node:test';
import assert from 'node:assert/strict';
import {squareCatalogCsv,squareCatalogScopes} from '@/packages/integrations/square-catalog/policy';
import {parseServiceCsv} from '@/packages/studio/service-import';
test('catalog-only OAuth requests just read access and keeps imported values reviewable',()=>{
 assert.deepEqual(squareCatalogScopes,['ITEMS_READ']);
 const result=squareCatalogCsv([{id:'a',version:null,name:'Tattoo, "small"',durationMinutes:30,priceCents:12000,currency:'USD',pricingType:'FIXED_PRICING'},{id:'b',version:null,name:'Piercing',durationMinutes:null,priceCents:null,pricingType:'VARIABLE_PRICING'},{id:'c',version:null,name:'Foreign',durationMinutes:20,priceCents:3000,currency:'CAD'},{id:'d',version:null,name:'Broken fixed',durationMinutes:30,priceCents:null,pricingType:'FIXED_PRICING'}]);
 assert.equal(result.skipped,2);assert.equal(result.count,2);
 const rows=parseServiceCsv(result.csv);assert.equal(rows[0].service.name,'Tattoo, "small"');assert.equal(rows[0].service.basePriceCents,12000);assert.equal(rows[0].service.serviceType,'TATTOO');assert.ok(rows[1].errors.length);assert.equal(rows[1].service.pricingType,'QUOTE');
 assert.throws(()=>squareCatalogCsv(Array.from({length:251},()=>({id:'x',version:null,name:'x',durationMinutes:1}))),/250/);
});
