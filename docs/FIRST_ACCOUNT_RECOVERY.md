# Recover an unresolved first Twilio account attempt

The first-account flow commits an intent before contacting Twilio. An uncertain result
stays blocked to prevent duplicate accounts. A generic failure is not proof of provider
creation or rejection. Provider failures now log only a fixed phase and numeric HTTP /
Twilio codes; credentials and raw provider or database messages must never be logged.

`scripts/render-review-first-account.cjs` is a guarded, studio-specific operator tool.
It verifies the exact Render database target, Val's organization and legal customer,
the configured parent SID, and a complete authenticated GET-only Twilio inventory.
It defaults to inspection and outputs only counts and the pending attempt timestamp.

1. Run `node scripts/render-review-first-account.cjs` in the approved production environment.
2. Investigate any authentication failure before changing the attempt. No alternate
   credentials or live account creation are attempted automatically.
3. Review the report and obtain explicit approval before running with
   `MAIA_RECOVER_EMPTY_ACCOUNT_INTENT=1`. This archives the original intent and
   provider inventory in `studio_activation_events`, then removes only the exact
   unresolved studio intent in one transaction. It creates no provider resources.
4. Restore the normal start command if a one-time startup invocation was used.
5. Refresh SMS setup. A new account creation remains an explicit owner action.

Recovery refuses completed/recent intents, existing resource graphs, unverified
ownership, ambiguous provider outcomes and unexpected foreign keys. A five-minute
margin around the intent timestamp conservatively blocks recent remote accounts.
No schema migration is needed. On failure the transaction rolls back. After successful
recovery, do not restore an intent if a later creation attempt has started; use the
archived evidence for manual reconciliation rather than replaying a creation request.

Production recovery and live integration verification have NOT yet been performed.
