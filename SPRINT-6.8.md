# Sprint 6.8 — Guided studio activation

Sprint 6.8 turns the separate legal, A2P, Twilio provisioning, porting, and testing screens into one owner-only production checklist.

## Included

- A guided `/onboarding` screen linked from both the dashboard and Owner settings.
- Per-artist progress with the agreed status labels: Not Started, In Progress, Pending Approval, Approved, and Action Required.
- A safe choice between using a Twilio number and porting an existing business number.
- Automatic readiness checks for the business profile, published legal pages, active primary number, and A2P approval.
- Automatic detection of live inbound and outbound SMS tests for the current primary number.
- A guided outbound test that only lists opted-in clients and includes the business name plus STOP language.
- Required manual voice-forwarding verification after an existing-number port completes.
- Explicit final activation; the app never ports, releases, or activates a number automatically.
- An activation audit trail and regression detection if a live studio later loses a required gate.
- Self-repair for partially provisioned mock Twilio setups, so an existing account without a phone number no longer gets stuck at `already_provisioned`.
- Digits-only mock E.164 phone numbers plus automatic repair of mock numbers previously generated with UUID letters.

## Upgrade

```bash
npm ci
npm run db:push
npm run typecheck
npm test
npm run build
npm run dev
```

`npm run db:push` creates `studio_activations` and `studio_activation_events`.

## Safe test workflow

1. Keep `TWILIO_PROVISION_MODE`, `TWILIO_COMPLIANCE_MODE`, and `TWILIO_PORT_MODE` set to `mock` while checking the workflow itself.
2. Sign in as the studio owner and open **Activation** from the dashboard.
3. Select the artist and the intended number path.
4. Complete the linked profile, legal, phone, and registration steps.
5. With a real approved test number, text `START` from an opted-in test phone. Refresh Activation to detect inbound SMS.
6. Select that opted-in test client and send the guided outbound test.
7. For a ported number, complete the port before marking the voice-forwarding test passed.
8. Activate only after every gate is green.

Do not port or release Embellished Studios' production number during workflow testing. Use the temporary number until A2P approval, inbound/outbound testing, port completion, and voice forwarding are independently verified.

## Verification

- TypeScript typecheck passes.
- 23 automated tests pass, including activation-state, mock-number, and browser-route security tests.
- Next.js production build passes with `/onboarding` and `/api/onboarding` included.
