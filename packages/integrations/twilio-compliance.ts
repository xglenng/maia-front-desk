type TwilioObject = Record<string, unknown> & { sid: string; status?: string; errors?: unknown };

function auth(accountSid: string, authToken: string) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

async function request<T>(input: { base: string; path: string; accountSid: string; authToken: string; method?: string; form?: Record<string, string>; apiVersion?: string }) {
  const headers: Record<string, string> = { Authorization: auth(input.accountSid, input.authToken) };
  if (input.apiVersion) headers["X-Twilio-Api-Version"] = input.apiVersion;
  let body: URLSearchParams | undefined;
  if (input.form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(input.form); }
  const response = await fetch(`${input.base}${input.path}`, { method: input.method || "GET", headers, body });
  const text = await response.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) {
    const value = data as { message?: string; code?: number; details?: unknown };
    const error = new Error(value.message || `Twilio API returned ${response.status}.`) as Error & { provider?: unknown };
    error.provider = { status: response.status, code: value.code, details: value.details };
    throw error;
  }
  return data as T;
}

const trust = "https://trusthub.twilio.com";
const messaging = "https://messaging.twilio.com";
const api = "https://api.twilio.com";

export type TwilioCredentials = { accountSid: string; authToken: string };

export const CUSTOMER_PROFILE_POLICY_SID = process.env.TWILIO_CUSTOMER_PROFILE_POLICY_SID || "RNdfbf3fae0e1107f8aded0e7cead80bf5";
export const A2P_PROFILE_POLICY_SID = process.env.TWILIO_A2P_PROFILE_POLICY_SID || "RNb0d4771c2c98518d916a3d4cd70a8f8b";

export function createCustomerProfile(credentials: TwilioCredentials, input: { friendlyName: string; email: string }) {
  return request<TwilioObject>({ base: trust, path: "/v1/CustomerProfiles", ...credentials, method: "POST", form: { FriendlyName: input.friendlyName, Email: input.email, PolicySid: CUSTOMER_PROFILE_POLICY_SID } });
}

export function getCustomerProfile(credentials: TwilioCredentials, sid: string) {
  return request<TwilioObject>({ base: trust, path: `/v1/CustomerProfiles/${encodeURIComponent(sid)}`, ...credentials });
}

export function submitCustomerProfile(credentials: TwilioCredentials, sid: string) {
  return request<TwilioObject>({ base: trust, path: `/v1/CustomerProfiles/${encodeURIComponent(sid)}`, ...credentials, method: "POST", form: { Status: "pending-review" } });
}

export function createEndUser(credentials: TwilioCredentials, input: { friendlyName: string; type: string; attributes: Record<string, unknown> }) {
  return request<TwilioObject>({ base: trust, path: "/v1/EndUsers", ...credentials, method: "POST", form: { FriendlyName: input.friendlyName, Type: input.type, Attributes: JSON.stringify(input.attributes) } });
}

export function createAddress(credentials: TwilioCredentials, input: { customerName: string; street: string; streetSecondary?: string; city: string; region: string; postalCode: string; isoCountry: string }) {
  return request<TwilioObject>({ base: api, path: `/2010-04-01/Accounts/${encodeURIComponent(credentials.accountSid)}/Addresses.json`, ...credentials, method: "POST", form: { CustomerName: input.customerName, Street: input.street, ...(input.streetSecondary ? { StreetSecondary: input.streetSecondary } : {}), City: input.city, Region: input.region, PostalCode: input.postalCode, IsoCountry: input.isoCountry, EmergencyEnabled: "false" } });
}

export function createSupportingDocument(credentials: TwilioCredentials, input: { friendlyName: string; addressSid: string }) {
  return request<TwilioObject>({ base: trust, path: "/v1/SupportingDocuments", ...credentials, method: "POST", form: { FriendlyName: input.friendlyName, Type: "customer_profile_address", Attributes: JSON.stringify({ address_sids: input.addressSid }) } });
}

