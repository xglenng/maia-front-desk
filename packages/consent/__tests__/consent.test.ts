import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicHttpsUrl, campaignMessageFlow, consentDisclosure, formOptInUrl, hasBookingCommitmentIntent, helpResponse, hostedConsentState, inboundCampaignDescription, inboundConfirmationRequest, inboundConsentDecision, inboundOnlyConsentState, inboundPublicDisclosure, inboundSampleMessages, inboundSubscriptionConfirmation, isConsentFormReady, isPendingYesConfirmation, matchesScopedConsentEvidence, normalizePhone, optOutConfirmation, pendingSmsConfirmationMatches, smsKeywordAction, smsConfirmationText, tokenDigest, tokenMatches, withinInboundReplyWindow } from "..";

test("hosted consent surfaces are ready and generate an artist URL", () => {
  const form = { mode: "HOSTED", active: true, slug: "val-glenn", externalUrl: null, externalVerifiedAt: null };
  assert.equal(isConsentFormReady(form), true);
  assert.equal(formOptInUrl(form, "https://maia.example/", "studio"), "https://maia.example/book/studio/val-glenn");
});

test("external forms require explicit verification", () => {
  assert.equal(isConsentFormReady({ mode: "EXTERNAL", active: true, slug: "artist", externalUrl: "https://forms.example/1", externalVerifiedAt: null }), false);
  assert.equal(isConsentFormReady({ mode: "EXTERNAL", active: true, slug: "artist", externalUrl: "https://forms.example/1", externalVerifiedAt: new Date() }), true);
});

test("inbound SMS confirmation requires a verified public call-to-action", () => {
  const unverified = { mode: "INBOUND_SMS_CONFIRMATION", active: true, slug: "artist", publicCallToActionUrl: "https://studio.example/contact", inboundFlowVerifiedAt: null };
  assert.equal(isConsentFormReady(unverified), false);
  const verified = { ...unverified, inboundFlowVerifiedAt: new Date() };
  assert.equal(isConsentFormReady(verified), true);
  assert.equal(formOptInUrl(verified, "https://maia.example", "studio"), "https://studio.example/contact");
  const flow = campaignMessageFlow("Embellished Studios", verified.publicCallToActionUrl, verified.mode);
  assert.match(flow, /initial inbound message as affirmative/i);
  assert.match(flow, /reply YES/i);
  assert.match(flow, /START or UNSTOP/);
  assert.match(flow, /STOP response:/);
  assert.match(flow, /Maia handles HELP and always sends this support response:/);
  assert.doesNotMatch(flow, /require.*YES.*hosted/i);
  assert.match(flow, /third-party lead lists/);
});

test("two-stage campaign copy reflects booking and waiver delivery", () => {
  assert.match(inboundPublicDisclosure("Embellished Studios"), /initiating a text conversation/);
  assert.match(inboundPublicDisclosure("Embellished Studios"), /reply YES/);
  assert.match(smsConfirmationText("Embellished Studios"), /reply YES/);
  assert.match(inboundCampaignDescription("Embellished Studios"), /initiate a conversation/);
  assert.match(inboundCampaignDescription("Embellished Studios"), /START or UNSTOP/);
  assert.match(inboundSampleMessages("Embellished Studios")[1], /consent form/);
});

test("hosted checkbox itself is the affirmative event and does not require YES", () => {
  const capturedAt = new Date("2026-10-02T12:00:00Z");
  assert.deepEqual(hostedConsentState(true, capturedAt), { smsOptIn: true, smsConsentStatus: "OPTED_IN", smsConsentCapturedAt: capturedAt });
  assert.deepEqual(hostedConsentState(false, capturedAt), { smsOptIn: false, smsConsentStatus: "DECLINED", smsConsentCapturedAt: null });
  assert.equal(isPendingYesConfirmation("YES", false), false);
  assert.equal(isPendingYesConfirmation("YES", true), true);
  const flow = campaignMessageFlow("Maia Test Tattoo", "https://maia.example/book/studio/artist", "HOSTED");
  assert.match(flow, /checking the separate, optional SMS consent checkbox/i);
  assert.match(flow, /no second YES reply is required/i);
});

