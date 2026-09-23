import { protectedFormRoute, protectedRoute } from "@/packages/auth/server";
import { NextResponse } from "next/server";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db";
import { complianceEvents, phoneNumberPortRequests, phoneNumbers, twilioAccounts, twilioMessagingServices } from "@db/schema";
import { encryptSecret } from "@integrations/twilio";
import { checkPortability, createPortRequest, uploadUtilityBill } from "@integrations/twilio-porting";
import { minimumTargetPortDate, normalizePortStatus } from "@/packages/porting/state";

const inputSchema = z.object({
  organizationId: z.string().uuid(), artistId: z.string().uuid(), phoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/),
  customerType: z.enum(["Business", "Individual"]), customerName: z.string().min(2).max(120), accountNumber: z.string().min(2).max(120),
  accountTelephoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/), pin: z.string().max(40).optional(),
  billingStreet: z.string().min(3).max(120), billingStreet2: z.string().max(120).optional(), billingCity: z.string().min(2).max(80),
  billingRegion: z.string().min(2).max(80), billingPostalCode: z.string().min(3).max(20), billingCountry: z.string().length(2),
  representative: z.string().min(3).max(120), representativeEmail: z.string().email(), voiceForwardTo: z.string().regex(/^\+[1-9]\d{7,14}$/), targetPortDate: z.string().date()
});

function safe(row: typeof phoneNumberPortRequests.$inferSelect) {
  const { carrierAccountNumberEncrypted: _account, carrierPinEncrypted: _pin, providerPayload: _payload, ...value } = row;
  return { ...value, hasCarrierAccountNumber: Boolean(_account), hasCarrierPin: Boolean(_pin) };
}

async function handleGET(req: Request) {
  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId");
  const artistId = url.searchParams.get("artistId");
  if (!organizationId) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  const where = artistId ? and(eq(phoneNumberPortRequests.organizationId, organizationId), eq(phoneNumberPortRequests.artistId, artistId)) : eq(phoneNumberPortRequests.organizationId, organizationId);
  const rows = await db.select().from(phoneNumberPortRequests).where(where).orderBy(desc(phoneNumberPortRequests.createdAt));
  return NextResponse.json({ requests: rows.map(safe), mode: process.env.TWILIO_PORT_MODE === "mock" ? "mock" : "live" });
}

