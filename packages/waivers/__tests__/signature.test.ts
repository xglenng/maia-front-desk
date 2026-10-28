import test from 'node:test';
import assert from 'node:assert/strict';
import {drawnSignature} from '../signature';
const valid={strokes:[[{x:0.1,y:0.5},{x:0.3,y:0.2},{x:0.8,y:0.6}]]};
test('drawn signatures accept bounded numeric paths and reject missing or stationary drawings',()=>{
 assert.deepEqual(drawnSignature.parse(valid),valid);
 for(const input of [null,{strokes:[]},{strokes:[[{x:0.2,y:0.2}]]},{strokes:[[{x:0.2,y:0.2},{x:0.2,y:0.2}]]},{strokes:[[{x:-1,y:0},{x:1,y:1}]]},{strokes:[[{x:0,y:0},{x:Infinity,y:1}]]},{...valid,svg:'<script/>'}])assert.equal(drawnSignature.safeParse(input).success,false);
});
test('drawn signatures enforce stroke, per-stroke and total point limits',()=>{
 assert.equal(drawnSignature.safeParse({strokes:Array(81).fill(valid.strokes[0])}).success,false);
 assert.equal(drawnSignature.safeParse({strokes:[Array(301).fill({x:0.1,y:0.2})]}).success,false);
 const stroke=Array.from({length:300},(_,i)=>({x:i%2?0.2:0.8,y:0.5}));
 assert.equal(drawnSignature.safeParse({strokes:Array(7).fill(stroke)}).success,false);
});
