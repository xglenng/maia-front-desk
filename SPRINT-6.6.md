# Sprint 6.6 — Live Twilio A2P registration

This checkpoint replaces the mock-only compliance submission with a resumable live Twilio Trust Hub and A2P 10DLC workflow.

## What changed

- Creates and submits the secondary Customer Profile and its business, authorized-representative, and address entities.
- Advances an approved Customer Profile through the A2P Messaging Profile, Brand, and Messaging Service campaign stages.
- Persists every Twilio SID immediately so a failed or interrupted request can resume without duplicating completed resources.
- Shows provider errors, current phase, and an owner-only registration audit history.
- Keeps real phone numbers inactive for outbound SMS until their corresponding campaign is approved.
- Keeps the existing mock workflow for local testing when `TWILIO_COMPLIANCE_MODE=mock`.

## Required production configuration

Keep the existing Twilio and encryption settings, and add:

```dotenv
TWILIO_COMPLIANCE_MODE=live
TWILIO_PRIMARY_CUSTOMER_PROFILE_SID=BUxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

`TWILIO_PRIMARY_CUSTOMER_PROFILE_SID` must be the Twilio-approved Primary Business Profile for the parent account, classified as an ISV/Reseller/Partner. The two policy SIDs use Twilio's published defaults and can be overridden if Twilio directs you to use different policies:

```dotenv
TWILIO_CUSTOMER_PROFILE_POLICY_SID=RNdfbf3fae0e1107f8aded0e7cead80bf5
TWILIO_A2P_PROFILE_POLICY_SID=RNb0d4771c2c98518d916a3d4cd70a8f8b
```

Also retain:

```dotenv
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_ENCRYPTION_KEY=<base64-encoded 32-byte key>
COMPLIANCE_ENCRYPTION_KEY=<base64-encoded 32-byte key>
TWILIO_WEBHOOK_BASE_URL=https://your-public-domain.example
```

Do not rotate either encryption key after encrypted records exist unless you first implement a key-rotation migration.

## Upgrade and run

```bash
npm ci
npm run db:push
npm run typecheck
npm test
npm run build
npm run dev
```

Sign in as the owner, provision the real Twilio number, then open **Owner settings → A2P campaign registration**. Complete the new address and representative fields, save, and choose **Start live registration**. Use **Sync Twilio status** after each Twilio review completes; each sync advances the next eligible stage.

## Operational behavior

- `CUSTOMER_PROFILE_PENDING`, `A2P_PROFILE_PENDING`, `BRAND_PENDING`, and `CAMPAIGN_PENDING` mean Twilio or the carrier is still reviewing that stage.
- A rejected stage displays Twilio's returned errors. Correct the business data and resolve the listed issue in Twilio before retrying or syncing.
- `APPROVED` activates outbound SMS for all approved studio Messaging Services.
- The app returns HTTP 409 for outbound SMS until the selected number has `APPROVED` or `MOCK_APPROVED` compliance status.

Twilio registration can create fees and external resources. Test the UI with mock mode first, then use live mode only with the intended production Twilio account.
