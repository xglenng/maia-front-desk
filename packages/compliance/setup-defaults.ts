type SavedProfile = {
  businessName: string; businessAddress: string; contactEmail: string;
  websiteUrl: string; smsEnabled: boolean;
};
/** Defaults are suggestions only; loading this form never persists compliance data. */
export function complianceSetupDefaults(
  organization: { name: string; slug: string },
  profile: SavedProfile | null | undefined,
  legalCustomers: Array<{ legalName: string }>,
  baseUrl: string,
) {
  const hostedWebsiteUrl = `${baseUrl.replace(/\/$/, '')}/a/${encodeURIComponent(organization.slug)}`;
  const websiteUrl = profile?.websiteUrl?.trim() || hostedWebsiteUrl;
  return {
    businessName: profile?.businessName?.trim() || (legalCustomers.length === 1 ? legalCustomers[0].legalName : organization.name),
    businessAddress: profile?.businessAddress ?? '',
    contactEmail: profile?.contactEmail ?? '',
    websiteUrl,
    hasWebsite: websiteUrl.replace(/\/$/, '') !== hostedWebsiteUrl,
    smsEnabled: profile?.smsEnabled ?? true,
    hostedWebsiteUrl,
  };
}
