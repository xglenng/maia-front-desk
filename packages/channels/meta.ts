import crypto from "node:crypto";

export type SocialProvider = "FACEBOOK" | "INSTAGRAM";
export type SocialAttachment = { type: string; url?: string };
export type SocialInboundEvent = { provider: SocialProvider; externalAccountId: string; externalUserId: string; externalMessageId: string; text: string; attachments: SocialAttachment[]; timestamp: number; profileName?: string; username?: string };
export type MetaTokenHealth = {
  valid: boolean;
  accountReachable: boolean;
  subscribed: boolean;
  scopes: string[];
  missingScopes: string[];
  expiresAt: string | null;
  dataAccessExpiresAt: string | null;
  checkedAt: string;
  error?: string;
};

export class MetaApiError extends Error {
  constructor(message: string, public status: number, public code?: number, public type?: string) { super(message); }
}

const graphVersion = () => process.env.META_GRAPH_VERSION || "v23.0";
const graphBase = () => `https://graph.facebook.com/${graphVersion()}`;

export function metaOAuthUrl(state: string) {
  const appId = process.env.META_APP_ID;
  const redirectUri = process.env.META_REDIRECT_URI;
  if (!appId || !redirectUri) throw new Error("Meta OAuth is not configured.");
  const url = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "pages_show_list,pages_read_engagement,pages_messaging,instagram_basic,instagram_manage_messages");
  return url.toString();
}

async function graphJson<T>(url: string | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  let data: T & { error?: { message?: string; code?: number; type?: string } };
  try { data = await response.json() as typeof data; }
  catch { throw new MetaApiError(`Meta returned an invalid response (${response.status}).`, response.status); }
  if (!response.ok || data.error) throw new MetaApiError(data.error?.message || `Meta request failed (${response.status}).`, response.status, data.error?.code, data.error?.type);
  return data;
}

export async function exchangeMetaCode(code: string) {
  const appId = process.env.META_APP_ID, appSecret = process.env.META_APP_SECRET, redirectUri = process.env.META_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) throw new Error("Meta OAuth is not configured.");
  const url = new URL(`${graphBase()}/oauth/access_token`);
  url.search = new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }).toString();
  return graphJson<{ access_token: string; token_type?: string; expires_in?: number }>(url);
}

export async function exchangeLongLivedMetaToken(shortLivedToken: string) {
  const appId = process.env.META_APP_ID, appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Meta OAuth is not configured.");
  const url = new URL(`${graphBase()}/oauth/access_token`);
  url.search = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: shortLivedToken }).toString();
  return graphJson<{ access_token: string; token_type?: string; expires_in?: number }>(url);
}

