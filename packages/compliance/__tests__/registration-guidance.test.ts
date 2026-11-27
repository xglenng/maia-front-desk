import assert from "node:assert/strict";
import test from "node:test";
import { registrationStatus, registrationDiagnostic } from "../registration-guidance";

test("pending SMS registration identifies the current stage and next action", () => {
  const readiness = { ready: true, missing: [], completed: 1, total: 1 };
  const stages = [
    ["A2P_PROFILE_PENDING", "Messaging profile in review", /submit your A2P Brand/],
    ["BRAND_PENDING", "A2P Brand in review", /submit your Campaign/],
    ["CAMPAIGN_PENDING", "SMS Campaign in review", /check for approval/],
  ] as const;

  for (const [status, title, nextAction] of stages) {
    const result = registrationStatus({ status, readiness, customerProfileStatus: "TWILIO_APPROVED" });
    assert.equal(result.title, title);
    assert.match(result.detail, /Sync Twilio status/);
    assert.match(result.detail, nextAction);
  }
});

test("business approval calls for submission and explains why texting is off", () => {
  const result = registrationStatus({
    status: "CUSTOMER_PROFILE_PENDING",
    readiness: { ready: true },
    customerProfileStatus: "TWILIO_APPROVED",
  });
  assert.equal(result.title, "Action required to enable texting");
  assert.equal(result.actionLabel, "Continue SMS registration");
  assert.match(result.detail, /Texting is off.*submit your A2P Messaging Profile/);
});

test('failed API requests are distinguished from provider rejection',()=>{
 const failure=registrationStatus({status:'SUBMISSION_ERROR',readiness:{ready:true}});
 assert.equal(failure.title,'Registration sync failed');assert.match(failure.detail,/does not mean Twilio rejected/);
 const rejection=registrationStatus({status:'CAMPAIGN_REJECTED',readiness:{ready:true}});
 assert.equal(rejection.title,'Registration needs attention');
});

test('saved error reasons remain actionable without exposing token-like values',()=>{
 assert.equal(registrationDiagnostic('Unable to process JSON'),'Unable to process JSON');
 const result=registrationDiagnostic('AuthToken=synthetic-secret-value Basic c3ludGhldGljOnRva2Vu Account AC'+ 'a'.repeat(32));
 assert.doesNotMatch(result,/synthetic-secret-value|c3ludGhldGlj|ACa{32}/);
 assert.equal(registrationDiagnostic(null),'');assert.ok(registrationDiagnostic('x '.repeat(1000)).length<=800);
});
