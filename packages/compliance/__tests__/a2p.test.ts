import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registrationReadiness, type A2pRegistrationInput } from "../a2p";
import { assertCampaignPublicUrls, campaignPreview } from "../campaign";
import { createCampaign } from "@integrations/twilio-compliance";
import { isInboundPhoneRoutable } from "@integrations/twilio-routing";

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

test("campaign preview preserves saved standard copy and generates per-mode consent defaults", () => {
  const profile = {
    businessName: "Maia Test Tattoo", campaignDescription: "Saved description for this studio.",
    sampleMessages: ["Saved sample one.", "Saved sample two."], campaignUseCase: "CUSTOMER_CARE",
    hasEmbeddedLinks: false, hasEmbeddedPhoneNumbers: true, contactEmail: "support@example.com", contactPhone: "+15555550100",
    websiteUrl: "https://studio.example.com", privacyPolicyUrl: "https://studio.example.com/privacy",
    termsUrl: "https://studio.example.com/terms"
  };
  const hosted = campaignPreview(profile, { mode: "HOSTED", publicUrl: "https://maia.example.com/book/studio/artist" });
  assert.equal(hosted.description, profile.campaignDescription);
  assert.deepEqual(hosted.samples, profile.sampleMessages);
  assert.deepEqual(hosted.optInKeywords, ["START", "UNSTOP"]);
  assert.equal(hosted.optInKeywords.includes("YES"), false);
  const generated = campaignPreview({ ...profile, campaignDescription: null, sampleMessages: null }, { mode: "HOSTED", publicUrl: "https://maia.example.com/book/studio/artist" });
  assert.match(generated.description, /checked box records consent; a second YES reply is not required/i);
  assert.equal(generated.samples.length, 2);
  assert.match(generated.samples[0], /Reply STOP to opt out or HELP for help/);
  assert.match(hosted.messageFlow, /no second YES reply is required/i);
  assert.match(hosted.messageFlow, /support@example\.com/);
  assert.doesNotMatch(hosted.messageFlow, /Disable or match Twilio's automatic HELP reply/);
  assert.equal(hosted.hasEmbeddedLinks, false);
  assert.equal(hosted.hasEmbeddedPhone, true);
  assert.match(hosted.helpMessage, /support@example.com/);
  const phoneHelp = campaignPreview({ ...profile, contactEmail: null, websiteUrl: null }, { mode: "HOSTED", publicUrl: "https://maia.example.com/book/studio/artist" });
  assert.match(phoneHelp.helpMessage, /\+15555550100/);
  assert.equal(phoneHelp.hasEmbeddedPhone, true);
  const websiteHelp = campaignPreview({ ...profile, contactEmail: null }, { mode: "HOSTED", publicUrl: "https://maia.example.com/book/studio/artist" });
  assert.match(websiteHelp.helpMessage, /https:\/\/studio\.example\.com/);
  assert.equal(websiteHelp.hasEmbeddedLinks, true);

  const inbound = campaignPreview(profile, { mode: "INBOUND_SMS_CONFIRMATION", publicUrl: "https://studio.example.com/contact" });
  assert.match(inbound.description, /does not treat the initial inbound message as subscription consent/i);
  assert.match(inbound.samples[0], /Reply YES/);
  assert.deepEqual(inbound.optInKeywords, ["YES", "START", "UNSTOP"]);
  assert.equal(inbound.hasEmbeddedLinks, true);
  assert.match(inbound.messageFlow, /https:\/\/studio\.example\.com\/contact/);
  assert.match(inbound.messageFlow, /support@example\.com/);
  assert.doesNotMatch(inbound.messageFlow, /Disable or match Twilio's automatic HELP reply/);
});

test("hosted campaign readiness uses effective preview when legacy campaign columns are blank or stale", () => {
  const profile: A2pRegistrationInput = {
    businessName: "Maia Test Tattoo", businessAddress: "1 Main St, Anytown, CA 90000",
    websiteUrl: "https://studio.example.com", contactEmail: "support@example.com",
    privacyPolicyUrl: "https://studio.example.com/privacy", termsUrl: "https://studio.example.com/terms",
    legalPagesAcceptedAt: new Date(), businessType: "LLC", businessRegistrationNumberEncrypted: "encrypted-ein",
    contactFirstName: "Maia", contactLastName: "Owner", contactPhone: "+15555550100",
    representativeBusinessTitle: "Owner", representativeJobPosition: "Other", addressLine1: "1 Main St",
    city: "Anytown", region: "CA", postalCode: "90000", industry: "CONSUMER",
    campaignUseCase: null, campaignDescription: null, messageFlow: null, sampleMessages: [],
    optInKeywords: ["START", "YES"], helpMessage: null, optOutMessage: "Old custom STOP reply",
    subscriberOptIn: true
  };
  const preview = campaignPreview({
    businessName: profile.businessName!, campaignDescription: profile.campaignDescription,
    sampleMessages: profile.sampleMessages, campaignUseCase: profile.campaignUseCase,
    contactEmail: profile.contactEmail, contactPhone: profile.contactPhone, websiteUrl: profile.websiteUrl,
    privacyPolicyUrl: profile.privacyPolicyUrl, termsUrl: profile.termsUrl,
  }, { mode: "HOSTED", publicUrl: "https://maia.example.com/book/maia-test-tattoo/atest" });
  const readiness = registrationReadiness(profile, preview, true);
  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.missing, []);
  assert.deepEqual(preview.optInKeywords, ["START", "UNSTOP"]);
  assert.doesNotMatch(preview.messageFlow, /text YES/i);
});

test("effective campaign copy does not hide missing business identity or address fields", () => {
  const profile: A2pRegistrationInput = {
    businessName: "Maia Test Tattoo", businessAddress: "", websiteUrl: "https://studio.example.com",
    contactEmail: "support@example.com", privacyPolicyUrl: "https://studio.example.com/privacy",
    termsUrl: "https://studio.example.com/terms", legalPagesAcceptedAt: new Date(), businessType: null,
    businessRegistrationNumberEncrypted: null, contactFirstName: "Maia", contactLastName: "Owner",
    contactPhone: "+15555550100", representativeBusinessTitle: null, representativeJobPosition: null,
    addressLine1: null, city: null, region: null, postalCode: null, industry: "CONSUMER",
    campaignUseCase: null, campaignDescription: null, messageFlow: null, sampleMessages: [],
    optInKeywords: [], helpMessage: null, optOutMessage: null, subscriberOptIn: true
  };
  const preview = campaignPreview({
    businessName: profile.businessName!, websiteUrl: profile.websiteUrl, contactEmail: profile.contactEmail,
    privacyPolicyUrl: profile.privacyPolicyUrl, termsUrl: profile.termsUrl,
  }, { mode: "HOSTED", publicUrl: "https://maia.example.com/book/maia-test-tattoo/atest" });
  const readiness = registrationReadiness(profile, preview, true);
  assert.equal(readiness.ready, false);
  for (const missing of ["Business type", "EIN or business registration number", "Authorized representative title", "Authorized representative job position", "Street address", "City", "State / region", "Postal code"]) {
    assert.ok(readiness.missing.includes(missing), `${missing} remains required`);
  }
});

test("campaign submission validates every referenced URL together", () => {
  const profile = { businessName: "Studio", websiteUrl: "https://studio.example.com", privacyPolicyUrl: "https://studio.example.com/privacy", termsUrl: "https://studio.example.com/terms" };
  assert.doesNotThrow(() => assertCampaignPublicUrls(profile, "https://studio.example.com/book", "https://maia.example.com"));
  for (const value of ["http://localhost", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://192.168.1.2"]) {
    assert.throws(() => assertCampaignPublicUrls({ ...profile, websiteUrl: value }, "https://studio.example.com/book", "https://maia.example.com"));
    assert.throws(() => assertCampaignPublicUrls(profile, value, "https://maia.example.com"));
  }
  assert.throws(() => assertCampaignPublicUrls(profile, "https://studio.example.com/book", "http://localhost:3000"));
});

test("createCampaign sends the exact previewed fields and public consent URL", async t => {
  const profile = {
    businessName: "Maia Test Tattoo", campaignDescription: "Saved description for this studio.",
    sampleMessages: ["Sample one with STOP instructions.", "Sample two with HELP instructions."],
    campaignUseCase: "CUSTOMER_CARE", hasEmbeddedLinks: true, hasEmbeddedPhoneNumbers: false,
    contactEmail: "support@example.com", websiteUrl: "https://studio.example.com",
    privacyPolicyUrl: "https://studio.example.com/privacy", termsUrl: "https://studio.example.com/terms"
  };
  const preview = campaignPreview(profile, { mode: "HOSTED", publicUrl: "https://maia.example.com/book/studio/artist" });
  let requestUrl = "";
  let form = new URLSearchParams();
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    form = new URLSearchParams(String(init?.body || ""));
    return new Response(JSON.stringify({ sid: "QE_TEST" }), { status: 201, headers: { "Content-Type": "application/json" } });
  });
  await createCampaign({ accountSid: "AC_TEST", authToken: "test-token" }, {
    serviceSid: "MG_TEST", brandSid: "BN_TEST", description: preview.description,
    messageFlow: preview.messageFlow, samples: preview.samples, useCase: preview.useCase,
    hasLinks: preview.hasEmbeddedLinks, hasPhoneNumbers: preview.hasEmbeddedPhone,
    privacyUrl: preview.privacyUrl, termsUrl: preview.termsUrl
  });

  assert.equal(requestUrl, "https://messaging.twilio.com/v1/Services/MG_TEST/Compliance/Usa2p");
  assert.deepEqual(Object.fromEntries(form), {
    BrandRegistrationSid: "BN_TEST",
    Description: preview.description,
    MessageFlow: preview.messageFlow,
    UsAppToPersonUsecase: "CUSTOMER_CARE",
    HasEmbeddedLinks: "true",
    HasEmbeddedPhone: "false",
    PrivacyPolicyUrl: "https://studio.example.com/privacy",
    TermsAndConditionsUrl: "https://studio.example.com/terms",
    "MessageSamples[0]": preview.samples[0],
    "MessageSamples[1]": preview.samples[1]
  });
  assert.match(form.get("MessageFlow") || "", /https:\/\/maia\.example\.com\/book\/studio\/artist/);
});

