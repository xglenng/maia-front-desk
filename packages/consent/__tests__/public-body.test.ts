import test from "node:test";
import assert from "node:assert/strict";
import { readPublicJson } from "../public-body";

test("public JSON enforces actual bytes with missing or misleading length", async () => {
  for (const headers of [new Headers(), new Headers({ "content-length": "1" })]) {
    const request = new Request("http://localhost", { method: "POST", headers, body: JSON.stringify({ text: "x".repeat(100) }) });
    await assert.rejects(readPublicJson(request, 32), { status: 413 });
  }
});
test("public JSON rejects malformed payloads and accepts bounded unicode", async () => {
  await assert.rejects(readPublicJson(new Request("http://localhost", { method: "POST", body: "{" })), { status: 400 });
  assert.deepEqual(await readPublicJson(new Request("http://localhost", { method: "POST", body: '{"name":"é"}' })), { name: "é" });
});
