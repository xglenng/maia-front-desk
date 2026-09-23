import test from "node:test";
import assert from "node:assert/strict";
import { buildActivationPlan, registrationStatus } from "../activation";
import { isE164PhoneNumber, mockPhoneNumber } from "../../integrations/mock-twilio";

const base = {
  profileReady: true,
  legalPagesReady: true,
  consentFormReady: true,
  phoneReady: true,
  complianceStatus: "APPROVED",
  numberStrategy: "TEMPORARY" as const,
  inboundSmsTested: true,
  outboundSmsTested: true,
  voiceTested: false,
  activated: false
};

test("temporary-number activation does not require a voice test", () => {
  const plan = buildActivationPlan(base);
  assert.equal(plan.readyToActivate, true);
  assert.deepEqual(plan.missing, []);
});

test("ported-number activation requires voice forwarding verification", () => {
  const plan = buildActivationPlan({ ...base, numberStrategy: "PORT_EXISTING" });
  assert.equal(plan.readyToActivate, false);
  assert.deepEqual(plan.missing, ["Communication tests"]);
  assert.equal(plan.steps.find(step => step.id === "testing")?.status, "IN_PROGRESS");
});

test("carrier rejection is shown as action required and blocks activation", () => {
  const plan = buildActivationPlan({ ...base, complianceStatus: "BRAND_REJECTED" });
  assert.equal(plan.readyToActivate, false);
  assert.equal(plan.steps.find(step => step.id === "registration")?.status, "ACTION_REQUIRED");
});

test("missing public consent evidence blocks activation", () => {
  const plan = buildActivationPlan({ ...base, consentFormReady: false });
  assert.equal(plan.readyToActivate, false);
  assert.deepEqual(plan.missing, ["Verified SMS consent workflow"]);
});

test("carrier review is shown as pending approval", () => {
  assert.equal(registrationStatus("CAMPAIGN_PENDING"), "PENDING_APPROVAL");
  assert.equal(registrationStatus("MOCK_APPROVED"), "APPROVED");
});

test("activation is the final completed step after go-live", () => {
  const plan = buildActivationPlan({ ...base, activated: true });
  assert.equal(plan.completed, plan.total);
  assert.equal(plan.steps.at(-1)?.status, "APPROVED");
});

test("mock Twilio numbers are deterministic digits-only E.164 values", () => {
  const artistId = "9c4eadb8-715e-4abc-8def-1234567890ab";
  const first = mockPhoneNumber(artistId);
  assert.equal(first, mockPhoneNumber(artistId));
  assert.equal(isE164PhoneNumber(first), true);
  assert.match(first, /^\+1555\d{7}$/);
  assert.doesNotMatch(first, /[a-z]/i);
});
