# Twilio ISV audit

October 8, 2026 · re-audited source commit `07200a41ab1da8a60c0e4adffba9365c3e4cc4f1`. Source inspection and official documentation previously checked during this audit only; no authenticated Twilio calls or live mutations were made.

## Current implementation

| Phase | Actual implementation | Credential/resource ownership | Verification status |
|---|---|---|---|
| Subaccount | `packages/integrations/twilio.ts:createTwilioSubaccount` calls POST `/2010-04-01/Accounts.json` | Parent credentials; artist-specific friendly name | Adapter inspected; live clean provisioning not exercised |
| Messaging Service | `createMessagingService` calls POST `/v1/Services` | Artist subaccount credentials | Implemented; live creation/recovery unverified |
| Number | `findAvailableLocalNumber`, `purchasePhoneNumber`, `addNumberToMessagingService` | Artist subaccount, sender pool association | Purchased number stored inactive until approval; recovery unverified |
| Customer profile | `packages/compliance/live-registration.ts:startLiveRegistration` | First active service account; one profile per organization | Business, representative, address, Primary association, evaluation, submission implemented |
| A2P messaging profile | `createA2pProfile` | Same first account; TrustProduct plus A2P EndUser and secondary profile assignment | Implemented; live acceptance unverified |
| Brand | `syncLiveRegistration` → `createBrand` | One organization SID, first account | Implemented; multi-subaccount use inconsistent |
| Campaign | `syncLiveRegistration` → `createCampaign` | Each service's own account; organization brand SID reused | Per-service campaign rows exist; cross-account registration unverified |
| Approval | `syncLiveRegistration` → `getCustomerProfile/getTrustProduct/getBrand/getCampaign` | Credentials reselected from current resources | Manual POST advances phases; recurring polling not found |
| Existing registration | `app/api/compliance/registration/adopt/route.ts:handlePOST` | Inspects configured service/campaign/sender pool | Adoption is implemented; Embellished's live operation is user-reported |
| Status delivery | `app/api/twilio/message-status/route.ts:POST` | SID lookup + subaccount/legacy-parent signature | Signed ordered status updates and bounded lookup retries implemented |

The secondary Customer Profile policy defaults to `RNdfbf3fae0e1107f8aded0e7cead80bf5`; the A2P TrustProduct policy defaults to `RNb0d4771c2c98518d916a3d4cd70a8f8b`. Both can be configured. Provider acceptance of the full business attributes, policy settings, and business type mapping has not been demonstrated by this audit.

## Primary Business Profile association

`startLiveRegistration` requires TWILIO_PRIMARY_CUSTOMER_PROFILE_SID and assigns it with `assignCustomerProfileEntity(credentials, secondarySid, primarySid)`. The code does not omit Primary association. It does not retrieve/validate the Primary's approved state, ISV classification, configured parent ownership, or eligibility before starting paid resources. The user reports Gavakata Software LLC's Primary Business Profile is approved; the actual deployed SID/classification and cross-account association remain unverified.

Twilio's preferred subaccount architecture creates a customer's Secondary Customer Profile and Brand in that customer's subaccount, with the customer's campaign services in the same subaccount. This supports the first-artist flow's general approach; it does not justify sharing one brand across independently created artist accounts. See [official ISV architecture overview](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv) and [BrandRegistrations API ownership guidance](https://www.twilio.com/docs/messaging/api/brand-registration-resource).

## Findings

### T01 — High: organization compliance identity spans incompatible artist accounts

**Locations/functions:** `app/api/twilio/provision/route.ts:handlePOST`; `packages/db/src/schema.ts:twilioAccounts`, `twilioMessagingServices`, `complianceProfiles`; `packages/compliance/live-registration.ts:resources`, `startLiveRegistration`, `syncLiveRegistration`.

Provisioning creates one account per artist, while compliance stores a single secondary profile, TrustProduct, and brand per organization. Registration chooses `resources()[0]` without ordering or a persisted registration-account binding, then sends that brand SID to campaigns under every artist account. A second artist creates another account; its campaign cannot be assumed to accept the first account's brand. Removing/reordering the first service can also make polling use different credentials for existing SIDs. This is a concrete model inconsistency, although the live Twilio error was not reproduced.

