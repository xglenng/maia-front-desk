import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NumberConfirmation } from '../../../components/sms/number-confirmation';
const render=(complianceStatus:string)=>renderToStaticMarkup(createElement(NumberConfirmation,{artistName:'Val',phoneNumber:'+14352467806',complianceStatus}));
test('saved unregistered number shows durable confirmation and the required registration step',()=>{
 const html=render('NOT_REGISTERED');assert.match(html,/Val’s business number is set up/);assert.match(html,/\(435\) 246-7806/);
 assert.match(html,/texting is not active yet/);assert.match(html,/href="\/compliance"/);assert.match(html,/Next: complete SMS registration/);
});
test('approved registration moves to consent while mocks never claim live readiness',()=>{
 const approved=render('APPROVED');assert.match(approved,/Messaging registration is approved/);assert.match(approved,/href="\/settings\/sms\?tab=consent"/);
 const mock=render('MOCK_APPROVED');assert.match(mock,/Test number only/);assert.match(mock,/cannot send or receive real messages/);assert.doesNotMatch(mock,/Messaging registration is approved/);
});
