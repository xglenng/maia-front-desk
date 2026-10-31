import test from 'node:test';
import assert from 'node:assert/strict';
import {squareRetailItems,importedItemSchema,itemImportKey} from '../item-import';
test('retail catalog preserves fixed and variable prices, SKU and category without inventing tax',()=>{
 const result=squareRetailItems([{id:'one',version:null,name:'Aftercare · Small',durationMinutes:null,pricingType:'FIXED_PRICING',priceCents:1250,currency:'USD',sku:'A-1',category:'Aftercare'},{id:'two',version:null,name:'Jewelry',durationMinutes:null,pricingType:'VARIABLE_PRICING'}]);
 assert.deepEqual(result,{skipped:0,items:[{name:'Aftercare · Small',priceCents:1250,sku:'A-1',category:'Aftercare',taxBasisPoints:0},{name:'Jewelry',priceCents:null,sku:null,category:null,taxBasisPoints:0}]});
 assert.equal(itemImportKey(result.items[0]),itemImportKey({name:' aftercare · SMALL '}));
});
test('retail import rejects unsupported money, prices and oversized fields',()=>{
 const item={id:'one',version:null,name:'Aftercare',durationMinutes:null,pricingType:'FIXED_PRICING',priceCents:1250,currency:'USD'};
 assert.equal(squareRetailItems([{...item,currency:'CAD'},{...item,priceCents:0},{...item,priceCents:1.5},{...item,priceCents:null}]).skipped,4);
 assert.throws(()=>squareRetailItems(Array(251).fill(item)));
 const valid={name:'Item',category:null,sku:null,priceCents:100,taxBasisPoints:0};
 assert.equal(importedItemSchema.safeParse(valid).success,true);
 for(const change of [{name:''},{name:'x'.repeat(121)},{category:'x'.repeat(81)},{sku:'x'.repeat(81)},{priceCents:0},{taxBasisPoints:10001}])assert.equal(importedItemSchema.safeParse({...valid,...change}).success,false);
});
