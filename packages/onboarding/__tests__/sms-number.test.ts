import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedLiveSmsNumber,assignedLiveTwilioNumber,liveSmsNumber} from '../sms-number';

const live = { phoneNumber: '+12025550123', sid: 'PN' + 'a'.repeat(32), active: true, complianceStatus: 'CAMPAIGN_PENDING' };

test('shows a live number even while the campaign is pending', () => {
  assert.equal(liveSmsNumber(live), '+12025550123');
  assert.equal(liveSmsNumber({ ...live, complianceStatus: 'APPROVED' }), '+12025550123');
});

test('hides missing, inactive, and mock numbers', () => {
  for (const number of [null, undefined, { ...live, active: false }, { ...live, sid: 'PNMOCK123' }, { ...live, complianceStatus: 'MOCK_APPROVED' }, { ...live, phoneNumber: '' }]) {
    assert.equal(liveSmsNumber(number), null);
  }
});

test('avatar only displays approved active live Twilio numbers', () => {
  const approved={...live,provider:'twilio',complianceStatus:'APPROVED'};
  assert.equal(approvedLiveSmsNumber(approved),live.phoneNumber);
  for(const number of [null,{...approved,active:false},{...approved,complianceStatus:'CAMPAIGN_PENDING'},{...approved,sid:'PNMOCK123'},{...approved,sid:null},{...approved,provider:'other'}])assert.equal(approvedLiveSmsNumber(number),null);
});

test('avatar can show assigned live Twilio numbers while registration is pending', () => {
  const pending={...live,provider:'twilio'};
  assert.equal(assignedLiveTwilioNumber(pending),live.phoneNumber);
  assert.equal(assignedLiveTwilioNumber({...pending,complianceStatus:'APPROVED'}),live.phoneNumber);
  for(const number of [null,{...pending,active:false},{...pending,complianceStatus:'MOCK_PENDING'},{...pending,sid:'PNMOCK123'},{...pending,sid:null},{...pending,provider:'other'},{...pending,phoneNumber:'123'}])assert.equal(assignedLiveTwilioNumber(number),null);
});
