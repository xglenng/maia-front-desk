export type LegalPageInput = {
  businessName: string;
  businessAddress: string;
  contactEmail: string;
  websiteUrl: string;
  effectiveDate?: string;
};

function clean(value: string) {
  return value.trim();
}

function displayDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  );
}

export function generatePrivacyPolicy(input: LegalPageInput) {
  const rawDate = input.effectiveDate ?? new Date().toISOString().slice(0, 10);
  const date = displayDate(rawDate);
  const businessName = clean(input.businessName);
  const businessAddress = clean(input.businessAddress);
  const contactEmail = clean(input.contactEmail);
  const websiteUrl = clean(input.websiteUrl);

  return `# ${businessName} Privacy Policy

**Effective Date: ${date}**

${businessName} ("${businessName}," "we," "us," or "our") respects your privacy. This Privacy Policy explains how we collect, use, disclose, and protect information you provide when contacting us, requesting or managing an appointment, receiving tattoo, piercing, beauty, or other services, completing forms or waivers, making payments or deposits, or communicating with us by phone, email, web, or SMS.

Our public business page is ${websiteUrl}.

## Information We Collect
We may collect information you voluntarily provide, including your name, phone number, email address, appointment or service preferences, reference information, information submitted through booking or contact forms, communications with ${businessName}, payment or deposit status, waiver information, and communication preferences.

We may also collect limited technical and transaction information reasonably necessary to operate, secure, and document our services and communications.

## How We Use Your Information
We may use your information to respond to inquiries, evaluate service requests, process appointment requests, schedule or manage appointments, communicate about deposits or payments, send required forms or waivers, provide appointment confirmations and reminders, provide customer support and service-related information, maintain business records, prevent fraud or abuse, and comply with applicable legal obligations.

## SMS/Text Messaging
If you affirmatively consent to receive text messages from ${businessName}, we may send messages related to your inquiries, appointment requests, appointment confirmations, reminders, scheduling or rescheduling, deposits or payments, required forms or waivers, and customer service.

Message frequency varies based on your interactions with ${businessName}. Message and data rates may apply.

You may opt out of SMS communications at any time by replying **STOP**. You may reply **HELP** for assistance. If supported by the messaging program, you may reply **START** to opt in again after opting out.

Consent to receive SMS messages is not a condition of purchasing goods or services.

## Mobile Information and SMS Consent
**Mobile information, including phone numbers and SMS opt-in or consent records, will not be sold, rented, or shared with third parties or affiliates for their marketing or promotional purposes. SMS opt-in data and consent will not be shared with third parties for marketing purposes.**

We may share information with service providers that help us deliver services and communications you request, such as messaging, scheduling, payment processing, hosting, security, or customer-management providers. These providers may process information only as reasonably necessary to provide services on our behalf or comply with legal requirements.

## How We Share Information
We do not sell your personal information. We may disclose information when reasonably necessary to provide requested services, operate and secure our business, comply with applicable law or valid legal process, protect our rights or customers, prevent fraud or abuse, or work with service providers acting on our behalf.

## Data Security
We use reasonable administrative, technical, and organizational safeguards designed to protect personal information. However, no electronic transmission or storage system can be guaranteed to be completely secure.

## Data Retention
We retain personal information for as long as reasonably necessary to provide services, maintain appointment, transaction, business, accounting, and legal records, satisfy applicable requirements, resolve disputes, and enforce agreements.

## Your Choices
You may request that we update or correct certain personal information by contacting ${businessName}, subject to applicable law and reasonable verification requirements.

You may opt out of text messaging at any time by replying **STOP**.

## Children
Our services are not directed to children under the age required by applicable law. We do not knowingly collect personal information from children in violation of applicable law.

## Changes to This Policy
We may update this Privacy Policy periodically. The version published on this page is the version currently in effect. Material changes will be reflected by an updated effective date.

## Contact Us
If you have questions about this Privacy Policy or how ${businessName} handles your information, contact us at:

${businessName}  
${businessAddress}  
${contactEmail}  
${websiteUrl}
`;
}

