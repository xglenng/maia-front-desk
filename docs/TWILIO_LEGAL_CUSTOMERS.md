# Twilio legal-customer architecture

## Accepted business requirement

The user selected one legal customer per studio as the default. Each independently operated studio owns its business identity, Secondary Customer Profile, A2P brand and campaign lifecycle. Artists acting under that studio's legal business may use that registration where the provider's account/service requirements allow it. Independently operated artists with their own legal business must register separately, even when physically working inside another studio. Shared location, name, login, scheduling or staff affiliation never establishes shared legal identity.

This is the accepted target architecture, not a claim that the current schema already supports it. Current provisioning creates artist accounts while compliance is organization-scoped (T01); that mismatch remains open.

## Tenant and legal identity boundaries

Use an explicit stable legalCustomerId for provider ownership, separate from artistId and physical location. A legal customer has an owning tenant organization; default studio onboarding creates one legal customer for that organization. An independent artist's separate business receives a separate owning tenant organization and legal customer, even when using another studio's premises. This uses existing tenant isolation rather than making the host studio owner implicitly authorized over an independent business's registration, secrets, customer data or billing.

A future host-studio affiliation represents premises/public directory/scheduling arrangements only. Any cross-tenant collaboration requires explicit grants and narrowly scoped APIs; affiliation must not broaden existing tenant queries. An artist profile belongs to its operating business tenant. A host directory may reference it without copying credentials or treating the host's registration as its own. A login needing several business contexts requires explicit organization membership and context selection; the current single-organization login is not assumed to implement that UX.

Do not put an independently operated business under the host's legal-customer identifier merely because it appears on the host's artist roster. Existing such arrangements require owner-confirmed identity mapping before any registration/provisioning action.

## Resource graph

- Legal customer → stable designated Twilio account/subaccount. Default: one studio subaccount, reused by its artists.
- Legal customer + owning account → versioned business intake, Secondary Customer Profile, A2P Messaging Profile/TrustProduct and brand.
- Artist sender configuration → Messaging Service and phone number under that same owning account and legal customer.
- Campaign → explicitly bound legal customer, brand, owning account and Messaging Service. Campaigns are service/account resources; multiple artist services may need separate campaigns even when sharing one studio brand/business registration. Do not assume a campaign SID can be reused across services or accounts.
- Every polling/registration operation uses the persisted owning account, never whichever artist happens to sort first.

Independent legal customers never share a Secondary Profile, brand, account credential, campaign or registration evidence through a host-studio affiliation. Gavakata's approved Primary Profile is the platform/ISV association, not the customer's business identity. Its approved state/account association still requires separately authorized verification.

## Planned data changes

Introduce a legal-customer record with owning organization, customer type (studio/independent business), lifecycle and confirmed identity mapping. Persist designated account binding and versioned registration ownership. Account membership is separate from the artist sender association: the legacy account.artistId field must not be used as the legal ownership key. Sender/service/campaign/operation records need validated legal-customer and account relationships.

Use unique active customer/account bindings and composite tenant/customer constraints. Keep operation intents, attempts, leases, ambiguous outcomes and provider identifiers in a durable provisioning/registration ledger. Separate account-level steps from artist-service/number steps. No assumed universal Twilio POST idempotency header.

This document does not add schema fields, journal entries, cross-tenant membership, or a provider transfer feature. Implement these changes with versioned migrations and local two-business/two-artist behavioral tests before connecting external services.

## Existing resource compatibility

Do not transfer, delete, recreate or re-register Embellished's working account/number/campaign. Preserve legacy approved resource graphs exactly. Inventory and mapping require explicit authorization; ambiguous or mixed-account graphs must enter ACTION_REQUIRED rather than automatic migration. Additive local mappings cannot prove live ownership by themselves.

For a legitimate studio with several existing artist accounts, do not simply choose one and attach all campaigns to it. Either preserve each verified legacy account graph under an explicit supported legacy mode or perform a separately approved provider migration. New default onboarding should use the customer-bound account model after implementation.

## Implementation and verification order

1. Local provisioning preflight, mock/live separation, safe partial-number repair (implemented locally; T02 still open).
2. Legal-customer/account binding schema and authorization; new studio default; independent-business tenant setup; preserve unmapped legacy resources.
3. Account/service/number operation ledger and serialized creation; failure injection and reconciliation after every provider boundary.
4. Registration account binding and phase leases; local contracts for shared studio artists and separate independent businesses.
5. Approved read-only live resource mapping, then separately approved legitimate onboarding and delivery tests.

PR-1 retains outstanding consent/deployment gates. PR-2 work can proceed locally without representing either sprint as production-complete. Existing account assumptions must not be used for paid onboarding until T01/T02/T03 acceptance evidence passes.
