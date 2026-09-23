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

export function generatePrivacyPolicy(input: LegalPageInput) {
  const date = input.effectiveDate ?? new Date().toISOString().slice(0, 10);
  return `# Privacy Policy

**Effective date:** ${date}

${clean(input.businessName)} ("we," "us," or "our") provides tattoo inquiry, scheduling, messaging, payment, and related services. Our public website is ${clean(input.websiteUrl)}.

## Information we collect
We may collect information you provide when you contact us or request an appointment, including your name, email address, phone number, tattoo inquiry details, reference information, appointment details, messages, payment and deposit status, waiver information, and communication preferences. We may also collect technical information needed to operate and secure our services.

## How we use information
We use information to respond to inquiries, communicate with clients, evaluate tattoo requests, coordinate appointments, process deposits and payments, send waivers and appointment reminders, provide service and aftercare information, prevent fraud and abuse, maintain records, and comply with legal obligations.

## SMS messaging
If you opt in to receive text messages, we may send appointment-related and other service-related messages. Message frequency varies. Message and data rates may apply. You can reply STOP to opt out, START to resume, or HELP for help. Consent to receive SMS is not a condition of purchasing tattoo services.

## Service providers
We may use trusted service providers for functions such as messaging, scheduling, payments, hosting, analytics, security, and customer support. Those providers receive information only as reasonably necessary to provide their services or comply with legal requirements.

## Information sharing and sale
We do not sell personal information for monetary consideration. We may disclose information when necessary to provide requested services, protect our rights or users, prevent fraud or abuse, comply with law, or respond to valid legal process.

## Data retention and security
We retain information for as long as reasonably necessary for the purposes described in this policy, including appointment, business, legal, and accounting requirements. We use reasonable administrative, technical, and organizational safeguards, but no internet transmission or storage system can be guaranteed to be completely secure.

## Your choices
You may contact us to request access to or correction of information we maintain about you, subject to applicable law and reasonable verification requirements. You may opt out of SMS by replying STOP. Opting out of service messages may affect our ability to communicate about an appointment.

## Children
Our services are not directed to children under the age required by applicable law. We do not knowingly collect personal information from children in violation of applicable law.

## Changes to this policy
We may update this policy from time to time. The version published on this page is the version currently in effect. Material changes will be reflected by an updated effective date.

## Contact
${clean(input.businessName)}
${clean(input.businessAddress)}
${clean(input.contactEmail)}
`;
}

export function generateTerms(input: LegalPageInput) {
  const date = input.effectiveDate ?? new Date().toISOString().slice(0, 10);
  return `# Terms and Conditions

**Effective date:** ${date}

These Terms and Conditions govern your use of the tattoo inquiry, scheduling, messaging, payment, waiver, and related services provided by ${clean(input.businessName)} through ${clean(input.websiteUrl)}.

## Using the service
You agree to provide accurate information and to use our services lawfully. Appointment requests, messages, and other submissions should contain information that is reasonably accurate and relevant to the requested service.

## Tattoo requests and artist approval
Submitting a tattoo inquiry or requesting a time does not by itself guarantee that an artist will accept the design or appointment. Tattoo designs, placement, timing, pricing, and other details may require artist review and approval.

## Appointments
An appointment is confirmed only when the applicable booking system or artist confirms the appointment and any required deposit has been successfully received. Availability shown or communicated by an automated assistant is subject to final system confirmation.

## Deposits, cancellations, and rescheduling
Deposits, cancellation terms, rescheduling requirements, refunds, and no-show policies are determined by the applicable artist or studio policies presented during booking. A deposit may be required before an appointment is confirmed.

## Payments
Payments and deposits may be processed by third-party payment providers. Their terms and privacy policies may also apply. We do not consider an appointment paid or confirmed solely because a payment page was opened; payment status must be successfully verified by the applicable payment provider and booking system.

## SMS messaging
If you opt in to SMS, you agree to receive appointment and service-related text messages. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, START to resume, or HELP for help. Consent is not a condition of purchase.

## Automated assistance
Our service may use automated technology, including AI, to help answer questions, collect tattoo inquiry details, communicate appointment information, and perform other administrative tasks. Automated responses do not replace artist judgment. Requests may be escalated to a human when appropriate.

## Intellectual property
The service, its software, branding, and related materials are protected by applicable intellectual property laws. You may not copy, reverse engineer, misuse, or interfere with the service except as permitted by law.

## Disclaimer
The service is provided for administrative and communication purposes. We do not guarantee uninterrupted availability or that every inquiry, appointment request, or automated response will be error-free. Tattoo services themselves remain subject to the artist's professional judgment and applicable studio policies.

## Limitation of liability
To the extent permitted by applicable law, ${clean(input.businessName)} will not be liable for indirect, incidental, special, consequential, or punitive damages arising from use of the communication or scheduling service. Nothing in these Terms limits liability that cannot lawfully be limited or excluded.

## Changes
We may update these Terms from time to time. The version published on this page is the version currently in effect. Material changes will be reflected by an updated effective date.

## Contact
${clean(input.businessName)}
${clean(input.businessAddress)}
${clean(input.contactEmail)}
`;
}