async function handlePOST(req: Request) {
  const form = await req.formData();
  const strings = Object.fromEntries([...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const parsed = inputSchema.safeParse(strings);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  if (input.voiceForwardTo === input.phoneNumber) return NextResponse.json({ error: "Calls cannot be forwarded back to the number being ported. Enter a different destination." }, { status: 400 });
  if (input.targetPortDate < minimumTargetPortDate()) return NextResponse.json({ error: `Target port date must be at least seven days away (${minimumTargetPortDate()} or later).` }, { status: 400 });
  const utilityBill = form.get("utilityBill");
  if (!(utilityBill instanceof File) || utilityBill.size === 0) return NextResponse.json({ error: "A current carrier bill is required." }, { status: 400 });
  if (utilityBill.size > 10 * 1024 * 1024) return NextResponse.json({ error: "The carrier bill must be 10 MB or smaller." }, { status: 400 });
  if (!["application/pdf", "image/jpeg", "image/png"].includes(utilityBill.type)) return NextResponse.json({ error: "Upload the carrier bill as a PDF, JPG, or PNG." }, { status: 400 });

  const [resource] = await db.select({ account: twilioAccounts, service: twilioMessagingServices }).from(twilioMessagingServices)
    .innerJoin(twilioAccounts, eq(twilioMessagingServices.twilioAccountId, twilioAccounts.id))
    .where(and(eq(twilioMessagingServices.organizationId, input.organizationId), eq(twilioMessagingServices.artistId, input.artistId))).limit(1);
  if (!resource) return NextResponse.json({ error: "Provision the temporary Twilio number before starting a port." }, { status: 409 });
  const [temporary] = await db.select().from(phoneNumbers).where(and(eq(phoneNumbers.organizationId, input.organizationId), eq(phoneNumbers.artistId, input.artistId), eq(phoneNumbers.isPrimary, true))).limit(1);
  if (!temporary || !["APPROVED", "MOCK_APPROVED"].includes(temporary.complianceStatus)) return NextResponse.json({ error: "Complete A2P approval and test the temporary number before submitting a port." }, { status: 409 });
  const [existing] = await db.select().from(phoneNumberPortRequests).where(and(eq(phoneNumberPortRequests.organizationId, input.organizationId), eq(phoneNumberPortRequests.artistId, input.artistId), notInArray(phoneNumberPortRequests.status, ["CANCELED", "COMPLETED", "EXPIRED"]))).limit(1);
  if (existing) return NextResponse.json({ error: "This artist already has an active port request.", request: safe(existing) }, { status: 409 });

  let portability: { portable: boolean; number_type?: string; pin_and_account_number_required?: boolean; not_portable_reason?: string | null } = { portable: true, number_type: "LOCAL", pin_and_account_number_required: false };
  if (process.env.TWILIO_PORT_MODE !== "mock") portability = await checkPortability(input.phoneNumber, resource.account.accountSid);
  if (!portability.portable) return NextResponse.json({ error: `This number cannot be ported automatically: ${portability.not_portable_reason || "Twilio marked it ineligible"}.` }, { status: 409 });
  if (portability.pin_and_account_number_required && !input.pin) return NextResponse.json({ error: "The losing carrier requires the account PIN for this number." }, { status: 400 });

  const [row] = await db.insert(phoneNumberPortRequests).values({
    organizationId: input.organizationId, artistId: input.artistId, twilioAccountId: resource.account.id, messagingServiceId: resource.service.id,
    temporaryPhoneNumberId: temporary?.id, phoneNumber: input.phoneNumber, numberType: portability.number_type,
    portabilityStatus: "PORTABLE", pinRequired: Boolean(portability.pin_and_account_number_required), carrierAccountNumberEncrypted: encryptSecret(input.accountNumber),
    carrierPinEncrypted: input.pin ? encryptSecret(input.pin) : null, carrierCustomerName: input.customerName, carrierAccountPhone: input.accountTelephoneNumber,
    billingStreet: input.billingStreet, billingStreet2: input.billingStreet2, billingCity: input.billingCity, billingRegion: input.billingRegion,
    billingPostalCode: input.billingPostalCode, billingCountry: input.billingCountry, authorizedRepresentative: input.representative,
    authorizedRepresentativeEmail: input.representativeEmail, voiceForwardTo: input.voiceForwardTo, targetPortDate: input.targetPortDate, status: "UPLOADING_DOCUMENT"
  }).returning();

  try {
    if (process.env.TWILIO_PORT_MODE === "mock") {
      const suffix = row.id.replaceAll("-", "").slice(0, 16).toUpperCase();
      const [updated] = await db.update(phoneNumberPortRequests).set({ providerDocumentSid: `RD_MOCK_${suffix}`, providerRequestSid: `KW_MOCK_${suffix}`, providerPhoneNumberSid: `PU_MOCK_${suffix}`, supportTicketId: "MOCK", status: "WAITING_FOR_SIGNATURE", submittedAt: new Date(), lastStatusCheckedAt: new Date(), updatedAt: new Date() }).where(eq(phoneNumberPortRequests.id, row.id)).returning();
      await db.insert(complianceEvents).values({ organizationId: input.organizationId, phase: "PORTING", action: "SUBMIT", status: "SUCCESS", providerSid: updated.providerRequestSid, details: { mode: "mock", phoneNumber: input.phoneNumber } });
      return NextResponse.json({ request: safe(updated), mode: "mock" });
    }
    const document = await uploadUtilityBill(utilityBill, `${input.customerName} carrier bill`);
    if (!document.mime_type) throw new Error("Twilio did not receive the carrier bill contents.");
    await db.update(phoneNumberPortRequests).set({ providerDocumentSid: document.sid, status: "CREATING_REQUEST", updatedAt: new Date() }).where(eq(phoneNumberPortRequests.id, row.id));
    const created = await createPortRequest({ targetAccountSid: resource.account.accountSid, documentSid: document.sid, phoneNumber: input.phoneNumber, pin: input.pin,
      customerName: input.customerName, customerType: input.customerType, accountNumber: input.accountNumber, accountTelephoneNumber: input.accountTelephoneNumber,
      address: { street: input.billingStreet, street2: input.billingStreet2, city: input.billingCity, state: input.billingRegion, zip: input.billingPostalCode, country: input.billingCountry },
      representative: input.representative, representativeEmail: input.representativeEmail, notificationEmails: [input.representativeEmail], targetPortDate: input.targetPortDate });
    const phone = created.phone_numbers?.[0] || {};
    const [updated] = await db.update(phoneNumberPortRequests).set({ providerDocumentSid: document.sid, providerRequestSid: created.port_in_request_sid,
      providerPhoneNumberSid: typeof phone.port_in_phone_number_sid === "string" ? phone.port_in_phone_number_sid : null, supportTicketId: created.support_ticket_id ? String(created.support_ticket_id) : null,
      status: normalizePortStatus(created.port_in_request_status || "IN_REVIEW"), submittedAt: new Date(), lastStatusCheckedAt: new Date(), updatedAt: new Date() }).where(eq(phoneNumberPortRequests.id, row.id)).returning();
    await db.insert(complianceEvents).values({ organizationId: input.organizationId, phase: "PORTING", action: "SUBMIT", status: "SUCCESS", providerSid: created.port_in_request_sid, details: { phoneNumber: input.phoneNumber } });
    return NextResponse.json({ request: safe(updated), mode: "live" });
  } catch (error) {
    const provider = error instanceof Error && "provider" in error ? (error as Error & { provider: unknown }).provider : undefined;
    await db.update(phoneNumberPortRequests).set({ status: "SUBMISSION_ERROR", rejectionReason: error instanceof Error ? error.message : "Port submission failed.", providerPayload: provider as object, updatedAt: new Date() }).where(eq(phoneNumberPortRequests.id, row.id));
    await db.insert(complianceEvents).values({ organizationId: input.organizationId, phase: "PORTING", action: "SUBMIT", status: "FAILED", details: { message: error instanceof Error ? error.message : "Port submission failed." } });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit the port request." }, { status: 502 });
  }
}

export const GET = protectedRoute(handleGET, true);
export const POST = protectedFormRoute(handlePOST, true);
