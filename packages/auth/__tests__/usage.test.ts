import test from 'node:test';
import assert from 'node:assert/strict';
import { platformAdmin, smsSegments, modelCost, monthRange } from '../../usage/metrics';

test('platform permissions require exact explicit IDs', () => {
  assert.equal(platformAdmin('owner',''),false);
  assert.equal(platformAdmin('owner','other-owner'),false);
  assert.equal(platformAdmin('owner',' other, owner '),true);
});
test('SMS estimates account for multipart, GSM extensions, and UTF16',()=>{
  assert.equal(smsSegments('a'.repeat(160)),1);
  assert.equal(smsSegments('a'.repeat(161)),2);
  assert.equal(smsSegments('^'.repeat(81)),2);
  assert.equal(smsSegments('界'.repeat(70)),1);
  assert.equal(smsSegments('界'.repeat(71)),2);
  assert.equal(smsSegments('😀'.repeat(36)),2);
  assert.equal(smsSegments(''),0);
});
test('cost rates must exist and be valid; never silently treat unknown rates as free',()=>{
  assert.equal(modelCost('test',100,100,'{}'),null);
  assert.equal(modelCost('test',100,100,'broken'),null);
  assert.equal(modelCost('test',100,100,'{"test":{"input":-1,"output":1}}'),null);
  assert.equal(modelCost('test',1_000_000,500_000,'{"test":{"input":1,"output":4}}'),3);
});
test('UTC month ranges handle year boundaries and reject invalid input',()=>{
  assert.equal(monthRange('2026-12').end.toISOString(),'2027-01-01T00:00:00.000Z');
  assert.throws(()=>monthRange('2026-13'));
  assert.throws(()=>monthRange('2026-1'));
});