export function generateTerms(input: LegalPageInput) {
  const rawDate = input.effectiveDate ?? new Date().toISOString().slice(0, 10);
  const date = displayDate(rawDate);
  const businessName = clean(input.businessName);
  const businessAddress = clean(input.businessAddress);
  const contactEmail = clean(input.contactEmail);
  const websiteUrl = clean(input.websiteUrl);

  return `# ${businessName} Terms and Conditions

**Effective Date: ${date}**

These Terms and Conditions govern your use of ${businessName}'s service inquiry, appointment, scheduling, messaging, payment, waiver, and related services available through ${websiteUrl} and other authorized ${businessName} communication channels.

By requesting or using our services, you agree to these Terms and Conditions.

## Appointments and Services
Submitting an appointment or service request does not guarantee an appointment. Appointments are confirmed only after ${businessName} accepts the request and any applicable booking, deposit, or other requirements have been completed.

Service availability, pricing, deposits, cancellation requirements, designs, placement, timing, and other service conditions may vary depending on the requested service and provider approval.

## Deposits, Payments, Cancellations, and Rescheduling
Deposits, payment requirements, cancellation terms, rescheduling requirements, refunds, and no-show policies are determined by the applicable ${businessName} or provider policies presented during booking or otherwise communicated to you.

Payments and deposits may be processed by third-party payment providers. Their applicable terms and privacy policies may also apply.

## SMS Messaging Terms
When you affirmatively consent to receive SMS messages from ${businessName}, you may receive messages regarding:

- Responses to inquiries and customer-service conversations
- Appointment requests and scheduling
- Appointment confirmations and reminders
- Rescheduling or cancellation information
- Deposit or payment-related information
- Forms or waivers required for your appointment
- Other service-related communications associated with your interaction with ${businessName}

**Message frequency varies. Message and data rates may apply.**

You may opt out at any time by replying **STOP**. After opting out, you will no longer receive SMS messages from that messaging program unless you subsequently opt in again. If supported by the messaging program, reply **START** to resume messages.

Reply **HELP** for assistance.

Consent to receive SMS messages is not a condition of purchasing any goods or services.

Carriers are not liable for delayed or undelivered messages.

## SMS Consent and Privacy
Your SMS consent applies specifically to communications from ${businessName} associated with the messaging program for which you provided consent.

**Mobile information, including phone numbers and SMS opt-in or consent records, will not be sold, rented, or shared with third parties or affiliates for their marketing or promotional purposes. SMS opt-in data and consent will not be shared with third parties for marketing purposes.**

Additional information about how we collect, use, and protect personal information is available in the ${businessName} Privacy Policy published through ${websiteUrl}.

## Automated Assistance
${businessName} may use automated technology, including AI-assisted tools, to help answer questions, collect service-request information, communicate appointment information, and perform administrative tasks. Automated responses do not replace the professional judgment of the applicable artist or service provider, and requests may be escalated to a person when appropriate.

## Customer Responsibilities
You agree to provide reasonably accurate contact, appointment, and service information and to notify ${businessName} when relevant information changes.

You are responsible for reviewing appointment instructions, service requirements, cancellation policies, and other information provided in connection with your appointment.

## Intellectual Property
Software, branding, and other materials used to provide the online service may be protected by applicable intellectual property laws. Nothing in these Terms transfers ownership of those materials to you.

## Disclaimer
Online scheduling, messaging, and administrative tools are provided to facilitate communication and service management. We do not guarantee uninterrupted availability or that every inquiry, appointment request, or automated response will be error-free. Professional services remain subject to provider judgment and applicable studio policies.

## Limitation of Liability
To the extent permitted by applicable law, ${businessName} will not be liable for indirect, incidental, special, consequential, or punitive damages arising solely from use of the communication or scheduling service. Nothing in these Terms limits liability that cannot lawfully be limited or excluded.

## Changes to These Terms
${businessName} may update these Terms and Conditions periodically. The version published on this page is the version currently in effect. Material changes will be reflected by an updated effective date.

## Contact
Questions regarding these Terms and Conditions or the SMS messaging program may be directed to:

${businessName}  
${businessAddress}  
${contactEmail}  
${websiteUrl}
`;
}
