export function registrationStatus(profile: { status: string; readiness: { ready: boolean }; customerProfileStatus?: unknown }) {
  const { status } = profile;
  if (status === "APPROVED") return { title: "Registration approved", detail: "Twilio approved your SMS campaign.", error: false };
  if (status.startsWith("MOCK_")) return { title: "Test registration", detail: "This registration was simulated in Maia.", error: false };
  if (status === "CUSTOMER_PROFILE_PENDING") {
    if (["APPROVED", "TWILIO_APPROVED", "VERIFIED"].includes(String(profile.customerProfileStatus))) {
      return { title: "Action required to enable texting", detail: "Twilio approved your business profile. Texting is off until your SMS campaign is approved. Select Continue SMS registration to submit your A2P Messaging Profile to Twilio.", error: false, actionLabel: "Continue SMS registration" };
    }
    return {
      title: "Business profile in review",
      detail: "Twilio received your business profile. Campaign review comes later. Use Sync Twilio status to check for updates.",
      error: false,
    };
  }
  if (status === "A2P_PROFILE_PENDING") {
    return { title: "Messaging profile in review", detail: "Texting is still off. Use Sync Twilio status to check the profile. Once it is approved, Maia can submit your A2P Brand.", error: false };
  }
  if (status === "BRAND_PENDING") {
    return { title: "A2P Brand in review", detail: "Texting is still off. Use Sync Twilio status to check the Brand. Once it is approved, Maia can submit your Campaign.", error: false };
  }
  if (status === "CAMPAIGN_PENDING") {
    return { title: "SMS Campaign in review", detail: "Texting is still off while carriers review your Campaign. Use Sync Twilio status to check for approval and activate texting for approved senders.", error: false };
  }
  if (status.endsWith("_PENDING")) {
    return { title: "Submitted to Twilio", detail: "Your registration is in review. Use Sync Twilio status to check for updates.", error: false };
  }
  if (status === "CUSTOMER_PROFILE_REJECTED") {
    return { title: "Business details need attention", detail: "Twilio could not validate your business profile. Review your business and representative details, then submit again.", error: true };
  }
  if (status.endsWith("REJECTED") || status === "SUBMISSION_ERROR") {
    return { title: "Registration needs attention", detail: "Twilio registration could not advance. Check your registration status and contact Maia support if you need help.", error: true };
  }
  return profile.readiness.ready
    ? { title: "Ready to submit", detail: "Submit your registration to start Twilio review.", error: false }
    : { title: "Setup incomplete", detail: "Complete the remaining requirements before submitting.", error: false };
}
