import assert from "node:assert/strict";
import test from "node:test";
import { smsReplyBlockReason } from "../sms-reply";

test("recent inbound-only texts can be answered without general SMS opt-in", () => {
  const client = { phone: "+12025550123", smsOptIn: false, smsConsentStatus: "INBOUND_ONLY" };
  assert.equal(smsReplyBlockReason(client, new Date()), null);
  assert.match(smsReplyBlockReason(client, new Date(0)) ?? "", /texts again/);
  assert.match(smsReplyBlockReason({ ...client, smsConsentStatus: "OPTED_OUT" }, new Date()) ?? "", /START/);
  assert.match(smsReplyBlockReason({ ...client, phone: null }, new Date()) ?? "", /phone number/);
});