test("registration API is authoritative and the client only renders its campaign preview", () => {
  const api = readFileSync("app/api/compliance/registration/route.ts", "utf8");
  const page = readFileSync("app/compliance/registration/page.tsx", "utf8");
  const live = readFileSync("packages/compliance/live-registration.ts", "utf8");
  assert.match(api, /campaignPreview\(campaignProfile/);
  assert.match(api, /messageFlow: campaign\?\.messageFlow.*campaign \}/);
  assert.match(api, /campaignUseCase: campaign\.useCase/);
  assert.match(api, /registrationReadiness\(profile, consentForms\.rows\[0\]\?\.campaign, consentForms\.ready\)/);
  assert.match(page, /const campaign = item\.campaign/);
  assert.doesNotMatch(page, /campaignPreview|packages\/compliance\/campaign|packages\/consent/);
  assert.match(page, /sample1: data\.profile\.sampleMessages\?\.\[0\]/);
  assert.match(live, /campaignPreview\(profile/);
  assert.ok(live.indexOf("assertCampaignPublicUrls(profile, optInUrl, appBaseUrl())") < live.indexOf("createCampaign(resource.credentials"));
});

test("HELP is handled before AI and hosted checkbox evidence is recorded directly", () => {
  const inbound = readFileSync("app/api/twilio/inbound/route.ts", "utf8");
  const booking = readFileSync("app/api/public/booking-inquiries/route.ts", "utf8");
  assert.ok(inbound.indexOf("if (action === 'HELP')") < inbound.indexOf("await runAi("));
  assert.match(inbound, /helpResponse\(surface\?\.organization\.name/);
  assert.match(inbound, /source: 'INBOUND_SMS_CONFIRMATION'/);
  assert.match(inbound, /pendingSmsConfirmationMatches\(pending\.confirmation, scope\)/);
  assert.match(inbound, /OptOutType/);
  assert.match(inbound, /decision === 'SUPPRESS'\) return xmlResponse\(\)/);
  assert.match(booking, /consented: input\.smsConsent/);
  assert.match(booking, /source: "HOSTED_WEB_FORM"/);
  assert.match(booking, /hostedConsentState\(input\.smsConsent, now\)/);
  assert.match(booking, /ipAddress: request\.headers/);
  assert.match(booking, /userAgent: request\.headers/);
  const studioSms = readFileSync("packages/integrations/studio-sms.ts", "utf8");
  assert.match(studioSms, /!client\?\.smsOptIn/);
});

test("inbound routing accepts mapped pending temporary Twilio numbers without enabling outbound", () => {
  const pending = { provider: "twilio", organizationId: "org-1", artistId: "artist-1", lifecycleRole: "TEMPORARY", retireAfter: null, active: false, complianceStatus: "NOT_REGISTERED" };
  assert.equal(isInboundPhoneRoutable(pending), true);
  const sendRoute = readFileSync("app/api/twilio/send/route.ts", "utf8");
  assert.match(sendRoute, /!number\.active \|\| !\["APPROVED", "MOCK_APPROVED"\]/);
});

test("inbound routing rejects unknown, unmapped, expired, and retired numbers", () => {
  assert.equal(isInboundPhoneRoutable(undefined), false);
  assert.equal(isInboundPhoneRoutable({ provider: "twilio", organizationId: "org-1", artistId: null, lifecycleRole: "TEMPORARY", retireAfter: null }), false);
  assert.equal(isInboundPhoneRoutable({ provider: "twilio", organizationId: "org-1", artistId: "artist-1", lifecycleRole: "TEMPORARY_GRACE", retireAfter: new Date("2026-10-05T00:00:00Z") }, new Date("2026-10-06T00:00:00Z")), false);
  for (const lifecycleRole of ["RETIRED", "RELEASED", "DEPROVISIONED", "UNKNOWN"]) {
    assert.equal(isInboundPhoneRoutable({ provider: "twilio", organizationId: "org-1", artistId: "artist-1", lifecycleRole, retireAfter: null }), false);
  }
});

test("mapped pending numbers reach HELP without an inbound active filter or outbound bypass", () => {
  const inbound = readFileSync("app/api/twilio/inbound/route.ts", "utf8");
  assert.match(inbound, /isInboundPhoneRoutable\(\{ provider: number\.provider/);
  assert.match(inbound, /innerJoin\(artists, and\(eq\(artists\.id, phoneNumbers\.artistId\), eq\(artists\.organizationId, phoneNumbers\.organizationId\)\)\)/);
  assert.match(inbound, /innerJoin\(organizations, eq\(organizations\.id, phoneNumbers\.organizationId\)\)/);
  const lookup = inbound.slice(inbound.indexOf("const [mapping]"), inbound.indexOf("if (!mapping)"));
  assert.doesNotMatch(lookup, /phoneNumbers\.active/);
  assert.match(inbound, /if \(action === 'HELP'\)/);
  assert.match(inbound, /await recordOutbound\(conv\.id, from, to, body/);
  assert.match(inbound, /outbound_reply_attempted/);
  assert.match(inbound, /outbound_reply_failed/);
  assert.match(inbound, /outbound_reply_succeeded/);
  const sendRoute = readFileSync("app/api/twilio/send/route.ts", "utf8");
  assert.match(sendRoute, /!number\.active \|\| !\["APPROVED", "MOCK_APPROVED"\]/);
  const studioSms = readFileSync("packages/integrations/studio-sms.ts", "utf8");
  assert.match(studioSms, /!\["APPROVED", "MOCK_APPROVED"\]/);
});
