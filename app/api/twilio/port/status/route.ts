import { protectedRoute } from "@/packages/auth/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db";
import { a2pCampaigns, complianceEvents, phoneNumberPortRequests, phoneNumbers, twilioAccounts, twilioMessagingServices } from "@db/schema";
import { addNumberToMessagingService, decryptSecret } from "@integrations/twilio";
import { configureIncomingPhoneNumber, findIncomingPhoneNumber, getPortRequest } from "@integrations/twilio-porting";
import { normalizePortStatus, portIsComplete, portNeedsAction } from "@/packages/porting/state";

const schema = z.object({ organizationId: z.string().uuid(), artistId: z.string().uuid(), requestId: z.string().uuid(), mockDecision: z.enum(["ADVANCE", "COMPLETE", "ACTION_REQUIRED"]).optional() });

function inboundUrl() {
  const base = process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!base || base.includes("localhost")) throw new Error("TWILIO_WEBHOOK_BASE_URL must be a public HTTPS URL before completing a port.");
  return `${base.replace(/\/$/, "")}/api/twilio/inbound`;
}

function voiceUrl() { return inboundUrl().replace(/\/api\/twilio\/inbound$/, "/api/twilio/voice"); }

function safe(row: typeof phoneNumberPortRequests.$inferSelect) {
  const { carrierAccountNumberEncrypted: _account, carrierPinEncrypted: _pin, providerPayload: _payload, ...value } = row;
  return value;
}