test("inbound confirmation keywords and copy match runtime actions", () => {
  assert.deepEqual(inboundOnlyConsentState(), { smsOptIn: false, smsConsentStatus: "INBOUND_ONLY", smsConsentCapturedAt: null });
  assert.equal(inboundConsentDecision({ action: null, mode: "INBOUND_SMS_CONFIRMATION", optedIn: false, optedOut: false, pendingConfirmation: false }), "REQUEST_YES");
  assert.equal(inboundConsentDecision({ action: null, mode: "INBOUND_SMS_CONFIRMATION", optedIn: false, optedOut: false, pendingConfirmation: true }), "WAIT_FOR_YES");
  assert.equal(inboundConsentDecision({ action: "YES", mode: "INBOUND_SMS_CONFIRMATION", optedIn: false, optedOut: false, pendingConfirmation: true }), "CONFIRM_YES");
  assert.equal(inboundConsentDecision({ action: "YES", mode: "INBOUND_SMS_CONFIRMATION", optedIn: false, optedOut: false, pendingConfirmation: false }), "REJECT_YES");
  assert.equal(inboundConsentDecision({ action: null, mode: "HOSTED", optedIn: false, optedOut: false, pendingConfirmation: false }), "CONTEXTUAL_REPLY");
  assert.equal(inboundConsentDecision({ action: null, mode: "HOSTED", optedIn: false, optedOut: true, pendingConfirmation: false }), "SUPPRESS");
  assert.equal(inboundConsentDecision({ action: "START", mode: "HOSTED", optedIn: false, optedOut: true, pendingConfirmation: false, consentSurfaceReady: false }), "REJECT_START");
  assert.equal(inboundConsentDecision({ action: "START", mode: "HOSTED", optedIn: false, optedOut: true, pendingConfirmation: false, consentSurfaceReady: true }), "START");
  assert.equal(inboundConsentDecision({ action: smsKeywordAction("UNSTOP"), mode: "HOSTED", optedIn: true, optedOut: false, pendingConfirmation: false, consentSurfaceReady: false }), "START");
  assert.equal(smsKeywordAction("START"), "START");
  assert.equal(smsKeywordAction("UNSTOP"), "START");
  assert.equal(smsKeywordAction("STOP"), "STOP");
  assert.equal(smsKeywordAction("UNSUBSCRIBE"), "STOP");
  assert.equal(smsKeywordAction("CANCEL"), "STOP");
  assert.equal(smsKeywordAction("END"), "STOP");
  assert.equal(smsKeywordAction("QUIT"), "STOP");
  assert.equal(smsKeywordAction("HELP"), "HELP");
  assert.equal(smsKeywordAction("YES"), "YES");
  assert.equal(smsKeywordAction("YES PLEASE"), null);
  assert.match(inboundConfirmationRequest("Maia Test Tattoo"), /Reply YES/);
  assert.match(inboundSubscriptionConfirmation("Maia Test Tattoo"), /You're subscribed/);
  assert.match(optOutConfirmation("Maia Test Tattoo"), /opted out/);
});

test("pending YES confirmations are bound to tenant, artist, client, form, phones, and expiry", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  const pending = { status: "PENDING", organizationId: "org-1", artistId: "artist-1", clientId: "client-1", consentFormId: "form-1", phone: "+15555550100", studioPhone: "+15555550199", expiresAt: "2026-10-02T12:15:00Z" };
  const scope = { organizationId: "org-1", artistId: "artist-1", clientId: "client-1", consentFormId: "form-1", phone: "+15555550100", studioPhone: "+15555550199" };
  assert.equal(pendingSmsConfirmationMatches(pending, scope, now), true);
  assert.equal(pendingSmsConfirmationMatches(pending, { ...scope, artistId: "artist-2" }, now), false);
  assert.equal(pendingSmsConfirmationMatches(pending, { ...scope, phone: "+15555550200" }, now), false);
  assert.equal(pendingSmsConfirmationMatches({ ...pending, expiresAt: "2026-10-02T11:00:00Z" }, scope, now), false);
});

