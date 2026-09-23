import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { inspectMetaConnection, metaOAuthUrl, normalizeMetaWebhook, validateMetaSignature, withinSocialReplyWindow } from "../meta";

test("normalizes Facebook and Instagram messages while ignoring echoes", () => {
  const facebook = normalizeMetaWebhook({ object: "page", entry: [{ id: "page", messaging: [{ sender: { id: "person" }, message: { mid: "m1", text: "Hello" }, timestamp: 10 }, { sender: { id: "page" }, message: { mid: "m2", text: "echo", is_echo: true } }] }] });
  assert.deepEqual(facebook, [{ provider: "FACEBOOK", externalAccountId: "page", externalUserId: "person", externalMessageId: "m1", text: "Hello", attachments: [], timestamp: 10 }]);
  assert.equal(normalizeMetaWebhook({ object: "instagram", entry: [{ id: "ig", messaging: [{ sender: { id: "p" }, message: { mid: "i1", text: "Tattoo?" } }] }] })[0]?.provider, "INSTAGRAM");
});

test("keeps image-only messages visible to the studio", () => {
  const [event] = normalizeMetaWebhook({ object: "instagram", entry: [{ id: "ig", messaging: [{ sender: { id: "p" }, message: { mid: "i2", attachments: [{ type: "image", payload: { url: "https://cdn.example/reference.jpg" } }] } }] }] });
  assert.equal(event?.text, "[image attachment received]");
  assert.equal(event?.attachments[0]?.url, "https://cdn.example/reference.jpg");
});

test("validates Meta webhook signatures with constant-time HMAC comparison", () => {
  const body = JSON.stringify({ object: "page" });
  const secret = "test-secret";
  const signature = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(validateMetaSignature(body, signature, secret), true);
  assert.equal(validateMetaSignature(body + "x", signature, secret), false);
});

test("social replies are limited to the active 24-hour conversation window", () => {
  const now = new Date("2026-09-19T12:00:00Z");
  assert.equal(withinSocialReplyWindow(new Date("2026-09-18T12:00:01Z"), now), true);
  assert.equal(withinSocialReplyWindow(new Date("2026-09-18T11:59:59Z"), now), false);
  assert.equal(withinSocialReplyWindow(null, now), false);
});

test("Meta OAuth requests only the messaging permissions used by the app", () => {
  const priorId = process.env.META_APP_ID, priorRedirect = process.env.META_REDIRECT_URI;
  process.env.META_APP_ID = "123";
  process.env.META_REDIRECT_URI = "https://app.example/api/integrations/meta/callback";
  const url = new URL(metaOAuthUrl("state-token"));
  const scopes = new Set((url.searchParams.get("scope") || "").split(","));
  assert.equal(url.searchParams.get("state"), "state-token");
  assert.deepEqual(scopes, new Set(["pages_show_list", "pages_read_engagement", "pages_messaging", "instagram_basic", "instagram_manage_messages"]));
  if (priorId === undefined) delete process.env.META_APP_ID; else process.env.META_APP_ID = priorId;
  if (priorRedirect === undefined) delete process.env.META_REDIRECT_URI; else process.env.META_REDIRECT_URI = priorRedirect;
});

test("mock connection health is deterministic without external requests", async () => {
  const prior = process.env.META_MESSAGING_MODE;
  process.env.META_MESSAGING_MODE = "mock";
  const health = await inspectMetaConnection({ provider: "INSTAGRAM", externalAccountId: "ig", pageId: "page", accessToken: "test" });
  assert.equal(health.valid, true);
  assert.equal(health.subscribed, true);
  if (prior === undefined) delete process.env.META_MESSAGING_MODE; else process.env.META_MESSAGING_MODE = prior;
});

test("live OAuth stages encrypted candidates instead of connecting every managed Page", () => {
  const callback = readFileSync("app/api/integrations/meta/callback/route.ts", "utf8");
  const candidates = readFileSync("app/api/channels/meta-candidates/route.ts", "utf8");
  const connect = readFileSync("app/api/integrations/meta/connect/route.ts", "utf8");
  assert.match(callback, /exchangeLongLivedMetaToken/);
  assert.match(callback, /metaConnectionCandidates/);
  assert.doesNotMatch(callback, /for \(const page of pages\)/);
  assert.match(candidates, /payloadEncrypted/);
  assert.match(candidates, /Selected Facebook Page is not part of this authorization/);
  assert.match(connect, /artists\.organizationId/);
});

test("channel API exposes health without returning stored access tokens", () => {
  const route = readFileSync("app/api/channels/route.ts", "utf8");
  assert.match(route, /CHECK_HEALTH/);
  assert.match(route, /inspectMetaConnection/);
  assert.doesNotMatch(route, /accessTokenEncrypted:\s*channelConnections\.accessTokenEncrypted/);
});