export function assignCustomerProfileEntity(credentials: TwilioCredentials, profileSid: string, objectSid: string) {
  return request<TwilioObject>({ base: trust, path: `/v1/CustomerProfiles/${encodeURIComponent(profileSid)}/EntityAssignments`, ...credentials, method: "POST", form: { ObjectSid: objectSid } });
}

export function evaluateCustomerProfile(credentials: TwilioCredentials, profileSid: string) {
  return request<TwilioObject>({ base: trust, path: `/v1/CustomerProfiles/${encodeURIComponent(profileSid)}/Evaluations`, ...credentials, method: "POST", form: { PolicySid: CUSTOMER_PROFILE_POLICY_SID } });
}

export function createTrustProduct(credentials: TwilioCredentials, input: { friendlyName: string; email: string }) {
  return request<TwilioObject>({ base: trust, path: "/v1/TrustProducts", ...credentials, method: "POST", form: { FriendlyName: input.friendlyName, Email: input.email, PolicySid: A2P_PROFILE_POLICY_SID } });
}

export function getTrustProduct(credentials: TwilioCredentials, sid: string) {
  return request<TwilioObject>({ base: trust, path: `/v1/TrustProducts/${encodeURIComponent(sid)}`, ...credentials });
}

export function assignTrustProductEntity(credentials: TwilioCredentials, trustProductSid: string, objectSid: string) {
  return request<TwilioObject>({ base: trust, path: `/v1/TrustProducts/${encodeURIComponent(trustProductSid)}/EntityAssignments`, ...credentials, method: "POST", form: { ObjectSid: objectSid } });
}

export function evaluateTrustProduct(credentials: TwilioCredentials, trustProductSid: string) {
  return request<TwilioObject>({ base: trust, path: `/v1/TrustProducts/${encodeURIComponent(trustProductSid)}/Evaluations`, ...credentials, method: "POST", form: { PolicySid: A2P_PROFILE_POLICY_SID } });
}

export function submitTrustProduct(credentials: TwilioCredentials, sid: string) {
  return request<TwilioObject>({ base: trust, path: `/v1/TrustProducts/${encodeURIComponent(sid)}`, ...credentials, method: "POST", form: { Status: "pending-review" } });
}

export function createBrand(credentials: TwilioCredentials, input: { customerProfileSid: string; trustProductSid: string; brandType: string }) {
  return request<TwilioObject>({ base: messaging, path: "/v1/a2p/BrandRegistrations", ...credentials, method: "POST", form: { CustomerProfileBundleSid: input.customerProfileSid, A2PProfileBundleSid: input.trustProductSid, BrandType: input.brandType } });
}

export function getBrand(credentials: TwilioCredentials, sid: string) {
  return request<TwilioObject>({ base: messaging, path: `/v1/a2p/BrandRegistrations/${encodeURIComponent(sid)}`, ...credentials });
}

export function createCampaign(credentials: TwilioCredentials, input: { serviceSid: string; brandSid: string; description: string; messageFlow: string; samples: string[]; useCase: string; hasLinks: boolean; hasPhoneNumbers: boolean; privacyUrl: string; termsUrl: string }) {
  const form: Record<string, string> = { BrandRegistrationSid: input.brandSid, Description: input.description, MessageFlow: input.messageFlow, UsAppToPersonUsecase: input.useCase, HasEmbeddedLinks: String(input.hasLinks), HasEmbeddedPhone: String(input.hasPhoneNumbers), PrivacyPolicyUrl: input.privacyUrl, TermsAndConditionsUrl: input.termsUrl };
  input.samples.forEach((sample, index) => { form[`MessageSamples[${index}]`] = sample; });
  return request<TwilioObject>({ base: messaging, path: `/v1/Services/${encodeURIComponent(input.serviceSid)}/Compliance/Usa2p`, ...credentials, method: "POST", form, apiVersion: "v1.2" });
}

export function getCampaign(credentials: TwilioCredentials, serviceSid: string, campaignSid: string) {
  return request<TwilioObject>({ base: messaging, path: `/v1/Services/${encodeURIComponent(serviceSid)}/Compliance/Usa2p/${encodeURIComponent(campaignSid)}`, ...credentials, apiVersion: "v1.2" });
}
