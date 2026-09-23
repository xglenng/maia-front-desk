# Sprint 7.0 — Provider-neutral digital waivers

Sprint 7.0 adds an owner-managed waiver workflow without locking studios into one form vendor. Jotform is the first full adapter; any provider with a public form URL can be used through the custom-link fallback.

## Included

- Owner-only **Waiver providers** screen at `/waivers`.
- Encrypted Jotform API credentials with Standard, EU, and HIPAA API-region support.
- Jotform form import and resynchronization.
- Custom public-form links for Jotform competitors.
- Form routing by service, artist, adult/minor audience, and priority.
- Appointment-based waiver delivery using each studio's provisioned Twilio sender.
- A unique opaque tracking token on every sent waiver link.
- Automatic Jotform completion through a secret webhook and authoritative submission lookup.
- Manual completion for custom providers that do not have an adapter.
- A 24-hour pre-appointment SMS reminder that is cancelled after completion, review, or voiding.
- Completion and review audit events.
- No waiver answers or medical answers are copied into this application. Jotform remains the source of truth for submitted form contents.

## Upgrade

```bash
npm ci
npm run db:push
npm run typecheck
npm test
npm run build
npm run dev
```

`npm run db:push` creates the waiver-provider connections, external forms, assignments, and audit-event tables.

## Required configuration

```env
# Canonical public HTTPS application URL in production
NEXT_PUBLIC_APP_URL=https://your-app.example.com

# Base64-encoded 32-byte key. The existing Twilio key is accepted as a fallback,
# but a dedicated compliance key is recommended.
COMPLIANCE_ENCRYPTION_KEY=

# Existing tenant Twilio provisioning configuration is still required for SMS.
TWILIO_ENCRYPTION_KEY=
TWILIO_WEBHOOK_BASE_URL=https://your-app.example.com

# Existing automation runner secret used for waiver reminders.
AUTOMATION_CRON_SECRET=
```

Generate an encryption key with:

```bash
openssl rand -base64 32
```

Do not put a Jotform API key in `.env`. An owner enters it on `/waivers`; the server encrypts it before storing it and never returns it to the browser.

## Jotform setup

1. In Jotform, create or identify the tattoo, piercing, minor, and other consent forms the studio actually uses.
2. Add a hidden field to every connected form. Its unique name must be exactly `waiverToken`.
3. In this app, sign in as the studio owner and open **Owner settings → Waiver providers**.
4. Select the account's correct Jotform API region and enter a Jotform API key with access to the forms.
5. Copy the one-time webhook URL returned by the app into every imported Jotform's webhook integration.
6. Map each imported form to its audience, artist, service, and priority. Mark forms that collect medical data.
7. If the webhook URL is lost or exposed, click **New webhook URL**, replace the old URL on every form, and remove the old Jotform webhook. Rotation invalidates the prior URL immediately.

Use the HIPAA API region only when the Jotform account and forms are configured for Jotform's HIPAA features. This software does not make a form, account, or business HIPAA compliant by itself.

## Safe pilot test

1. Use a non-production Jotform form and a test client who has explicitly opted into SMS.
2. Create an upcoming test appointment with a client birth date, service, artist, and mobile number.
3. On `/waivers`, verify the form routing rule and click **Send waiver** with **Auto-select form**.
4. Confirm the client receives a studio-branded SMS and that the URL contains a `waiverToken` query parameter.
5. Submit the Jotform. Refresh `/waivers` and confirm the assignment changes to **COMPLETED**.
6. Click **Mark reviewed** after verifying the completed submission in Jotform.
7. Repeat with an adult form, a minor form, and one artist- or service-specific form.
8. Add a custom-provider URL, send it, and confirm its status can be marked complete manually.
9. Confirm clients without SMS consent cannot be sent a waiver from the screen.

Keep the pilot limited to Embellished Studios and test contacts until form routing, webhook completion, and the studio's retention/privacy practices have been reviewed. This feature manages delivery and status; it is not legal advice and does not determine which consent documents a studio is required to use.

## Provider behavior

| Provider | Import/sync | Tracked delivery | Automatic completion | Submission contents |
|---|---:|---:|---:|---|
| Jotform | Yes | Yes | Yes, by verified webhook | Remain in Jotform |
| Custom public link | Manual setup | Yes | No; owner marks complete | Remain with provider |

Additional vendors can be added behind the same provider adapter without changing form routing or appointment delivery.

