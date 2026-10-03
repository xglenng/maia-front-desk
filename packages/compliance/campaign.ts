import {
  assertPublicHttpsUrl,
  campaignMessageFlow,
  helpResponse,
  inboundCampaignDescription,
  inboundSampleMessages,
  optOutConfirmation,
} from "@/packages/consent";

export type CampaignProfile = {
  businessName: string;
  campaignDescription?: string | null;
  sampleMessages?: unknown;
  campaignUseCase?: string | null;
  hasEmbeddedLinks?: boolean | null;
  hasEmbeddedPhoneNumbers?: boolean | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  websiteUrl?: string | null;
  privacyPolicyUrl?: string | null;
  termsUrl?: string | null;
};

export type CampaignConsentSurface = {
  mode: string;
  publicUrl: string;
  helpPhone?: string | null;
};

export function assertCampaignPublicUrls(profile: CampaignProfile, consentUrl: string, appUrl: string) {
  assertPublicHttpsUrl(appUrl, "NEXT_PUBLIC_APP_URL");
  const urls: Array<[string, string | null | undefined]> = [
    ["Business website", profile.websiteUrl],
    ["Privacy Policy", profile.privacyPolicyUrl],
    ["Terms & Conditions", profile.termsUrl],
    ["Public SMS consent URL", consentUrl],
  ];
  for (const [label, value] of urls) {
    if (!value) throw new Error(`${label} URL is missing.`);
    assertPublicHttpsUrl(value, label);
  }
}

export function campaignPreview(profile: CampaignProfile, surface: CampaignConsentSurface) {
  const inbound = surface.mode === "INBOUND_SMS_CONFIRMATION";
  const savedSamples = Array.isArray(profile.sampleMessages)
    ? profile.sampleMessages.filter((sample): sample is string => typeof sample === "string" && Boolean(sample.trim()))
    : [];
  const standardSamples = [
    `${profile.businessName}: Thanks for contacting us. We received your request. Reply STOP to opt out or HELP for help.`,
    `${profile.businessName}: Your appointment request was received. We will follow up shortly. Reply STOP to opt out or HELP for help.`
  ];
  const helpMessage = helpResponse(profile.businessName, {
    email: profile.contactEmail,
    website: profile.websiteUrl,
    phone: surface.helpPhone || profile.contactPhone,
  });
  const supportUsesWebsite = !profile.contactEmail?.trim() && Boolean(profile.websiteUrl?.trim());
  const supportUsesPhone = !profile.contactEmail?.trim() && !profile.websiteUrl?.trim() && Boolean(surface.helpPhone || profile.contactPhone);
  const optOutMessage = optOutConfirmation(profile.businessName);

  return {
    description: inbound
      ? inboundCampaignDescription(profile.businessName)
      : profile.campaignDescription || `${profile.businessName} sends customer-care and appointment-related messages to people who affirmatively opt in by checking the optional box on its booking or inquiry form. The checked box records consent; a second YES reply is not required.`,
    messageFlow: campaignMessageFlow(profile.businessName, surface.publicUrl, surface.mode, { helpMessage, optOutMessage }),
    samples: inbound ? inboundSampleMessages(profile.businessName) : savedSamples.length >= 2 ? savedSamples : standardSamples,
    useCase: profile.campaignUseCase || "CUSTOMER_CARE",
    hasEmbeddedLinks: inbound || Boolean(profile.hasEmbeddedLinks) || supportUsesWebsite,
    hasEmbeddedPhone: Boolean(profile.hasEmbeddedPhoneNumbers) || supportUsesPhone,
    privacyUrl: profile.privacyPolicyUrl || "",
    termsUrl: profile.termsUrl || "",
    optInKeywords: inbound ? ["YES", "START", "UNSTOP"] : ["START", "UNSTOP"],
    helpMessage,
    optOutMessage,
    publicUrl: surface.publicUrl,
    consentMode: surface.mode,
  };
}