import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentReportRange} from '../payment-report-range';
test('payment report uses inclusive UTC dates and an exclusive next-day boundary',()=>{
 const range=paymentReportRange('2026-10-01','2026-10-21');
 assert.equal(range.from.toISOString(),'2026-10-01T00:00:00.000Z');assert.equal(range.until.toISOString(),'2026-10-22T00:00:00.000Z');
});
test('payment report rejects invalid, reversed and unbounded ranges',()=>{
 for(const [start,end] of [['2026-02-30','2026-03-01'],['2026-10-22','2026-10-21'],['2020-01-01','2026-10-21'],['bad','2026-10-21']])assert.throws(()=>paymentReportRange(start,end));
});