export type MetaPage = { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string; name?: string } };
export async function listMetaPages(userToken: string) {
  const url = new URL(`${graphBase()}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username,name}");
  url.searchParams.set("access_token", userToken);
  const data = await graphJson<{ data?: MetaPage[] }>(url);
  return data.data ?? [];
}

export async function subscribeMetaPage(pageId: string, pageToken: string) {
  const url = new URL(`${graphBase()}/${encodeURIComponent(pageId)}/subscribed_apps`);
  url.searchParams.set("subscribed_fields", "messages,messaging_postbacks");
  url.searchParams.set("access_token", pageToken);
  return graphJson<{ success: boolean }>(url, { method: "POST" });
}

async function debugMetaToken(accessToken: string) {
  const appId = process.env.META_APP_ID, appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Meta OAuth is not configured.");
  const url = new URL(`${graphBase()}/debug_token`);
  url.searchParams.set("input_token", accessToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  return graphJson<{ data?: { is_valid?: boolean; scopes?: string[]; expires_at?: number; data_access_expires_at?: number } }>(url);
}

async function metaAccountReachable(accountId: string, accessToken: string) {
  const url = new URL(`${graphBase()}/${encodeURIComponent(accountId)}`);
  url.searchParams.set("fields", "id,name,username");
  url.searchParams.set("access_token", accessToken);
  await graphJson<{ id: string }>(url);
  return true;
}

async function metaPageSubscribed(pageId: string, accessToken: string) {
  const appId = process.env.META_APP_ID;
  if (!appId) throw new Error("META_APP_ID is not configured.");
  const url = new URL(`${graphBase()}/${encodeURIComponent(pageId)}/subscribed_apps`);
  url.searchParams.set("fields", "id");
  url.searchParams.set("access_token", accessToken);
  const result = await graphJson<{ data?: Array<{ id?: string }> }>(url);
  return Boolean(result.data?.some(app => app.id === appId));
}

function fromEpoch(value?: number) {
  return value && value > 0 ? new Date(value * 1000).toISOString() : null;
}

export async function inspectMetaConnection(input: { provider: SocialProvider; externalAccountId: string; pageId: string; accessToken: string }): Promise<MetaTokenHealth> {
  const checkedAt = new Date().toISOString();
  if (process.env.META_MESSAGING_MODE === "mock") return { valid: true, accountReachable: true, subscribed: true, scopes: [], missingScopes: [], expiresAt: null, dataAccessExpiresAt: null, checkedAt };
  const required = input.provider === "INSTAGRAM" ? ["instagram_basic", "instagram_manage_messages"] : ["pages_messaging"];
  try {
    const debug = await debugMetaToken(input.accessToken);
    const scopes = debug.data?.scopes ?? [];
    const missingScopes = required.filter(scope => !scopes.includes(scope));
    const [accountReachable, subscribed] = await Promise.all([
      metaAccountReachable(input.externalAccountId, input.accessToken),
      metaPageSubscribed(input.pageId, input.accessToken),
    ]);
    return {
      valid: Boolean(debug.data?.is_valid) && accountReachable && subscribed && missingScopes.length === 0,
      accountReachable,
      subscribed,
      scopes,
      missingScopes,
      expiresAt: fromEpoch(debug.data?.expires_at),
      dataAccessExpiresAt: fromEpoch(debug.data?.data_access_expires_at),
      checkedAt,
    };
  } catch (error) {
    return { valid: false, accountReachable: false, subscribed: false, scopes: [], missingScopes: required, expiresAt: null, dataAccessExpiresAt: null, checkedAt, error: error instanceof Error ? error.message : "Meta connection check failed." };
  }
}

export function isMetaAuthError(error: unknown) {
  return error instanceof MetaApiError && (error.code === 190 || error.status === 401 || error.status === 403);
}

export async function getSocialProfile(externalUserId: string, accessToken: string) {
  const url = new URL(`${graphBase()}/${encodeURIComponent(externalUserId)}`);
  url.searchParams.set("fields", "name,username");
  url.searchParams.set("access_token", accessToken);
  return graphJson<{ id: string; name?: string; username?: string }>(url);
}

export async function sendMetaMessage(input: { externalAccountId: string; recipientId: string; accessToken: string; text: string }): Promise<{ message_id?: string; recipient_id?: string; id?: string }> {
  if (process.env.META_MESSAGING_MODE === "mock") return { id: `mock_${crypto.randomUUID()}` };
  const url = new URL(`${graphBase()}/${encodeURIComponent(input.externalAccountId)}/messages`);
  url.searchParams.set("access_token", input.accessToken);
  return graphJson<{ message_id?: string; recipient_id?: string }>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: input.recipientId }, message: { text: input.text } }),
  });
}

export function validateMetaSignature(rawBody: string, signature: string | null, appSecret = process.env.META_APP_SECRET) {
  if (!appSecret || !signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex"), "hex");
  const suppliedHex = signature.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
  const supplied = Buffer.from(suppliedHex, "hex");
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export function normalizeMetaWebhook(payload: unknown): SocialInboundEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as { object?: string; entry?: Array<{ id?: string; messaging?: Array<{ sender?: { id?: string }; recipient?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: Array<{ type?: string; payload?: { url?: string } }> } }> }> };
  const provider: SocialProvider | null = root.object === "instagram" ? "INSTAGRAM" : root.object === "page" ? "FACEBOOK" : null;
  if (!provider) return [];
  const events: SocialInboundEvent[] = [];
  for (const entry of root.entry ?? []) for (const event of entry.messaging ?? []) {
    const attachments = (event.message?.attachments ?? []).map(item => ({ type: item.type || "file", ...(item.payload?.url ? { url: item.payload.url } : {}) }));
    const text = event.message?.text?.trim() || (attachments.length ? `[${attachments.map(item => item.type).join(", ")} attachment received]` : "");
    if (event.message?.is_echo || !entry.id || !event.sender?.id || !event.message?.mid || !text) continue;
    events.push({ provider, externalAccountId: entry.id, externalUserId: event.sender.id, externalMessageId: event.message.mid, text, attachments, timestamp: event.timestamp ?? Date.now() });
  }
  return events;
}

export function withinSocialReplyWindow(lastInboundAt: Date | null, now = new Date()) {
  return Boolean(lastInboundAt && now.getTime() - lastInboundAt.getTime() <= 24 * 60 * 60 * 1000);
}
