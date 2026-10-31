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
test('retail catalog separates merchandise from appointment services and resolves categories and nested variations',async()=>{
 const {SquareApiClient}=await import('../square/client');
 let pages=0;
 const client=new SquareApiClient('synthetic',async(_url,init)=>{const body=JSON.parse(String(init?.body));assert.ok(body.object_types.includes('CATEGORY'));pages++;return new Response(JSON.stringify({objects:[{type:'CATEGORY',id:'cat',category_data:{name:'Aftercare'}},{type:'ITEM',id:'retail',item_data:{name:'Balm',product_type:'REGULAR',categories:[{id:'cat'}],variations:[{type:'ITEM_VARIATION',id:'small',item_variation_data:{item_id:'retail',name:'Small',sku:'BALM-S',pricing_type:'FIXED_PRICING',price_money:{amount:1500,currency:'USD'}}}]}},{type:'ITEM',id:'service',item_data:{name:'Tattoo',product_type:'APPOINTMENTS_SERVICE',variations:[{id:'tattoo'}]}},{type:'ITEM_VARIATION',id:'tattoo',item_variation_data:{item_id:'service',name:'Regular',pricing_type:'FIXED_PRICING',price_money:{amount:5000,currency:'USD'}}},{type:'ITEM',id:'gift',item_data:{name:'Gift',product_type:'GIFT_CARD',variations:[]}}]}),{status:200});},'https://connect.squareupsandbox.com');
 const rows=await client.listRetailVariations();assert.equal(pages,1);assert.equal(rows.length,1);assert.equal(rows[0].name,'Balm · Small');assert.equal(rows[0].sku,'BALM-S');assert.equal(rows[0].category,'Aftercare');assert.equal(rows[0].priceCents,1500);
});