test("affirmative evidence only authorizes its exact organization, artist, client, and phone", () => {
  const evidence = { consented: true, organizationId: "org-1", artistId: "artist-1", clientId: "client-1", phone: "+15555550100" };
  const scope = { organizationId: "org-1", artistId: "artist-1", clientId: "client-1", phone: "+15555550100" };
  assert.equal(matchesScopedConsentEvidence(evidence, scope), true);
  assert.equal(matchesScopedConsentEvidence(evidence, { ...scope, organizationId: "org-2" }), false);
  assert.equal(matchesScopedConsentEvidence(evidence, { ...scope, artistId: "artist-2" }), false);
  assert.equal(matchesScopedConsentEvidence(evidence, { ...scope, phone: "+15555550200" }), false);
  assert.equal(matchesScopedConsentEvidence({ ...evidence, consented: false }, scope), false);
});

test("HELP selects a deterministic tenant support contact", () => {
  assert.equal(helpResponse("Maia Test Tattoo", { email: "support@example.com", website: "https://studio.example", phone: "+15555550100" }), "Maia Test Tattoo: For help with your appointment, contact us at support@example.com. Reply STOP to opt out.");
  assert.match(helpResponse("Maia Test Tattoo", { website: "https://studio.example", phone: "+15555550100" }), /visit https:\/\/studio\.example/);
  assert.match(helpResponse("Maia Test Tattoo", { phone: "+15555550100" }), /call or text \+15555550100/);
});

test("public URL validator accepts public HTTPS and rejects local or insecure URLs", () => {
  assert.equal(assertPublicHttpsUrl("https://studio.example.com/legal/privacy"), "https://studio.example.com/legal/privacy");
  for (const url of ["http://localhost", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://192.168.1.5", "https://studio.local"]) {
    assert.throws(() => assertPublicHttpsUrl(url), url);
  }
});

test("booking commitment intent avoids interrupting ordinary questions", () => {
  assert.equal(hasBookingCommitmentIntent("How much would an appointment cost?"), false);
  assert.equal(hasBookingCommitmentIntent("I am ready to book"), true);
  assert.equal(hasBookingCommitmentIntent("Send me the deposit link"), true);
});

test("inbound-only customer care replies are limited to a recent inbound message", () => {
  const now = new Date("2026-09-21T18:00:00Z");
  assert.equal(withinInboundReplyWindow("2026-09-21T17:30:00Z", now), true);
  assert.equal(withinInboundReplyWindow("2026-09-20T16:00:00Z", now), false);
  assert.equal(withinInboundReplyWindow(null, now), false);
});

test("disclosure and campaign evidence include carrier review essentials", () => {
  const disclosure = consentDisclosure("Embellished Studios");
  assert.match(disclosure, /Message frequency varies/);
  assert.match(disclosure, /STOP/);
  assert.match(disclosure, /Consent is not a condition of purchase/);
  const flow = campaignMessageFlow("Embellished Studios", "https://example.com/book");
  assert.match(flow, /unchecked by default/);
  assert.match(flow, /without checking/);
  assert.match(flow, /https:\/\/example.com\/book/);
});

test("phone normalization and external tokens are deterministic", () => {
  assert.equal(normalizePhone("(435) 555-1212"), "+14355551212");
  const digest = tokenDigest("secret");
  assert.equal(tokenMatches("secret", digest), true);
  assert.equal(tokenMatches("wrong", digest), false);
});
