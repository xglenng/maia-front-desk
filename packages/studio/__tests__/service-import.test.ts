import test from 'node:test';
import assert from 'node:assert/strict';
import { parseServiceCsv, serviceImportKey } from '../service-import';

test('service CSV accepts quoted commas, escaped quotes, multiline descriptions, BOM and CRLF', () => {
  const [row] = parseServiceCsv('\uFEFFName,Duration Minutes,Price,Description\r\n"Consultation, tattoo",60,100.25,"Bring ""references""\nand ideas"\r\n');
  assert.deepEqual(row.errors, []);
  assert.equal(row.service.name, 'Consultation, tattoo');
  assert.equal(row.service.basePriceCents, 10025);
  assert.equal(row.service.description, 'Bring "references"\nand ideas');
});
test('variable prices need explicit quote pricing and hourly rates preserve cents', () => {
  const rows = parseServiceCsv('Name,Duration,Pricing Type,Price\nTattoo,60,QUOTE,\nSession,90,HOURLY,150.50');
  assert.ok(rows.every(row => row.errors.length === 0));
  assert.equal(rows[0].service.basePriceCents, null);
  assert.equal(rows[0].service.requiresArtistApproval, true);
  assert.equal(rows[1].service.hourlyRateCents, 15050);
  assert.ok(parseServiceCsv('Name,Duration,Price\nUnknown,60,')[0].errors.length);
});
test('rejects invalid rows, unsupported currencies, ambiguous headers and malformed files', () => {
  for (const csv of ['Name,Duration,Price\nTest,0,10','Name,Duration,Price\nTest,60,-10','Name,Duration,Price,Currency\nTest,60,10,EUR','Name,Duration,Price\nTest,60,1.005','Name,Duration,Price\nTest,60,10,extra']) assert.ok(parseServiceCsv(csv)[0].errors.length);
  for (const csv of ['Name,Price\nTest,10','Name,Duration,Duration\nTest,60,60','Name,Duration,Price\n"unclosed,60,10','x'.repeat(1_000_001)]) assert.throws(() => parseServiceCsv(csv));
});
test('duplicates use normalized type and name, never a spreadsheet identifier', () => {
  const rows = parseServiceCsv('Name,Service Type,Duration,Price\nConsult,TATTOO,30,50\n consult ,tattoo,60,100');
  assert.ok(rows[1].errors.some(error => error.includes('Duplicate')));
  assert.equal(serviceImportKey(rows[0].service), serviceImportKey(rows[1].service));
});
test('handles a 30-service studio and bounds bulk uploads', () => {
  const csv = (count: number) => 'Name,Duration,Price\n' + Array.from({ length: count }, (_, i) => `Service ${i},30,50`).join('\n');
  assert.equal(parseServiceCsv(csv(30)).length, 30);
  assert.throws(() => parseServiceCsv(csv(251)));
});
