import test from "node:test";
import assert from "node:assert/strict";
import { findExternalReplay, SubmissionReplayConflict, resolvePublicIntakeClient } from "../intake.server";
import { hasScopedSmsConsent } from "../server";
import { db } from "@db";

const input = { organizationId: "org", phone: "+15555550100", firstName: "Claimed", email: "claimed@example.test", consented: true };
test("public phone matches cannot overwrite identity, reverse STOP, or grant another artist consent", async () => {
  for (const smsConsentStatus of ["OPTED_OUT", "OPTED_IN", "DECLINED"]) {
    const client = { id: "existing", firstName: "Original", email: "original@example.test", smsConsentStatus };
    let locks = 0;
    const tx = {
      execute: async () => { locks++; },
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [client] }) }) }),
      insert: () => { throw new Error("No existing identity writes allowed"); },
      update: () => { throw new Error("No existing identity writes allowed"); }
    };
    const result = await resolvePublicIntakeClient(tx as never, input);
    assert.deepEqual(result, { client, consented: false, verificationRequired: true });
    assert.equal(locks, 1);
  }
});
test("ambiguous phone ownership fails closed", async () => {
  const tx = { execute: async () => {}, select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "one" }, { id: "two" }] }) }) }) };
  await assert.rejects(resolvePublicIntakeClient(tx as never, input), /Ambiguous/);
});
test("new clients retain optional hosted checkbox behavior", async () => {
  for (const consented of [true, false]) {
    let stored: Record<string, unknown> = {};
    const tx = {
      execute: async () => {},
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      insert: () => ({ values: (value: Record<string, unknown>) => { stored = value; return { returning: async () => [{ id: "new", ...value }] }; } })
    };
    const result = await resolvePublicIntakeClient(tx as never, { ...input, consented });
    assert.equal(stored.smsOptIn, consented);
    assert.equal(stored.smsConsentStatus, consented ? "OPTED_IN" : "DECLINED");
    assert.equal(result.consented, consented);
    assert.equal(result.verificationRequired, false);
  }
});
test("scoped evidence requires an active matching client consent join", async t => {
  let joined = false;
  t.mock.method(db, "select", (() => ({ from: () => ({ innerJoin: () => { joined = true; return { where: () => ({ limit: async () => [] }) }; } }) })) as never);
  assert.equal(await hasScopedSmsConsent({ organizationId: "org", artistId: "artist", clientId: "client", phone: input.phone }), false);
  assert.equal(joined, true);
});


test("external retries reuse exact contact and consent; conflicts and legacy ambiguity fail closed", async () => {
  const replayInput = { ...input, formId: "form", submissionId: "submission", lastName: null };
  const row = { phone: input.phone, consented: true, metadata: {
    submittedContact: { phone: input.phone, firstName: input.firstName, lastName: null, email: input.email },
    requestedConsent: true, verificationRequired: false
  } };
  let matches: unknown[] = [row];
  let locks = 0;
  const tx = { execute: async () => { locks++; }, select: () => ({ from: () => ({ where: () => ({ limit: async () => matches }) }) }) };
  assert.deepEqual(await findExternalReplay(tx as never, replayInput), { consented: true, verificationRequired: false });
  for (const change of [{ phone: "+15555550999" }, { email: "changed@example.test" }, { consented: false }]) {
    await assert.rejects(findExternalReplay(tx as never, { ...replayInput, ...change }), SubmissionReplayConflict);
  }
  matches = [row, row];
  await assert.rejects(findExternalReplay(tx as never, replayInput), SubmissionReplayConflict);
  matches = [];
  assert.equal(await findExternalReplay(tx as never, replayInput), null);
  const previousLocks = locks;
  assert.equal(await findExternalReplay(tx as never, { ...replayInput, submissionId: null }), null);
  assert.equal(locks, previousLocks);
});
