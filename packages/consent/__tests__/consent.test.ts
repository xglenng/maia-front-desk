import test from "node:test";
import assert from "node:assert/strict";
import { campaignMessageFlow, consentDisclosure, formOptInUrl, hasBookingCommitmentIntent, inboundCampaignDescription, inboundPublicDisclosure, inboundSampleMessages, isConsentFormReady, normalizePhone, smsConfirmationText, tokenDigest, tokenMatches, withinInboundReplyWindow } from "..";

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
  assert.match(flow, /client initiates/i);
  assert.match(flow, /reply YES/);
  assert.match(flow, /deposit links/);
  assert.match(flow, /third-party lead lists/);
});

test("two-stage campaign copy reflects booking and waiver delivery", () => {
  assert.match(inboundPublicDisclosure("Embellished Studios"), /initiating a text conversation/);
  assert.match(inboundPublicDisclosure("Embellished Studios"), /reply YES/);
  assert.match(smsConfirmationText("Embellished Studios"), /reply YES/);
  assert.match(inboundCampaignDescription("Embellished Studios"), /initiate conversations/);
  assert.match(inboundSampleMessages("Embellished Studios")[1], /consent form/);
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
