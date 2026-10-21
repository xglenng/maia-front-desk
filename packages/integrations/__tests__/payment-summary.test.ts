import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentSummary} from '../payment-summary';
test('summary separates received money, successful refunds and remaining price',()=>{
 assert.deepEqual(paymentSummary(400,[{status:'PAID',amountCents:100,refundedCents:0},{status:'REFUNDED',amountCents:300,refundedCents:300}]),{totalCents:400,receivedCents:400,refundedCents:300,retainedCents:100,remainingCents:300,needsReview:false});
});
test('pending charges and failed attempts are not paid; pending refunds are not returned money',()=>{
 const summary=paymentSummary(400,[{status:'EXPIRED',amountCents:400,refundedCents:0},{status:'PENDING',amountCents:400,refundedCents:0},{status:'REFUND_PENDING',amountCents:100,refundedCents:0}]);
 assert.equal(summary.retainedCents,100);assert.equal(summary.remainingCents,300);assert.equal(summary.needsReview,true);
});
test('partial refunds and unknown prices remain explicit',()=>{
 const summary=paymentSummary(null,[{status:'REFUND_REVIEW',amountCents:400,refundedCents:125}]);
 assert.equal(summary.refundedCents,125);assert.equal(summary.retainedCents,275);assert.equal(summary.remainingCents,null);assert.equal(summary.needsReview,true);
});
