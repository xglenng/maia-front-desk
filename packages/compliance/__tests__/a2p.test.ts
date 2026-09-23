import test from "node:test";
import assert from "node:assert/strict";
import { registrationReadiness } from "../a2p";

test("registration readiness identifies missing campaign data", () => {
  const result = registrationReadiness({ businessName: "Studio", subscriberOptIn: false });
  assert.equal(result.ready, false);
  assert.ok(result.missing.includes("Published Privacy Policy"));
  assert.ok(result.missing.includes("At least two sample messages"));
  assert.ok(result.missing.includes("Subscriber opt-in confirmation"));
});

test("registration readiness accepts a complete profile", () => {
  const value = "configured";
  const result = registrationReadiness({
    businessName: value, businessAddress: value, websiteUrl: value, contactEmail: value,
    privacyPolicyUrl: value, termsUrl: value, legalPagesAcceptedAt: new Date(), businessType: value,
    businessRegistrationNumberEncrypted: value, contactFirstName: value, contactLastName: value,
    contactPhone: value, representativeBusinessTitle: value, representativeJobPosition: value,
    addressLine1: value, city: value, region: value, postalCode: value,
    industry: value, campaignUseCase: value, campaignDescription: value,
    messageFlow: value, sampleMessages: ["one", "two"], optInKeywords: ["START"],
    helpMessage: value, optOutMessage: value, subscriberOptIn: true, consentFormReady: true
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.missing, []);
});
