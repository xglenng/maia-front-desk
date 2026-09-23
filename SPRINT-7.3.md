# Sprint 7.3 — Per-artist booking and SMS consent evidence

Sprint 7.3 closes the A2P opt-in evidence gap. Every provisioned artist must have a verified consent workflow before the app can submit that artist's Twilio campaign or activate messaging. The preferred workflow for studios that begin with text consultations is client-initiated customer care followed by an explicit YES confirmation before booking-related messages.

## Included

- A public per-artist booking/inquiry URL at `/book/{organization-slug}/{form-slug}`.
- A separate SMS consent checkbox that is visible, optional, and unchecked by default.
- Booking submission works when SMS consent is not selected.
- Exact disclosure text with message purpose, variable frequency, message/data rates, STOP, HELP, and “not a condition of purchase” language.
- Public Privacy Policy and Terms links beside the checkbox.
- Immutable consent evidence containing the checked/unchecked choice, exact disclosure and version, legal document versions, phone number, source URL, timestamp, IP address, and user agent.
- Unchecked submissions never revoke an earlier valid opt-in and never create a new opt-in.
- Owner setup at **Settings → SMS consent workflow**.
- Verified external-form mode with a rotatable bearer token for consent-event ingestion.
- A new activation gate that blocks campaign submission and studio activation until the artist's consent workflow is ready.
- Per-artist Twilio campaign message flow generated from the artist's exact public form or call-to-action URL.
- An `INBOUND_SMS_CONFIRMATION` mode for studios where clients text first and complete Jotform only after booking.
- New inbound clients remain `INBOUND_ONLY`: Maia may answer their questions but cannot create a booking hold or send deposit, reminder, or waiver links.
- When a client clearly decides to book, Maia sends the studio-specific confirmation disclosure and waits for a separate `YES`.
- An affirmative `YES` stores the phone, timestamp, exact disclosure/version, public call-to-action URL, Twilio Message SID, studio number, legal-page versions, and affirmative reply.
- `STOP` changes the client to `OPTED_OUT`; later automated or manual outbound messaging remains blocked until `START` or a new affirmative confirmation.

## Upgrade

```bash
npm ci
npm run db:push
npm run typecheck
npm test
npm run build
npm run dev
```

`npm run db:push` creates `artist_consent_forms`, `booking_inquiries`, and `sms_consent_evidence`. This updated package also adds consent-status and captured-at fields to `clients`, plus public call-to-action, verification, and confirmation-text fields to `artist_consent_forms`.

## Required URL setting

Local development:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Production must use the canonical public HTTPS origin:

```env
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
```

The hosted booking page and both legal-page URLs must be publicly reachable without signing in before the campaign is submitted to Twilio.

## Client-initiated SMS + YES test

1. Sign in as the studio owner.
2. Open **Settings → SMS consent workflow**.
3. Select the artist and choose **Client texts first, then replies YES**.
4. Enter the public HTTPS page that displays the shop number, SMS purpose, variable frequency, message/data rates, STOP, HELP, consent-not-required wording, Privacy Policy, and Terms.
5. Verify the public page in a signed-out browser, check the attestation, and save.
6. From a new test phone, text an ordinary pricing question. Confirm Maia answers it but the client remains in inbound-only status.
7. Text `I am ready to book`. Confirm Maia sends the exact YES request instead of creating a hold or sending a link.
8. Reply `YES`. Confirm Maia acknowledges the opt-in and the client becomes eligible for booking-related messages.
9. Complete a test booking and confirm deposit/reminder/Jotform links are available only after the YES response.
10. Reply `STOP` and confirm later outbound sends are blocked.

## Hosted-form test

1. Sign in as the studio owner.
2. Open **Settings → SMS consent workflow**.
3. Select an artist and keep **Hosted booking form** selected.
4. Save, then open the displayed public URL in a private browser window.
5. Submit once with the SMS checkbox unchecked. Confirm the inquiry succeeds and the client is not SMS opted in.
6. Submit with another phone number and explicitly check the SMS box. Confirm the inquiry succeeds and the client becomes SMS opted in.
7. Open **Guided studio activation**. The artist's **Verified SMS consent workflow** step should be approved.
8. Open **SMS campaign registration**. Confirm the artist and exact opt-in URL appear under **Customer opt-in evidence**.

## External-form mode

Use external mode only after verifying that the third-party page:

- has a separate checkbox that is not preselected;
- shows the complete studio-specific disclosure beside the checkbox;
- links to the published Privacy Policy and Terms;
- allows the inquiry/booking to be submitted without SMS consent; and
- records the customer's choice and evidence.

After saving the attestation, create an integration token. The third-party automation must send a JSON POST to the displayed endpoint with either `Authorization: Bearer {token}` or `x-consent-token: {token}`. Supported fields are `firstName`, `lastName`, `email`, `phone`, `consented`, `externalSubmissionId`, and `metadata`.

## Twilio resubmission

Before resubmitting a rejected campaign, verify the public form in a signed-out browser and make sure `NEXT_PUBLIC_APP_URL` is the same stable HTTPS hostname represented in the submitted opt-in flow. Save the campaign intake again so its message-flow preview is refreshed, then submit. Carrier approval is external and cannot be guaranteed; keep screenshots and the stored evidence available for review.

For `INBOUND_SMS_CONFIRMATION`, saving the campaign intake automatically generates the two-stage campaign description, message flow, `YES`/`START` keywords, consent-request sample, appointment/Jotform sample, and embedded-link declaration. The Jotform remains a day-of-appointment waiver and is not represented as the original SMS opt-in source.
