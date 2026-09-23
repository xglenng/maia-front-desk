import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@db/index";
import { automationJobs, externalWaiverAssignments, externalWaiverEvents, externalWaiverForms, waiverProviderConnections } from "@db/schema";
import { decryptComplianceSecret } from "@/packages/compliance/secrets";
import { findJotformAnswer, getJotformSubmission, parseJotformCredentials } from "@waivers/providers";

type Context = { params: Promise<{ connectionId: string }> };

export async function POST(request: NextRequest, { params }: Context) {
  const { connectionId } = await params;
  const secret = request.nextUrl.searchParams.get("secret") || "";
  const [connection] = await db.select().from(waiverProviderConnections).where(and(eq(waiverProviderConnections.id, connectionId), eq(waiverProviderConnections.provider, "JOTFORM"), eq(waiverProviderConnections.status, "ACTIVE")));
  if (!connection?.webhookSecretHash || !connection.credentialsEncrypted) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  const supplied = crypto.createHash("sha256").update(secret).digest();
  const expected = Buffer.from(connection.webhookSecretHash, "hex");
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return NextResponse.json({ error: "Invalid webhook secret" }, { status: 403 });
  const form = await request.formData();
  const submissionId = String(form.get("submissionID") || form.get("submissionId") || "");
  const postedFormId = String(form.get("formID") || form.get("formId") || "");
  if (!submissionId) return NextResponse.json({ error: "submissionID is required" }, { status: 400 });
  const credentials = parseJotformCredentials(decryptComplianceSecret(connection.credentialsEncrypted));
  const submission = await getJotformSubmission(credentials.apiKey, credentials.region, submissionId);
  const token = findJotformAnswer(submission, "waiverToken");
  if (!token) return NextResponse.json({ error: "The Jotform submission does not contain the waiverToken hidden field." }, { status: 422 });
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const [row] = await db.select({ assignment: externalWaiverAssignments, form: externalWaiverForms }).from(externalWaiverAssignments).innerJoin(externalWaiverForms, eq(externalWaiverAssignments.waiverFormId, externalWaiverForms.id)).where(and(eq(externalWaiverAssignments.trackingTokenHash, tokenHash), eq(externalWaiverAssignments.organizationId, connection.organizationId), eq(externalWaiverForms.connectionId, connection.id)));
  if (!row) return NextResponse.json({ error: "Waiver assignment not found" }, { status: 404 });
  const submissionFormId = String(submission.form_id || postedFormId || "");
  if (row.form.externalFormId && submissionFormId !== row.form.externalFormId) return NextResponse.json({ error: "Submission form does not match the assigned waiver." }, { status: 409 });
  if (row.assignment.status === "COMPLETED" && row.assignment.providerSubmissionId === submissionId) return NextResponse.json({ received: true, duplicate: true });
  const now = new Date();
  await db.transaction(async tx => {
    await tx.update(externalWaiverAssignments).set({ status: "COMPLETED", completedAt: now, providerSubmissionId: submissionId, providerMetadata: { provider: "JOTFORM", formId: submissionFormId }, updatedAt: now }).where(eq(externalWaiverAssignments.id, row.assignment.id));
    await tx.update(automationJobs).set({ status: "CANCELLED", updatedAt: now }).where(and(eq(automationJobs.type, "WAIVER_REMINDER"), eq(automationJobs.appointmentId, row.assignment.appointmentId), eq(automationJobs.status, "PENDING")));
    await tx.insert(externalWaiverEvents).values({ organizationId: connection.organizationId, assignmentId: row.assignment.id, action: "PROVIDER_COMPLETED", details: { provider: "JOTFORM", submissionId, formId: submissionFormId } });
  });
  return NextResponse.json({ received: true });
}
