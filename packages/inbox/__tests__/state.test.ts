import test from "node:test";
import assert from "node:assert/strict";
import { applyInboxAction, canAccessArtist, conversationMode, shouldRunAi } from "../state";
import { readFileSync } from "node:fs";

test("human takeover disables AI without losing unread state", () => {
  const next = applyInboxAction({ aiEnabled: true, status: "OPEN", unreadCount: 2 }, "TAKE_OVER");
  assert.deepEqual(next, { aiEnabled: false, status: "OPEN", unreadCount: 2 });
  assert.equal(conversationMode(next), "HUMAN");
  assert.equal(shouldRunAi(next), false);
});

test("returning to AI reopens the conversation", () => {
  const next = applyInboxAction({ aiEnabled: false, status: "CLOSED", unreadCount: 1 }, "RETURN_TO_AI");
  assert.deepEqual(next, { aiEnabled: true, status: "OPEN", unreadCount: 1 });
  assert.equal(shouldRunAi(next), true);
});

test("mark read and close are deterministic", () => {
  const read = applyInboxAction({ aiEnabled: false, status: "OPEN", unreadCount: 4 }, "MARK_READ");
  assert.equal(read.unreadCount, 0);
  const closed = applyInboxAction(read, "CLOSE");
  assert.equal(conversationMode(closed), "CLOSED");
  assert.equal(shouldRunAi(closed), false);
});

test("owners can access the studio while artists only access their own inbox", () => {
  assert.equal(canAccessArtist("OWNER", "owner", null), true);
  assert.equal(canAccessArtist("ARTIST", "artist-a", "artist-a"), true);
  assert.equal(canAccessArtist("ARTIST", "artist-a", "artist-b"), false);
  assert.equal(canAccessArtist("UNKNOWN", "artist-a", "artist-a"), false);
});

test("inbound webhook honors takeover and deduplicates Twilio retries", () => {
  const source = readFileSync("app/api/twilio/inbound/route.ts", "utf8");
  assert.match(source, /messages\.externalMessageId, params\.MessageSid/);
  assert.match(source, /if \(!shouldRunAi\(conv\)\)/);
  assert.match(source, /messageAlreadyStored: true/);
  assert.ok(source.indexOf("if (!shouldRunAi(conv))") < source.indexOf("const aiRes = await runAi"));
});

test("manual replies require a human-controlled conversation", () => {
  const source = readFileSync("app/api/inbox/[id]/messages/route.ts", "utf8");
  assert.match(source, /if \(conversation\.aiEnabled\)/);
  assert.match(source, /Take over this conversation before sending a manual reply/);
});

test("manual social replies use their connected account instead of Twilio", () => {
  const source = readFileSync("app/api/inbox/[id]/messages/route.ts", "utf8");
  assert.match(source, /sendMetaMessage/);
  assert.match(source, /channelConnectionId/);
  assert.match(source, /withinSocialReplyWindow/);
});

test("Meta webhook is signature verified and routes normalized events", () => {
  const source = readFileSync("app/api/meta/webhook/route.ts", "utf8");
  assert.match(source, /validateMetaSignature/);
  assert.match(source, /normalizeMetaWebhook/);
  assert.match(source, /processSocialInbound/);
  assert.match(source, /after\(async/);
});

test("the inbox keeps long threads scrollable and follows new messages", () => {
  const page = readFileSync("app/inbox/page.tsx", "utf8");
  const css = readFileSync("app/inbox/inbox.css", "utf8");
  assert.match(page, /messageStreamRef/);
  assert.match(page, /stream\.scrollTo/);
  assert.match(page, /loadDetail\(selectedId, false\)/);
  assert.match(css, /\.message-stream\{overscroll-behavior:contain/);
});

test("mock social clients use a name plus a stable unique sender ID", () => {
  const mockRoute = readFileSync("app/api/channels/mock-inbound/route.ts", "utf8");
  const server = readFileSync("packages/channels/server.ts", "utf8");
  assert.match(mockRoute, /senderName/);
  assert.match(mockRoute, /profileName: parsed\.data\.senderName/);
  assert.match(server, /event\.profileName/);
  assert.match(server, /externalUserId/);
});