async function activatePortedNumber(request: typeof phoneNumberPortRequests.$inferSelect, providerPhoneSid?: string) {
  const [account] = await db.select().from(twilioAccounts).where(eq(twilioAccounts.id, request.twilioAccountId)).limit(1);
  const [service] = await db.select().from(twilioMessagingServices).where(eq(twilioMessagingServices.id, request.messagingServiceId)).limit(1);
  if (!account || !service) throw new Error("The artist's Twilio resources no longer exist.");
  const [campaign] = await db.select().from(a2pCampaigns).where(eq(a2pCampaigns.messagingServiceId, service.id)).limit(1);
  const a2pApproved = process.env.TWILIO_PORT_MODE === "mock" || Boolean(campaign && ["APPROVED", "VERIFIED"].includes(campaign.status));
  const authToken = decryptSecret(account.authTokenEncrypted);
  let incomingSid = providerPhoneSid;
  if (process.env.TWILIO_PORT_MODE !== "mock") {
    const incoming = await findIncomingPhoneNumber(account.accountSid, authToken, request.phoneNumber);
    if (!incoming) return { activated: false, inventoryPending: true, a2pApproved };
    incomingSid = incoming.sid;
    await configureIncomingPhoneNumber(account.accountSid, authToken, incoming.sid, inboundUrl(), voiceUrl());
    try { await addNumberToMessagingService(account.accountSid, authToken, service.serviceSid, incoming.sid); }
    catch (error) { if (!(error instanceof Error) || !/already|exists|assigned/i.test(error.message)) throw error; }
  }
  incomingSid ||= `PN_MOCK_${request.id.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
  const [existing] = await db.select().from(phoneNumbers).where(eq(phoneNumbers.phoneNumber, request.phoneNumber)).limit(1);
  const values = { organizationId: request.organizationId, artistId: request.artistId, provider: "twilio", twilioAccountId: account.id,
    twilioPhoneNumberSid: incomingSid, twilioMessagingServiceSid: service.serviceSid, complianceStatus: a2pApproved ? "APPROVED" : "PORTED_PENDING_A2P",
    lifecycleRole: "PORTED", isPrimary: a2pApproved, active: a2pApproved, updatedAt: new Date() };
  if (existing) await db.update(phoneNumbers).set(values).where(eq(phoneNumbers.id, existing.id));
  else await db.insert(phoneNumbers).values({ ...values, phoneNumber: request.phoneNumber });
  if (a2pApproved) {
    const retireAfter = new Date(); retireAfter.setUTCDate(retireAfter.getUTCDate() + 7);
    await db.update(phoneNumbers).set({ isPrimary: false, lifecycleRole: "TEMPORARY_GRACE", retireAfter, updatedAt: new Date() }).where(and(eq(phoneNumbers.artistId, request.artistId), eq(phoneNumbers.isPrimary, true), eq(phoneNumbers.id, request.temporaryPhoneNumberId || "00000000-0000-0000-0000-000000000000")));
  }
  return { activated: a2pApproved, inventoryPending: false, a2pApproved };
}

async function handlePOST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [request] = await db.select().from(phoneNumberPortRequests).where(and(eq(phoneNumberPortRequests.id, parsed.data.requestId), eq(phoneNumberPortRequests.organizationId, parsed.data.organizationId), eq(phoneNumberPortRequests.artistId, parsed.data.artistId))).limit(1);
  if (!request) return NextResponse.json({ error: "Port request not found." }, { status: 404 });
  if (!request.providerRequestSid) return NextResponse.json({ error: "This port request has not been submitted to Twilio." }, { status: 409 });

  try {
    let requestStatus: string;
    let phoneStatus: string;
    let phoneSid = request.providerPhoneNumberSid || undefined;
    let rejectionReason: string | null = null;
    let rejectionReasonCode: string | null = null;
    let confirmedPortAt: Date | null = null;
    let payload: Record<string, unknown> = {};
    if (process.env.TWILIO_PORT_MODE === "mock") {
      const next = parsed.data.mockDecision === "COMPLETE" ? "COMPLETED" : parsed.data.mockDecision === "ACTION_REQUIRED" ? "ACTION_REQUIRED" : request.status === "WAITING_FOR_SIGNATURE" ? "IN_PROGRESS" : "WAITING_FOR_SIGNATURE";
      requestStatus = next; phoneStatus = next === "ACTION_REQUIRED" ? "PORT_REJECTED" : next;
      if (next === "ACTION_REQUIRED") { rejectionReasonCode = "MOCK_001"; rejectionReason = "Mock carrier account information mismatch."; }
    } else {
      const remote = await getPortRequest(request.providerRequestSid);
      const phone = remote.phone_numbers?.find(value => value.phone_number === request.phoneNumber) || remote.phone_numbers?.[0] || {};
      requestStatus = normalizePortStatus(remote.port_in_request_status);
      phoneStatus = normalizePortStatus(phone.port_in_phone_number_status);
      phoneSid = typeof phone.port_in_phone_number_sid === "string" ? phone.port_in_phone_number_sid : phoneSid;
      rejectionReason = typeof phone.rejection_reason === "string" ? phone.rejection_reason : null;
      rejectionReasonCode = phone.rejection_reason_code ? String(phone.rejection_reason_code) : null;
      confirmedPortAt = typeof phone.port_date === "string" ? new Date(phone.port_date) : null;
      payload = { requestStatus, phoneStatus, orderCancellationReason: remote.order_cancellation_reason || null };
    }

    let finalStatus = portNeedsAction(requestStatus, phoneStatus) ? "ACTION_REQUIRED" : requestStatus;
    let activation = { activated: false, inventoryPending: false, a2pApproved: false };
    if (portIsComplete(requestStatus, phoneStatus)) {
      activation = await activatePortedNumber(request, phoneSid);
      finalStatus = activation.inventoryPending ? "COMPLETED_PENDING_INVENTORY" : "COMPLETED";
    }
    const [updated] = await db.update(phoneNumberPortRequests).set({ status: finalStatus, providerPhoneNumberSid: phoneSid, rejectionReason, rejectionReasonCode,
      confirmedPortAt, providerPayload: payload, completedAt: finalStatus === "COMPLETED" ? new Date() : null, lastStatusCheckedAt: new Date(), updatedAt: new Date() }).where(eq(phoneNumberPortRequests.id, request.id)).returning();
    await db.insert(complianceEvents).values({ organizationId: request.organizationId, phase: "PORTING", action: "SYNC", status: finalStatus, providerSid: request.providerRequestSid, details: { phoneStatus, activated: activation.activated } });
    return NextResponse.json({ request: safe(updated), phoneStatus, activation, message: activation.inventoryPending ? "Twilio completed the port, but the number is not visible in inventory yet. Sync again shortly." : finalStatus === "COMPLETED" && !activation.a2pApproved ? "Port complete. The number will become primary after A2P campaign approval." : finalStatus === "COMPLETED" ? "Port complete. The existing business number is now primary." : finalStatus === "ACTION_REQUIRED" ? "The carrier rejected part of the request. Correct the listed information before resubmitting." : "Port status synchronized." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to synchronize port status." }, { status: 502 });
  }
}

export const POST = protectedRoute(handlePOST, true);
