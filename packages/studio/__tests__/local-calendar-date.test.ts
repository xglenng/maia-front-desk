import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localCalendarDate} from '../local-calendar-date';
test('date picker maximum follows the local day rather than the UTC day',()=>{
 const original=process.env.TZ;
 try{
  process.env.TZ='America/Denver';
  const evening=new Date('2026-11-27T02:30:00Z');
  assert.equal(evening.toISOString().slice(0,10),'2026-11-27');
  assert.equal(localCalendarDate(evening),'2026-11-26');
  process.env.TZ='Pacific/Auckland';
  assert.equal(localCalendarDate(new Date('2026-11-26T13:30:00Z')),'2026-11-27');
 }finally{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
});
