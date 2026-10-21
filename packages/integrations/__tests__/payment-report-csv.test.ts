import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentReportCsv} from '../payment-report-csv';
const totals={paymentCount:2,serviceCents:1000,tipCents:200,refundCents:100,netCents:1100,needsReview:1};
test('CSV exports decimal USD, applied UTC dates and a total row',()=>{
 const csv=paymentReportCsv('2026-10-01','2026-10-21',[{...totals,artistName:'Val, "Artist"'}],totals);
 assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"Val, ""Artist"""'));
 assert.ok(csv.includes('"2026-10-01","2026-10-21","USD","2"'));
 assert.ok(csv.includes('"10.00","2.00","1.00","11.00","1"'));assert.ok(csv.includes('"Total","Selected artists"'));assert.ok(csv.endsWith('\r\n'));
});
test('CSV neutralizes spreadsheet formulas and escapes multiline artist names',()=>{
 for(const name of ['=1+1','+cmd','-cmd','@SUM(A1)','  =1+1','\tformula','\nformula']){
  const csv=paymentReportCsv('2026-10-01','2026-10-21',[{...totals,artistName:name}],totals);
  assert.ok(csv.includes('"\''+name+'"'));
 }
 assert.ok(paymentReportCsv('2026-10-01','2026-10-21',[{...totals,artistName:'First\nLast'}],totals).includes('"First\nLast"'));
 assert.equal(paymentReportCsv('2026-10-01','2026-10-21',[],totals).split('\r\n').length,3);
});
