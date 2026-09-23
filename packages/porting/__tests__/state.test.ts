import test from "node:test";
import assert from "node:assert/strict";
import { minimumTargetPortDate, normalizePortStatus, portIsComplete, portNeedsAction } from "../state";

test("normalizes Twilio porting statuses", () => {
  assert.equal(normalizePortStatus("Waiting for Signature"), "WAITING_FOR_SIGNATURE");
  assert.equal(normalizePortStatus("port-rejected"), "PORT_REJECTED");
});

test("detects completed and action-required states", () => {
  assert.equal(portIsComplete("In Progress", "Completed"), true);
  assert.equal(portNeedsAction("Action Required"), true);
  assert.equal(portNeedsAction("In Progress", "Port Pending"), false);
});

test("requires a target date at least seven days ahead", () => {
  assert.equal(minimumTargetPortDate(new Date("2026-09-18T12:00:00Z")), "2026-09-25");
});
