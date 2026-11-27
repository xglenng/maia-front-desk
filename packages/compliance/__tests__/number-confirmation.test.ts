import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NumberConfirmation } from '../../../components/sms/number-confirmation';
const render=(complianceStatus:string)=>renderToStaticMarkup(createElement(NumberConfirmation,{artistName:'Val',phoneNumber:'+14352467806',complianceStatus}));
test('saved unregistered number shows durable confirmation and the required registration step',()=>{
 const html=render('NOT_REGISTERED');assert.match(html,/Val’s business number is set up/);assert.match(html,/\(435\) 246-7806/);
 assert.match(html,/texting is not active yet/);assert.match(html,/href="\/settings\/sms\?tab=campaign"/);assert.match(html,/Next: complete SMS registration/);
});
test('approved registration moves to consent while mocks never claim live readiness',()=>{
 const approved=render('APPROVED');assert.match(approved,/Messaging registration is approved/);assert.match(approved,/href="\/settings\/sms\?tab=consent"/);
 const mock=render('MOCK_APPROVED');assert.match(mock,/Test number only/);assert.match(mock,/cannot send or receive real messages/);assert.doesNotMatch(mock,/Messaging registration is approved/);
});

test('toll-free confirmation sends users to verification without claiming texting is active',()=>{
 const html=renderToStaticMarkup(createElement(NumberConfirmation,{artistName:'Test Artist',phoneNumber:'+18885550123',complianceStatus:'TOLL_FREE_NOT_SUBMITTED'}));
 assert.match(html,/Submit toll-free verification/);assert.match(html,/texting stays off until approval/);assert.match(html,/tab=campaign/);
});
