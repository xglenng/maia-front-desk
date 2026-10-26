# Live studio onboarding

Onboarding derives Stripe mode from the server key and requires HTTPS for a live key. It does not require `MAIA_COUNTER_CARD_LIVE=true`. Card creation still requires the existing card configuration, webhook secret, explicit live flag, and a ready studio account in the same mode.

With live checkout disabled, an authenticated owner can explicitly choose **Connect live studio account** to replace a sandbox connection. The request must match the previously displayed account ID. The server uses its authenticated organization, a stable live-mode Stripe idempotency key, and a tenant-scoped compare-and-swap update. Live accounts cannot be replaced through this action. Existing sales and checkout attempt records retain their original account identifiers and are not deleted.

No schema migration is needed. Deploy the application before opening payment settings. Keep `MAIA_COUNTER_CARD_LIVE=false`, connect the live studio account, and have its authorized representative complete Stripe onboarding directly. Refresh status after returning. Enabling live checkout is a separate operational step requiring approval.

Rollback: restore the application revision with live checkout disabled. Do not restore a sandbox account over a live account or remove financial history. Once credentials change modes, unresolved sandbox sessions require the sandbox credentials for reconciliation; finish sandbox checks before switching.
