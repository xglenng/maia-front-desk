export type NumberStrategy = "TEMPORARY" | "PORT_EXISTING";
export type StepStatus = "NOT_STARTED" | "IN_PROGRESS" | "PENDING_APPROVAL" | "APPROVED" | "ACTION_REQUIRED";

export type ActivationFacts = {
  profileReady: boolean;
  legalPagesReady: boolean;
  consentFormReady: boolean;
  phoneReady: boolean;
  complianceStatus?: string | null;
  numberStrategy: NumberStrategy;
  inboundSmsTested: boolean;
  outboundSmsTested: boolean;
  voiceTested: boolean;
  activated: boolean;
};

export type ActivationStep = {
  id: "profile" | "legal" | "consent" | "phone" | "registration" | "testing" | "activation";
  title: string;
  description: string;
  status: StepStatus;
  href?: string;
  required: boolean;
};

const approved = new Set(["APPROVED", "MOCK_APPROVED"]);
const pending = new Set(["CUSTOMER_PROFILE_PENDING", "A2P_PROFILE_PENDING", "BRAND_PENDING", "CAMPAIGN_PENDING", "MOCK_PENDING"]);
const rejected = new Set(["REJECTED", "CUSTOMER_PROFILE_REJECTED", "A2P_PROFILE_REJECTED", "BRAND_REJECTED", "CAMPAIGN_REJECTED", "ACTION_REQUIRED", "FAILED"]);

export function registrationStatus(value?: string | null): StepStatus {
  if (value && approved.has(value)) return "APPROVED";
  if (value && pending.has(value)) return "PENDING_APPROVAL";
  if (value && rejected.has(value)) return "ACTION_REQUIRED";
  return "NOT_STARTED";
}

export function buildActivationPlan(facts: ActivationFacts) {
  const registration = registrationStatus(facts.complianceStatus);
  const requiredTests = facts.numberStrategy === "PORT_EXISTING"
    ? [facts.inboundSmsTested, facts.outboundSmsTested, facts.voiceTested]
    : [facts.inboundSmsTested, facts.outboundSmsTested];
  const testsPassed = requiredTests.every(Boolean);
  const testsStarted = requiredTests.some(Boolean);
  const gates = [facts.profileReady, facts.legalPagesReady, facts.consentFormReady, facts.phoneReady, registration === "APPROVED", testsPassed];
  const readyToActivate = gates.every(Boolean);

  const steps: ActivationStep[] = [
    { id: "profile", title: "Studio profile", description: "Confirm the studio's public business and contact information.", status: facts.profileReady ? "APPROVED" : "NOT_STARTED", href: "/compliance", required: true },
    { id: "legal", title: "Legal pages", description: "Publish the studio's Privacy Policy and Terms pages.", status: facts.legalPagesReady ? "APPROVED" : facts.profileReady ? "IN_PROGRESS" : "NOT_STARTED", href: "/compliance", required: true },
    { id: "consent", title: "Verified SMS consent workflow", description: "Configure client-initiated texting with YES confirmation or a compliant form-based opt-in.", status: facts.consentFormReady ? "APPROVED" : facts.legalPagesReady ? "IN_PROGRESS" : "NOT_STARTED", href: "/settings/consent-forms", required: true },
    { id: "phone", title: "Studio phone number", description: facts.numberStrategy === "PORT_EXISTING" ? "Keep the temporary number active while the existing number is transferred." : "Provision a temporary or permanent Twilio number.", status: facts.phoneReady ? "APPROVED" : "NOT_STARTED", href: "/twilio", required: true },
    { id: "registration", title: "A2P campaign registration", description: "Carrier approval is required before outbound SMS is enabled.", status: registration, href: "/compliance/registration", required: true },
    { id: "testing", title: "Communication tests", description: facts.numberStrategy === "PORT_EXISTING" ? "Verify inbound SMS, outbound SMS, and voice forwarding." : "Verify inbound and outbound SMS on the selected number.", status: testsPassed ? "APPROVED" : testsStarted ? "IN_PROGRESS" : "NOT_STARTED", required: true },
    { id: "activation", title: "Studio activation", description: "Activate only after every production gate has passed.", status: facts.activated ? "APPROVED" : readyToActivate ? "IN_PROGRESS" : "NOT_STARTED", required: true }
  ];

  return {
    steps,
    readyToActivate,
    completed: steps.filter(step => step.status === "APPROVED").length,
    total: steps.length,
    missing: steps.filter(step => step.id !== "activation" && step.status !== "APPROVED").map(step => step.title)
  };
}
