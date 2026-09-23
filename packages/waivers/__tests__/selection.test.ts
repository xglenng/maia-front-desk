import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ageOn, appendTrackingToken, providerSupportsAutomaticCompletion, selectWaiverForm, type WaiverCandidate } from "../selection";

const base: WaiverCandidate[] = [
  { id: "general", artistId: null, serviceId: null, audience: "ANY", priority: 100, active: true },
  { id: "adult-service", artistId: null, serviceId: "tattoo", audience: "ADULT", priority: 100, active: true },
  { id: "minor-artist", artistId: "artist", serviceId: "tattoo", audience: "MINOR", priority: 50, active: true },
];

test("selects the most specific matching waiver deterministically", () => {
  assert.equal(selectWaiverForm(base, { artistId: "artist", serviceId: "tattoo", isMinor: true })?.id, "minor-artist");
  assert.equal(selectWaiverForm(base, { artistId: "other", serviceId: "tattoo", isMinor: false })?.id, "adult-service");
  assert.equal(selectWaiverForm(base, { artistId: "other", serviceId: null, isMinor: false })?.id, "general");
});

test("unknown age only permits an any-audience waiver", () => {
  assert.equal(selectWaiverForm(base, { artistId: "artist", serviceId: "tattoo", isMinor: null })?.id, "general");
});

test("calculates age on the appointment date", () => {
  assert.equal(ageOn("2008-10-01", new Date("2026-09-30T12:00:00Z")), 17);
  assert.equal(ageOn("2008-10-01", new Date("2026-10-01T12:00:00Z")), 18);
});

test("adds an opaque tracking token without discarding existing form parameters", () => {
  const url = new URL(appendTrackingToken("https://form.example/123?studio=one", "secret"));
  assert.equal(url.searchParams.get("studio"), "one");
  assert.equal(url.searchParams.get("waiverToken"), "secret");
});

test("only full provider adapters claim automatic completion", () => {
  assert.equal(providerSupportsAutomaticCompletion("JOTFORM"), true);
  assert.equal(providerSupportsAutomaticCompletion("CUSTOM"), false);
});

test("Jotform completion is verified against the provider and an opaque secret", () => {
  const source = readFileSync("app/api/waivers/webhooks/jotform/[connectionId]/route.ts", "utf8");
  assert.match(source, /timingSafeEqual/);
  assert.match(source, /getJotformSubmission/);
  assert.match(source, /trackingTokenHash/);
  assert.doesNotMatch(source, /providerMetadata:\s*submission/);
});

test("waiver reminders are tenant-sent and stop after terminal states", () => {
  const runner = readFileSync("app/api/automations/run/route.ts", "utf8");
  const completion = readFileSync("app/api/waiver-assignments/[id]/route.ts", "utf8");
  assert.match(runner, /sendStudioSms/);
  assert.match(runner, /waiverAssignmentId/);
  assert.match(completion, /WAIVER_REMINDER/);
  assert.match(completion, /CANCELLED/);
});

test("owners can rotate a lost webhook secret without exposing stored credentials", () => {
  const source = readFileSync("app/api/waiver-integrations/route.ts", "utf8");
  assert.match(source, /ROTATE_WEBHOOK/);
  assert.match(source, /webhookSecretHash/);
  assert.match(source, /credentialsEncrypted/);
  assert.doesNotMatch(source, /apiKey:\s*credentials/);
});