**Recommended fix:** choose a studio/organization subaccount with artist Messaging Services, or store independent profile/brand lifecycles per actual account. Prefer one account per legal customer when artists belong to that same studio; separately incorporated artists may require separate customer identities. Persist the account that owns every compliance resource. Preserve existing approved accounts/campaigns; design an explicit migration/adoption mapping rather than moving live resources automatically.

**Acceptance:** two artists under one legitimate studio, all profile/brand/service/campaign SIDs checked against their owning account; stable sync after adding/removing artists. Twilio documents account-specific BrandRegistration credentials in the [API reference](https://www.twilio.com/docs/messaging/api/brand-registration-resource).

### T02 — High: provisioning can duplicate paid resources and cannot fully reconcile partial failures

**Locations/functions:** `app/api/twilio/provision/route.ts:handlePOST`; `packages/integrations/twilio.ts:createTwilioSubaccount`, `purchasePhoneNumber`; `packages/db/src/schema.ts:twilioAccounts`, `phoneNumbers`.

SELECT-then-create is unlocked. Unique artist/account constraints prevent some duplicate local rows after provider calls, but do not prevent duplicate remote accounts or number purchases. A failure after purchase and before sender-pool/local persistence leaves an orphaned paid resource; retry purchases another. The live early return checks existing account plus number and can skip a missing Messaging Service. Encryption/webhook configuration errors can surface after earlier remote changes. The schema has no broad one-primary-number-per-artist partial unique invariant.

**Recommended fix:** preflight configuration/encryption/HTTPS before external mutations, serialize a uniquely keyed provisioning operation, persist step intent/results, and reconcile account/service/number inventory after ambiguous outcomes. Resume sender-pool association instead of purchasing again. Add tenant/artist/account relationship constraints and one-primary invariants with reviewed migrations.

**Acceptance:** concurrent calls, crash after each remote step, failed sender association, missing service, mock-to-live transition, and no additional purchases during recovery.

### T03 — High: registration persistence is resumable but not safe against concurrency or ambiguous success

**Locations/functions:** `packages/compliance/live-registration.ts:startLiveRegistration`, `createA2pProfile`, `syncLiveRegistration`; `app/api/compliance/registration/route.ts:handlePOST`; `app/api/compliance/registration/status/route.ts:handlePOST`.

Persisted SIDs and assignment flags are a useful restart foundation. They do not serialize concurrent submit/sync calls or close the window between provider creation and SID persistence. Repeated profile, TrustProduct, brand, or campaign creation can incur fees or leave untracked resources. A unique local campaign service key can reject an insert after a second remote campaign has already been created. Artifact flags are updated as whole JSON values and concurrent updates can overwrite progress.

**Recommended fix:** durable account-bound compliance operations with phase leases/version checks, locally persisted intents, provider reconciliation before create, and bounded attempts/deadlines. Use provider idempotency only where the specific API supports it; do not assume every Twilio POST accepts an idempotency header. Preserve operation outcomes separately from UI summary status.

**Acceptance:** simultaneous submits/syncs and injected failure immediately after each successful provider call yield one logical resource/phase and an auditable recoverable state.

### T04 — High: correcting intake does not update already-created rejected entities

**Locations/functions:** `app/api/compliance/registration/route.ts:handlePUT`; `packages/compliance/live-registration.ts:startLiveRegistration`, `createA2pProfile`, `syncLiveRegistration`; `packages/integrations/twilio-compliance.ts`.

Saving intake sets local DRAFT but retains SIDs/artifact flags. Submission skips existing business/representative/address EndUsers and does not update their attributes. Rejected A2P profiles and brands return from sync; rejected campaigns are saved but summarized as CAMPAIGN_PENDING. No targeted update/resubmission command was found for those phases. A customer can correct local information and resubmit the stale provider information indefinitely.

**Recommended fix:** version submitted intake snapshots, compare changed fields, implement resource-specific correction/resubmission commands allowed by Twilio, preserve rejection feedback, and require deliberate replacement only when necessary. Record CAMPAIGN_REJECTED/ACTION_REQUIRED distinctly from pending and retryable transport errors.

**Acceptance:** business-address/EIN/representative correction, TrustProduct rejection, brand rejection, and campaign rejection all follow a documented phase-specific recovery path without creating duplicate paid registrations.

### T05 — High: approval advancement relies on manual calls

**Locations/functions:** `app/api/compliance/registration/status/route.ts:handlePOST`; `packages/compliance/live-registration.ts:syncLiveRegistration`; `app/api/automations/run/route.ts:POST`.

Sync is an owner-triggered POST; it reads provider state and creates the next phase. No scheduled compliance job exists in the inspected worker. A new studio can remain pending until a person clicks again. A transport failure replaces summary status with SUBMISSION_ERROR, losing the distinction between pending provider review and transient synchronization failure. HTTP wrappers have no explicit deadline or retry-after handling.

**Recommended fix:** scheduled per-account/per-phase sync jobs, bounded backoff/jitter for transient errors, rate-limit handling, last-success versus last-attempt tracking, terminal-state alerts, and reconciliation of missed status events. Use signed provider events as an additional input where configured, with polling as recovery.

**Acceptance:** submission advances autonomously through approval; 429/5xx/timeouts preserve progress and retry safely; terminal rejections require user action rather than blind retry.

### T06 — High: approval revocation does not disable previously active numbers

**Locations/functions:** `packages/compliance/live-registration.ts:syncLiveRegistration`, `approved`, `rejected`; `packages/integrations/studio-sms.ts:sendStudioSms`.

Sync activates numbers when campaigns are approved. If a profile/brand is later rejected or suspended it returns without disabling those numbers; a campaign later becoming unapproved also does not revoke active/APPROVED flags. Senders can continue trusting stale local approval. In the create-campaign branch, immediate provider approval can mark the organization approved before the number-activation branch has run. Generic approval sets conflate multiple resource state vocabularies.

**Recommended fix:** compute eligibility per resource/account/service using resource-specific status mappings; atomically activate or deactivate affected numbers on every sync, including creation and revocation. Preserve explicit operational suspension and last verification time. Do not overwrite intentional number retirement/porting states just because registration is approved.

**Acceptance:** approved→suspended/rejected/deleted, immediate approval on creation, partial approval among services, stale state, and retired numbers all produce correct delivery eligibility.

### T07 — Medium: unsupported brand eligibility is collected without a complete lifecycle

**Locations/functions:** `packages/compliance/live-registration.ts:businessType`, `startLiveRegistration`, `syncLiveRegistration`; `packages/integrations/twilio-compliance.ts:createBrand`; `packages/compliance/a2p.ts:registrationReadiness`.

The live flow requires an encrypted business registration number and defaults brand type to STANDARD. Business-type labels alone do not implement the sole-proprietor flow, identity/OTP steps, or low-volume eligibility. A studio without an eligible registration identifier cannot be treated as supported simply because intake accepts a sole-proprietor business type.

**Recommended fix:** explicitly declare supported business/brand eligibility, reject unsupported paths early with actionable instructions, and implement separate lifecycle branches only when required. Validate account policy and legal identity before provisioning/submission costs.

**Acceptance:** legitimate EIN-bearing businesses follow Standard/LVS eligibility; businesses without required identifiers are blocked or routed to a fully implemented alternative. Official requirements distinguish those routes: [Twilio required business information](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/collect-business-info).

## Additional resource-authorization finding

### T08 — High: adoption does not establish tenant ownership for every adopted resource

**Locations/functions:** `app/api/compliance/registration/adopt/route.ts:handlePOST`, sender adoption loop; `packages/db/src/schema.ts:phoneNumbers`, `twilioAccounts`.

The endpoint is studio-owner protected and rejects a Messaging Service already claimed by another organization. However, every studio's candidates include the global parent credentials. For a valid but locally unclaimed parent service, successful provider lookup and approved profile/brand/campaign states are treated as authorization to attach it to the requester's studio; there is no operator-approved tenant/resource mapping or verification that the registered business belongs to that studio. Knowledge of an MG SID is not ownership proof. The transaction refuses a parent account already assigned to another organization, which limits this path, but does not prove ownership when the account is unassigned.

In the sender loop an existing phoneNumbers row is selected globally by phone number, then updated by ID without checking its organization or artist. If the verified sender pool includes a number already mapped to another tenant, the caller can change that foreign row's account/service/approval fields. This is a direct unscoped write in source; no production prerequisites were tested. Every new sender is also inserted isPrimary=true, allowing multiple primary senders for one artist and arbitrary outbound selection.

**Recommended fix:** make legacy parent adoption an operator-authorized, explicitly prebound tenant/service/account operation, or require a verified tenant account with no parent fallback for ordinary studio owners. Validate all service/profile/brand/number ownership relationships inside the transaction, refuse any foreign sender mapping, choose exactly one primary sender, and persist immutable adoption provenance. Provider approval is compliance evidence, not tenant authorization.

**Acceptance:** two tenants, unclaimed parent service, parent account already assigned, foreign local sender, concurrent claims, and multiple senders. Tenant B must never change tenant A's row or claim its business resources. Use mocked adapters/local PostgreSQL tests; do not test by modifying real services.

**Local implementation update (October 8, 2026):** owner adoption now requires an existing tenant-bound account; parent fallback/account creation were removed. Service, brand, and customer-profile account identity must match; transaction ownership checks protect service/profile/campaign/sender mapping; foreign sender mappings are rejected before writes and updates are tenant/artist scoped. One deterministic primary sender is selected and adoption events record provenance. Policy and mocked authenticated endpoint tests passed. Real adoption DB concurrency against other writers, live provider contracts, legacy operator prebinding, and browser/staging/live verification remain pending. See TESTING_PROGRESS.md; this is not a claim of completed live onboarding.

## SMS enforcement and live configuration

Consent evidence, YES confirmation, START/STOP handling, production signature enforcement, scoped automated sends, and ordered status callbacks are implemented. Remaining risks are A04–A06 in PRODUCTION_READINESS.md: immediate/direct paths differ from the durable guarded path. HELP is always answered by Maia, so Twilio automatic HELP behavior must be configured consistently to avoid double replies; the code explicitly documents this requirement. Provider settings were not inspected.

Number retirement/porting, grace periods, voice forwarding, and existing-registration adoption are implemented. Their live transfer and rollback behavior was not exercised. Do not port or replace Embellished's working number as part of an audit.

## Safe verification sequence

1. Inspect a redacted resource graph for Gavakata's Primary identity and each existing studio/account/service/profile/brand/campaign/number. Confirm ISV classification and resource ownership using an explicitly approved authenticated read-only session.
2. Decide organization versus independent-business account boundaries and persist that mapping. Test two-artist model behavior locally/staging.
3. Add deterministic mocked provider contracts plus real local PostgreSQL concurrency/crash tests for provisioning and all registration phases.
4. Verify published legal/consent URLs without submitting registrations; test generated campaign copy against legitimate customer input and supported use cases.
5. Obtain explicit approval for a clean live registration using real authorized business identity. Record owning account, provider evaluation results, phase transitions, fees, and rejection recovery; never use fictional business data.
6. After actual carrier approval, obtain explicit authorization for scoped inbound/outbound tests and check final delivered callbacks, STOP/START, human takeover, and multi-artist consent boundaries.

Embellished's manually approved campaign and Gavakata's approved Primary Profile are user-reported working inputs. They do not establish Maia Test Tattoo's live identity eligibility or prove the end-to-end automated path.

## Accepted customer model and T02 local follow-up

The user confirmed the default studio legal customer and separately registered independent-business artist requirement. See [TWILIO_LEGAL_CUSTOMERS.md](TWILIO_LEGAL_CUSTOMERS.md) for explicit ownership, independent tenant boundaries, service/campaign bindings and approved legacy-resource handling. T01 remains open until these bindings and workflows are implemented and tested.

`packages/integrations/twilio-provision-preflight.ts::twilioProvisionPreflight` now validates local live configuration and resource relationships before the provisioning endpoint creates resources. It rejects mock credentials/SIDs in live setup and unsafe webhook origins. `app/api/twilio/provision/route.ts::handlePOST` no longer treats missing service membership as complete and reuses a purchased number when repairing a missing service. Four mocked/direct tests pass, including zero provider calls on invalid configuration and no additional purchase in partial-service recovery. Raw provider error output was removed from this endpoint.

T02 is only partially implemented: durable intents, concurrency serialization, ambiguous provider-success reconciliation, account-customer boundaries and one-primary database invariants remain outstanding. No authenticated Twilio call, registration, purchase or SMS occurred.
