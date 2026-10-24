import test from 'node:test';
import assert from 'node:assert/strict';
import {cartSchema,priceCart,type CatalogEntry} from '../../checkout/cart';
const artistId='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
const catalog:CatalogEntry[]=[{id:artistId,kind:'ITEM',name:'Aftercare',priceCents:1001,category:null,taxBasisPoints:825},{id:requestId,kind:'SERVICE',name:'Consultation',priceCents:null,category:null,taxBasisPoints:0}];
test('checkout derives fixed prices and tax from catalog, supports variable prices and tips',()=>{
 const input=cartSchema.parse({artistId,requestId,tender:'CASH',tipCents:200,lines:[{kind:'ITEM',id:artistId,quantity:2,customPriceCents:1},{kind:'SERVICE',id:requestId,quantity:1,customPriceCents:5000}]});
 const priced=priceCart(input,catalog);assert.equal(priced.subtotalCents,7002);assert.equal(priced.taxCents,165);assert.equal(priced.totalCents,7367);assert.equal(priced.lines[0].name,'Aftercare');
});
test('checkout rejects unavailable items, missing variable price, excessive totals and invalid tender or quantities',()=>{
 const base={artistId,requestId,tender:'CASH',lines:[{kind:'ITEM',id:artistId,quantity:1}]};
 assert.throws(()=>priceCart(cartSchema.parse(base),[]),/unavailable/);
 assert.throws(()=>priceCart(cartSchema.parse({...base,lines:[{kind:'SERVICE',id:requestId,quantity:1}]}),catalog),/price/);
 assert.throws(()=>priceCart(cartSchema.parse({...base,lines:[{kind:'CUSTOM',customName:'Custom',customPriceCents:100000000,quantity:2}]}),catalog),/exceeds/);
 for(const change of [{tender:'CARD'},{tipCents:-1},{lines:[]},{lines:[{kind:'ITEM',id:artistId,quantity:0}]}])assert.equal(cartSchema.safeParse({...base,...change}).success,false);
});
