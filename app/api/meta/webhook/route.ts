import { after, NextRequest, NextResponse } from "next/server";
import { normalizeMetaWebhook, validateMetaSignature } from "@channels/meta";
import { processSocialInbound, recordSocialInboundFailure } from "@channels/server";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode"), token = request.nextUrl.searchParams.get("hub.verify_token"), challenge = request.nextUrl.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && challenge && token === process.env.META_VERIFY_TOKEN) return new NextResponse(challenge, { status: 200 });
  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!validateMetaSignature(raw, request.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Invalid Meta signature" }, { status: 403 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const events = normalizeMetaWebhook(payload);
  const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  for (const event of events) after(async () => { try { await processSocialInbound(event, origin); } catch (error) { console.error("Meta inbound processing failed", error); await recordSocialInboundFailure(event, error); } });
  return NextResponse.json({ received: true, events: events.length });
}
