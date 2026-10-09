import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { pool } from "@db";
import { POST as hosted } from "../../../app/api/public/booking-inquiries/route";
import { POST as external } from "../../../app/api/public/consent/external/[formId]/route";
import { tokenDigest } from "..";
import { publicIntakeLimit } from "../rate-limit.server";

const socket = process.env.MAIA_CONSENT_HTTP_TEST_SOCKET;
test("public intake HTTP handlers with real PostgreSQL enforce consent, replay, rollback and durable limits", { skip: !socket }, async t => {
  assert.match(socket!, /^\/private\/tmp\/maia-signup-[A-Za-z0-9]+$/);
  const local = new Pool({ host: socket, port: 55439, database: "maia_consent_http_test", user: process.env.USER, max: 8 });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Provider calls forbidden"); });
  try {
    assert.equal((await local.query("SHOW data_directory")).rows[0].data_directory, `${socket}/data`);
    await local.query(readFileSync("packages/db/staging/schema.sql", "utf8"));
    t.mock.method(pool, "query", local.query.bind(local));
    t.mock.method(pool, "connect", local.connect.bind(local));
    const org = randomUUID(), artist = randomUUID(), form = randomUUID(), externalArtist = randomUUID(), externalForm = randomUUID();
    await local.query("INSERT INTO organizations(id,name,slug) VALUES($1,'Synthetic HTTP','synthetic-http')", [org]);
    await local.query("INSERT INTO artists(id,organization_id,display_name) VALUES($1,$3,'Synthetic Hosted'),($2,$3,'Synthetic External')", [artist, externalArtist, org]);
    await local.query("INSERT INTO artist_consent_forms(id,organization_id,artist_id,slug,disclosure_text) VALUES($1,$2,$3,'synthetic-hosted','Synthetic disclosure')", [form,org,artist]);
    await local.query("INSERT INTO artist_consent_forms(id,organization_id,artist_id,slug,mode,disclosure_text,external_url,external_verified_at,external_ingest_token_hash) VALUES($1,$2,$3,'synthetic-external','EXTERNAL','Synthetic disclosure','https://forms.example.test',now(),$4)", [externalForm,org,externalArtist,tokenDigest("synthetic-local-token")]);
    await local.query("INSERT INTO legal_documents(organization_id,type,title,content,effective_date,status) VALUES($1,'PRIVACY','Synthetic Privacy','Synthetic only','2026-10-08','PUBLISHED'),($1,'TERMS','Synthetic Terms','Synthetic only','2026-10-08','PUBLISHED')", [org]);
    const base = { organizationSlug: "synthetic-http", formSlug: "synthetic-hosted", firstName: "Original", email: "original@example.test", phone: "+15555550100", inquiry: "Synthetic appointment inquiry", smsConsent: true };
    const req = (path: string, body: unknown, authorization?: string) => new NextRequest(`http://localhost${path}`, { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body) });
    const submit = (body: unknown) => hosted(req("/api/public/booking-inquiries", body));
    const submitExternal = (body: unknown) => external(req(`/api/public/consent/external/${externalForm}`, body, "Bearer synthetic-local-token"), { params: Promise.resolve({ formId: externalForm }) });
    await t.test("checked new client and unchecked inquiry succeed", async () => {
      const checked = await submit(base); assert.equal(checked.status,200); assert.equal((await checked.json()).smsConsent,true);
      const unchecked = await submit({ ...base, phone: "+15555550101", smsConsent:false }); assert.equal(unchecked.status,200); assert.equal((await unchecked.json()).smsConsent,false);
    });
    await t.test("STOP and identity survive checked resubmission", async () => {
      await local.query("UPDATE clients SET sms_opt_in=false,sms_consent_status='OPTED_OUT' WHERE organization_id=$1 AND phone=$2", [org,base.phone]);
      const response = await submit({ ...base, firstName:"Impersonator", email:"changed@example.test" });
      assert.equal(response.status,200); assert.equal((await response.json()).verificationRequired,true);
      const row = (await local.query("SELECT first_name,email,sms_opt_in,sms_consent_status FROM clients WHERE organization_id=$1 AND phone=$2",[org,base.phone])).rows[0];
      assert.deepEqual(row,{first_name:"Original",email:"original@example.test",sms_opt_in:false,sms_consent_status:"OPTED_OUT"});
      assert.equal((await local.query("SELECT consented FROM sms_consent_evidence WHERE organization_id=$1 ORDER BY submitted_at DESC LIMIT 1",[org])).rows[0].consented,false);
    });
    await t.test("concurrent external retry has one evidence and conflicting retry rejects", async () => {
      const input = { firstName:"External", email:"external@example.test", phone:"+15555550102", consented:true, externalSubmissionId:"synthetic-submission" };
      const responses = await Promise.all([submitExternal(input),submitExternal(input)]);
      assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);
      assert.equal((await local.query("SELECT count(*)::int n FROM sms_consent_evidence WHERE consent_form_id=$1 AND external_submission_id=$2",[externalForm,input.externalSubmissionId])).rows[0].n,1);
      assert.equal((await submitExternal({...input,email:"different@example.test"})).status,409);
      assert.equal((await submitExternal({...input,externalSubmissionId:"second-submission",phone:base.phone})).status,201);
      assert.equal((await local.query("SELECT sms_consent_status FROM clients WHERE organization_id=$1 AND phone=$2",[org,base.phone])).rows[0].sms_consent_status,"OPTED_OUT");
    });
    await t.test("failed inquiry rolls back both client and evidence", async () => {
      await local.query("CREATE FUNCTION reject_synthetic_inquiry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic failure'; END $$; CREATE TRIGGER reject_inquiry BEFORE INSERT ON booking_inquiries FOR EACH ROW EXECUTE FUNCTION reject_synthetic_inquiry()");
      t.mock.method(console,"error",()=>{});
      assert.equal((await submit({...base,phone:"+15555550103"})).status,500);
      assert.equal((await local.query("SELECT count(*)::int n FROM clients WHERE organization_id=$1 AND phone='+15555550103'",[org])).rows[0].n,0);
      assert.equal((await local.query("SELECT count(*)::int n FROM sms_consent_evidence WHERE organization_id=$1 AND phone='+15555550103'",[org])).rows[0].n,0);
      await local.query("DROP TRIGGER reject_inquiry ON booking_inquiries; DROP FUNCTION reject_synthetic_inquiry()");
    });
    await t.test("concurrent rate limit, HTTP 429, and expiry reset", async () => {
      const rateForm = randomUUID();
      const results = await Promise.all(Array.from({length:35},()=>publicIntakeLimit(rateForm,"HOSTED")));
      assert.equal(results.filter(r=>r.allowed).length,30);
      await local.query("UPDATE auth_login_attempts SET attempts=30 WHERE key LIKE 'public-intake:HOSTED:%'");
      const blocked = await submit(base); assert.equal(blocked.status,429); assert.ok(Number(blocked.headers.get("retry-after"))>0);
      await local.query("UPDATE auth_login_attempts SET reset_at=now()-interval '1 second' WHERE key LIKE 'public-intake:HOSTED:%'");
      assert.equal((await submit({...base,phone:"+15555550104"})).status,200);
    });
    await t.test("bad origin and oversized streamed requests reject", async () => {
      const bad = req("/api/public/booking-inquiries",base); bad.headers.set("origin","https://evil.example");
      assert.equal((await hosted(bad)).status,403);
      assert.equal((await submit({...base,inquiry:"x".repeat(70000)})).status,413);
    });
  } finally { await local.end(); }
});
