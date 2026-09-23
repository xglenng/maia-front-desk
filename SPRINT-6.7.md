# Sprint 6.7 — Existing business number porting

Sprint 6.7 adds an owner-only workflow for moving an artist's established US business number into their Twilio subaccount without prematurely releasing the temporary testing number.

## Included

- Choice between a new temporary number and porting an existing number.
- Programmatic portability check against the artist's destination subaccount.
- Carrier account, billing address, authorized representative, transfer PIN, and requested-date intake.
- Required call-forwarding destination plus a signed Twilio voice webhook so calls continue ringing after the full voice-and-messaging port.
- PDF/JPG/PNG carrier-bill upload directly to Twilio's Documents API. The file is not persisted by this app.
- Encrypted carrier account number and PIN at rest.
- Twilio electronic Letter of Authorization status, carrier rejection reason, support-ticket number, confirmed date, and manual status synchronization.
- Completed-number discovery in the artist's Twilio inventory, webhook configuration, and Messaging Service association.
- Safe cutover: the ported number becomes primary only after its Messaging Service has approved A2P registration. The temporary number remains attached as a seven-day grace/rollback number and is never automatically released.
- Mock portability, submission, advancement, completion, and rejection controls.

## Configuration

The Porting API accepts Twilio API-key authentication. This is preferred in production:

```dotenv
TWILIO_PORTING_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PORTING_API_KEY_SECRET=your-api-key-secret
TWILIO_PORT_MODE=live
```

If the API-key variables are absent, the integration falls back to `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`. Continue to configure `TWILIO_WEBHOOK_BASE_URL`, `TWILIO_ENCRYPTION_KEY`, and the Sprint 6.6 compliance settings.

For safe local testing:

```dotenv
TWILIO_PROVISION_MODE=mock
TWILIO_COMPLIANCE_MODE=mock
TWILIO_PORT_MODE=mock
```

## Upgrade

```bash
npm ci
npm run db:push
npm run typecheck
npm test
npm run build
npm run dev
```

## Owner workflow

1. Open **Owner settings → Twilio phone setup and porting**.
2. Provision and test a temporary number.
3. Complete A2P registration.
4. Select **Port an existing number** and run the portability check.
5. Enter values exactly as printed on the current carrier bill and upload a bill dated within the last 30 days.
6. Submit the port. The authorized representative signs the electronic authorization Twilio emails within 30 days.
7. Use **Sync Twilio status** until completed. Resolve any `ACTION_REQUIRED` carrier rejection before resubmitting.
8. Test inbound/outbound SMS and voice after cutover. Do not cancel the old carrier service early, and do not release the temporary number until the grace period is complete.

## Current Twilio limitations

Twilio's Porting and Documents APIs are Public Beta and do not have a beta SLA. Automated porting supports US non-toll-free landline and mobile numbers. The carrier bill must be no more than 10 MB and dated within the last 30 days. Toll-free or manual-port cases require the appropriate Twilio Console/support workflow.
