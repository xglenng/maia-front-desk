# Embedded invoice payments

The existing signed `/pay/invoice/[token]` URL can display Stripe Payment Element
on Maia’s domain instead of making Stripe’s hosted invoice page the primary step.
It reuses the finalized invoice’s `confirmation_secret` / existing payment intent.
No extra Checkout Session, invoice, PaymentIntent or card charge is created by the
public invoice API. The only payment confirmation occurs in Stripe.js after the
client submits the secure payment form. Maia never reads card fields.

Enable with `MAIA_INVOICE_EMBEDDED_ENABLED=true` only after sandbox validation.
`STRIPE_PUBLISHABLE_KEY` must belong to the same platform and test/live mode as
`STRIPE_SECRET_KEY`. Existing card checkout configuration and invoice.paid webhook
requirements still apply. No environment variables or live fees are changed by
this implementation. Turning the flag off restores the existing hosted-link page.

The public POST endpoint accepts the authenticated encrypted share token. It
rejects cross-origin browser requests, tampered tokens, changed payment references,
wrong organizations, changed connected accounts, wrong mode/currency/amount, and
unavailable invoices. Only a validated invoice gets a client secret. Responses are
non-cacheable and do not log tokens or payment secrets. HTML remains escaped,
non-indexable and unframeable; script/frame/connect sources are limited to Maia
and Stripe. Client secrets are never put in the initial HTML. Stripe redirect
query parameters are removed from the address bar after returning.

Invoice success is verified by retrieving the invoice from Stripe and running the
existing paid-invoice reconciliation. A submitted payment is not described as paid
while Stripe still reports the invoice open. The signed webhook remains the
background reconciliation path if a client closes their browser. Existing invoice
links and Stripe’s hosted payment page remain available as fallbacks.

Validation covers token/tenant/account isolation in disposable PostgreSQL, provider
reference checks, no duplicate payment creation, public page headers, and browser
script behavior with payment-provider doubles (decline, pending, paid, unavailable).
Build and TypeScript must pass. An actual Stripe sandbox payment including 3DS
must still be validated before enabling this for production; provider doubles do
not prove real payment-method behavior or account capabilities.

## Platform fee

The planned 1.5% Maia application fee would be platform revenue for Gavakata
Software LLC’s Stripe platform account, separate from Stripe processing fees.
The current `testPlatformFee` helper deliberately adds it only in enabled test
mode, never live. Pricing copy now states that distinction. This change does not
authorize or enable a live application fee, change a studio’s Stripe agreement,
or assume a particular Stripe processing rate. Live fee policy and accounting
must be settled before activation.
