export type A2pRegistrationInput = {
  businessName?: string | null;
  businessAddress?: string | null;
  websiteUrl?: string | null;
  contactEmail?: string | null;
  privacyPolicyUrl?: string | null;
  termsUrl?: string | null;
  legalPagesAcceptedAt?: Date | null;
  businessType?: string | null;
  businessRegistrationNumberEncrypted?: string | null;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactPhone?: string | null;
  representativeBusinessTitle?: string | null;
  representativeJobPosition?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  industry?: string | null;
  campaignUseCase?: string | null;
  campaignDescription?: string | null;
  messageFlow?: string | null;
  sampleMessages?: unknown;
  optInKeywords?: unknown;
  helpMessage?: string | null;
  optOutMessage?: string | null;
  subscriberOptIn?: boolean | null;
  consentFormReady?: boolean | null;
};

export const REQUIRED_A2P_FIELDS: Array<[keyof A2pRegistrationInput, string]> = [
  ["businessName", "Business name"], ["businessAddress", "Business address"],
  ["websiteUrl", "Website URL"], ["contactEmail", "Contact email"],
  ["privacyPolicyUrl", "Published Privacy Policy"], ["termsUrl", "Published Terms"],
  ["legalPagesAcceptedAt", "Legal-page approval"], ["businessType", "Business type"],
  ["businessRegistrationNumberEncrypted", "EIN or business registration number"],
  ["contactFirstName", "Contact first name"], ["contactLastName", "Contact last name"],
  ["contactPhone", "Contact phone"], ["industry", "Industry"],
  ["representativeBusinessTitle", "Authorized representative title"],
  ["representativeJobPosition", "Authorized representative job position"],
  ["addressLine1", "Street address"], ["city", "City"], ["region", "State / region"],
  ["postalCode", "Postal code"],
  ["campaignUseCase", "Campaign use case"], ["campaignDescription", "Campaign description"],
  ["messageFlow", "Opt-in message flow"], ["helpMessage", "HELP response"],
  ["optOutMessage", "STOP response"]
];

export function registrationReadiness(profile: A2pRegistrationInput) {
  const missing = REQUIRED_A2P_FIELDS.filter(([key]) => !profile[key]).map(([, label]) => label);
  const samples = Array.isArray(profile.sampleMessages) ? profile.sampleMessages.filter(Boolean) : [];
  const keywords = Array.isArray(profile.optInKeywords) ? profile.optInKeywords.filter(Boolean) : [];
  if (samples.length < 2) missing.push("At least two sample messages");
  if (keywords.length < 1) missing.push("At least one opt-in keyword");
  if (!profile.subscriberOptIn) missing.push("Subscriber opt-in confirmation");
  if (!profile.consentFormReady) missing.push("Verified public SMS opt-in form for every provisioned artist");
  return { ready: missing.length === 0, missing, completed: REQUIRED_A2P_FIELDS.length + 4 - missing.length, total: REQUIRED_A2P_FIELDS.length + 4 };
}
