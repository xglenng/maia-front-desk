import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { resolvePublicIntakeClient } from "../intake.server";

const socket = process.env.MAIA_CONSENT_TEST_SOCKET;
test("public intake PostgreSQL concurrency, tenant isolation, STOP preservation and rollback", { skip: !socket }, async () => {
  assert.match(socket!, /^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/);
  const local = new Pool({ host: socket, port: 55439, database: "maia_consent_test", user: process.env.USER, max: 8 });
  try {
    assert.equal((await local.query("SHOW data_directory")).rows[0].data_directory, `${socket}/data`);
    await local.query(readFileSync("packages/db/staging/schema.sql", "utf8"));
    const org = (await local.query("INSERT INTO organizations(name,slug) VALUES('Synthetic Consent','synthetic-consent') RETURNING id")).rows[0].id;
    const db = drizzle(local);
    const input = { organizationId: org, phone: "+15555550100", firstName: "Synthetic", email: "synthetic@example.test", consented: true };
    const results = await Promise.all(Array.from({ length: 5 }, () => db.transaction(tx => resolvePublicIntakeClient(tx as never, input))));
    assert.equal(new Set(results.map(row => row.client.id)).size, 1);
    assert.equal(results.filter(row => row.consented).length, 1);
    await local.query("UPDATE clients SET sms_opt_in=false,sms_consent_status='OPTED_OUT' WHERE id=$1", [results[0].client.id]);
    const stopped = await db.transaction(tx => resolvePublicIntakeClient(tx as never, { ...input, firstName: "Impersonator" }));
    assert.equal(stopped.client.firstName, "Synthetic");
    assert.equal(stopped.client.smsConsentStatus, "OPTED_OUT");
    assert.equal(stopped.consented, false);
    await assert.rejects(db.transaction(async tx => {
      await resolvePublicIntakeClient(tx as never, { ...input, phone: "+15555550200" });
      await tx.execute(sql`INSERT INTO sms_consent_evidence DEFAULT VALUES`);
    }));
    assert.equal((await local.query("SELECT count(*)::int n FROM clients WHERE phone='+15555550200'")).rows[0].n, 0);
    const org2 = (await local.query("INSERT INTO organizations(name,slug) VALUES('Synthetic Other','synthetic-other') RETURNING id")).rows[0].id;
    const other = await db.transaction(tx => resolvePublicIntakeClient(tx as never, { ...input, organizationId: org2 }));
    assert.notEqual(other.client.id, stopped.client.id);
  } finally { await local.end(); }
});
