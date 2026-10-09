# Production readiness audit

October 8, 2026 · re-audited commit `07200a41ab1da8a60c0e4adffba9365c3e4cc4f1`. AGENTS.md was read and applied. Earlier audit findings were rechecked against the current source, and signup, public ingress, adoption, and release workflow coverage was expanded.

The code supports substantial receptionist and onboarding workflows. The repository evidence does not support calling clean multi-tenant onboarding or payment/message recovery production-ready yet. Existing deployment and manually approved Twilio resources are not evidence that every new-customer path works.

## Scope and verification

This audit changed only the four requested documents. No production requests, database access, migrations, SMS, registrations, payments, secret reads/decryption, or deployments were performed. Fresh local commands used `env -i PATH="$PATH"` to exclude inherited provider/database credentials. `npm test`: 203 passed, 0 failed, 0 skipped. `npm run typecheck -- --incremental false`: passed, without changing tracked build metadata. A read-only JavaScript check confirmed that the date regex currently used in the AI tool rejects `2026-10-08`. No lint script is defined. Build, database integration, live provider checks, dependency installation, and network vulnerability checks were not run.

Repository inspection covered the application/API route inventory, dashboard/public/test flows, all business package areas, schema and migration files, scripts, dependency declarations, and historical release documentation. Dependencies/build outputs, secret environment files, and the `maia-current.zip` archive were excluded: current source is the source of truth, and reading credentials is unnecessary for this audit. No Railway or provider configuration was inspected. Tests include mocks and source assertions; passing them does not establish production or PostgreSQL concurrency behavior.

Severity: **Critical** = direct systemic compromise or immediate major loss; **High** = unauthorized sensitive access/action, money/message duplication, or core onboarding failure; **Medium** = recovery, availability, correctness, or operating-control weakness; **Low** = limited documentation/maintenance issue. No live cross-organization exploit was demonstrated. T08 identifies an unscoped cross-tenant write in the adoption code and missing customer-resource ownership checks; its reachable production prerequisites are unverified. Missing database defenses and incomplete artist authorization are not presented as proof of an existing production data leak.

## Implemented versus verified

| Area | Implemented evidence | Local evidence | Still unverified |
|---|---|---|---|
| Tenant auth | Session guard, origin checks, tenant ID replacement, selected artist checks | Mocked security boundary tests pass | Real PostgreSQL two-tenant endpoint matrix, deployed role privileges |
| Twilio ISV | Subaccount/service/number, secondary profile, Primary association, TrustProduct, brand/campaign, adoption | Adapter/policy tests pass | Clean live registration, multi-artist account ownership, rejection repair |
| SMS | Scoped evidence, STOP/START/YES, send gating, signed ordered callbacks | Consent/status policy tests pass | Concurrent callbacks, consent races, send crash recovery, actual delivery |
| AI | Scoped context, public read tools, guarded queue tools, WEB_TEST restriction | Prompt/context/policy tests pass | Live tool schema, prompt attacks, concurrent immediate execution |
| Booking/deposits | Internal/Square booking; Stripe/Square/Venmo deposits; payment webhooks | Availability/confirmation/provider contracts pass | Concurrent overlapping bookings, charge reconciliation and refund lifecycle |
| Waivers | Native signatures/hashes, scoped links, Jotform tracking/verification | Selection and contract checks pass | Live Jotform replay/concurrency, immutable signed-document retention |
| Automation | Durable jobs, leases, dedupe, retries, DELIVERY_UNKNOWN, cancellation | Queue/policy/source contract checks pass | Real DB contention, crash injection, sustained backlog, alert escalation |
| Activation | Readiness computation, owner activation/test tracking | Readiness/activation tests pass | Delivery-based activation proof, full new-studio flow |
| SaaS billing | Appointment deposits exist | No subscription lifecycle identified | Subscription, entitlement, usage accounting, platform/customer fund allocation |
| Operations | Logs and persisted events | Source inspected | Railway alerts, backups/restore, dashboards, retention, deployed migration parity |

## Authorization and credential findings

### A01 — High: ARTIST authorization is inconsistent across endpoints

**Locations:** `packages/auth/server.ts:protectedRoute`; `app/api/appointments/route.ts:handleGET`; `app/api/booking/hold/route.ts:handlePOST`; `app/api/twilio/send/route.ts:handlePOST`; `app/api/appointments/[id]/route.ts:handlePOST` (calendar sync).

The generic guard checks membership in the organization, not ownership of the requested artist. These handlers allow an ARTIST to select another artist in the same organization; appointment listing exposes that artist's clients/notes, hold creation modifies their schedule, and direct sending uses their number. Other paths explicitly use `canManageAppointment` or `accessibleConversation`, showing a narrower intended policy. This is intra-tenant unauthorized access, not proof of cross-organization access.

**Fix:** centralize an owner-or-assigned-artist authorization helper and require it for all artist-scoped reads/writes, including calendar sync and direct SMS. Validate client/service/appointment relationships as well as independent tenant membership. If shared studio access is intentional, encode explicit permissions instead of relying on inconsistent behavior. **Verify:** two artists and an owner in one tenant, plus a second tenant; enumerate every read and mutation boundary.

**Implementation status (October 8, 2026):** shared browser authorization now enforces assigned-artist access on artist/appointment/conversation/service references and appointment path IDs, including deposit routes. Owner access remains studio-scoped; Twilio status lists assigned profiles for ARTIST callers. Regression, actual denied-endpoint tests, a real local PostgreSQL fixture, and eight isolated staging HTTP checks passed. No provider action or production access occurred. Shared studio clients/templates retain their current policy; broader relationship constraints and join integrity remain A03. Production deployment/verification is pending; see ROADMAP.md and TESTING_PROGRESS.md for evidence.

### A02 — High: Google OAuth credentials are stored plaintext

**Locations:** `app/api/integrations/google/callback/route.ts:handleGET`; `app/api/availability/route.ts:handleGET`; `app/api/appointments/[id]/route.ts:handlePOST`.

The callback assigns raw access/refresh token strings to fields named `*Encrypted`; consumers use them directly. A database disclosure exposes calendar credentials. Expiry is saved but consumers do not refresh tokens. OAuth state is already consumed and user-bound, so state validation should be retained.

**Fix:** use established authenticated encryption with a versioned credential format; migrate existing plaintext deliberately, add refresh handling and atomic upsert per artist/calendar, and stop treating the field name as an encryption guarantee. **Verify:** ciphertext storage, expiry/refresh failure, reconnect, and tenant boundary tests. Production migration requires approval.

### A03 — Medium: database tenant relationships lack broad defense in depth

**Locations:** `packages/db/src/schema.ts:appointments`, `conversations`, `twilioMessagingServices`; `packages/inbox/server.ts:accessibleConversation`; `packages/db/src/index.ts`.

Many tenant-owned references are independent single-column foreign keys. An invalid relationship can point to a different organization's artist/client while the row's organization is legitimate; joins that trust those relationships can then return foreign records. No RLS was found in repository migrations. Existing location tables demonstrate composite tenant constraints, but this pattern is not general.

**Fix:** audit existing relationship integrity in staging, add `(id, organization_id)` keys and composite tenant foreign keys for sensitive relationships, include tenant equality in joins, and evaluate transaction-scoped RLS with a least-privileged DB role. **Verify:** DB rejects cross-tenant references independently of route guards. Do not claim deployed RLS is absent without inspecting the deployed DB.

## Messaging and AI findings

### A04 — High: immediate AI paths can send stale replies and bypass scoped consent checks

**Locations:** `app/api/twilio/inbound/route.ts:POST` immediate branch; `packages/channels/server.ts:processSocialInbound`; `packages/ai/src/agent.server.ts:runMaiaAgent`.

Zero-delay execution invokes the agent without the queued `automationGuard`, then sends directly. SMS checks a previously loaded client's opt-out state and bypasses `hasScopedSmsConsent`/the normal studio approval gate. A simultaneous STOP or human takeover can occur during generation, after checks passed. Tenant-wide opt-in for one artist can also reach another artist's immediate flow without current artist evidence. Queued execution already has stronger version/takeover checks.

**Fix:** send every response through one durable, scoped delivery path; revalidate conversation version, takeover, client opt-out, artist consent evidence, and sender eligibility immediately before claiming delivery. Model customer-care and keyword exceptions as explicit capabilities. **Verify:** STOP/takeover/new inbound during model generation and cross-artist consent cases.

### A05 — High: webhook dedupe is not atomic and ingress is not fully durable

**Locations:** `app/api/twilio/inbound/route.ts:POST`, `recordInbound`; `packages/channels/server.ts:processSocialInbound`; `app/api/meta/webhook/route.ts:POST`; `packages/db/src/schema.ts:messages`, `clientChannelIdentities`.

Inbound dedupe does SELECT then INSERT without a unique provider-event constraint. Concurrent retries can create duplicate clients/conversations/messages and replies. SMS records the inbound event before generation/enqueue/send; a later failure makes retries return early because the SID exists, losing unfinished work. Meta acknowledges before `after` has durably stored the event, so process termination can lose an acknowledged request.

**Fix:** persist authenticated webhook receipts with unique `(provider, account, event ID)` and explicit processing states before acknowledgment. Transactionally upsert scoped identities/conversations, insert the message, increment version, and enqueue work. Resume incomplete receipts instead of suppressing all repeats. **Verify:** concurrent identical callbacks, crash after receipt/message commit, and replay after restart.

### A06 — High: direct outbound replies lack a durable send intent

**Locations:** `app/api/twilio/send/route.ts:handlePOST`; `app/api/inbox/[id]/messages/route.ts:handlePOST`; `app/api/payments/square/webhook/route.ts:POST` competing-intent notice; `packages/integrations/studio-sms.ts:sendStudioSms`.

Manual/direct paths send before persisting the returned message. Provider success followed by DB failure or HTTP timeout encourages a resend and can duplicate customer messages. The durable queue's DELIVERY_UNKNOWN protection is not used. Direct/manual handlers also accept MOCK_APPROVED without the environment restriction used in `maySendStudioSms`; automated sending can fall back to parent credentials if an account is absent/inactive. These inconsistencies weaken routing and approval invariants.

**Fix:** record a uniquely keyed outbound intent before sending, use the queue's ambiguous-delivery handling everywhere, fail closed for missing tenant accounts except an explicitly validated legacy-parent mapping, and share one production approval predicate. **Verify:** provider success/DB failure, retry, inactive account, and mock approval in production.

### A07 — High: the live AI availability tool rejects correctly formatted dates

**Location:** `packages/ai/src/agent.server.ts:runMaiaAgent`, `check_availability` parameters.

The regex literals use `\\d` rather than `\d`. A read-only JavaScript reproduction rejects `2026-10-08`. The read-policy date parser tests do not test this actual registered tool schema, so normal live tool calls cannot pass validation.

**Fix:** correct both fromDate and toDate regex literals and extract/export the registered schema for direct testing. **Verify:** valid calendar dates reach the execution function; malformed and impossible dates fail at schema/parser boundaries.

### A15 — Medium: actionable AI selections and production mode are not independently enforced

**Locations:** `packages/ai/src/agent.server.ts:runMaiaAgent`; `packages/ai/src/tools.ts:createBookingHold`.

Tool instructions require explicit client slot selection, but the backend accepts any valid service/time that passes availability. A malicious message or model mistake can invoke a booking without a server-verifiable selection. Missing OPENAI_API_KEY silently selects mock mode even in production; a configuration outage can look like a functioning receptionist.

**Fix:** bind mutations to a validated, expiring selection/confirmation intent and service policy, enforce artist booking-enabled status at mutation time, and expose/fail clearly on unintended production mock mode. **Verify:** prompt attacks, disabled booking, repeated tool calls, and missing-key readiness behavior.

## Booking and payment findings

### A08 — High: internal booking claims do not serialize all overlapping intervals

**Locations:** `app/api/booking/hold/route.ts:handlePOST`; `packages/ai/src/tools.ts:createBookingHold`; `packages/booking/src/deposit-confirmation.server.ts:confirmAppointmentDeposit`; `app/api/payments/square/webhook/route.ts:POST`; `packages/db/src/schema.ts:appointments`.

Hold and immediate no-deposit booking check availability before an unlocked insert. Payment confirmation locks by artist plus exact start time, so overlapping slots with different starts take different locks and may both confirm. No database exclusion constraint was found. Legacy hold creation also accepts arbitrary starts and client-supplied deposit/price overrides without checking configured hours/deposit policy; an ARTIST can bypass required deposits and then confirm through the zero-deposit path.

**Fix:** use one transactional booking command with artist-level serialization or an appropriate range exclusion constraint for occupied intervals; apply server-derived financial policy and current availability to every entry point. Use half-open intervals so back-to-back appointments do not conflict. **Verify:** concurrent same-start/different-start overlaps, hold expiry, no-deposit booking, and unauthorized amount overrides.

### A09 — High: Stripe checkout creation can duplicate chargeable sessions

**Locations:** `packages/integrations/payments.ts:createDepositCheckout`; `app/api/payments/checkout/route.ts:handlePOST`; `packages/ai/src/tools.ts:createDepositRequest`; `packages/db/src/schema.ts:payments`.

Stripe session creation has no idempotency key. Both callers select a pending payment, create a remote checkout, then insert it. Concurrent requests or a crash between remote/local creation can produce multiple payable sessions. The payment-intent field temporarily holds a URL, complicating reconciliation. Square already has a deterministic payment-link key, although local duplicate-row prevention still needs verification.

**Fix:** create a unique versioned payment intent locally, derive the provider idempotency key from it, separate checkout URL and payment intent ID fields, reconcile before recreating, and expire competing sessions. **Verify:** repeated/concurrent requests, provider timeout after acceptance, amount changes, and DB failure after creation.

### A10 — High: Stripe confirmation and paid-exception handling are incomplete

**Locations:** `app/api/payments/webhook/route.ts:POST`; `packages/booking/src/deposit-confirmation.server.ts:confirmAppointmentDeposit`.

The completed-session handler does not validate `payment_status`, actual amount/currency, or mode against the expected payment; its TENTATIVE branch confirms without hold-expiry or slot-conflict checks. The newer command checks the local payment amount, not the actual Stripe event amount, and returns early for expired/invalid states without recording received money. After an appointment is already confirmed, an additional paid checkout can be acknowledged without reconciliation of that second payment. Late money can therefore be lost from local accounting or confirm an unavailable slot.

**Fix:** persist unique verified events, reconcile actual provider payment status/amount/currency/account/session, route all confirmations through one transaction, and record every successful payment even when booking cannot confirm. Add explicit refund/reschedule/manual-review states and async-payment success handling where applicable. **Verify:** unpaid completion, late payment, second session paid, occupied slot, replay, and out-of-order failure/expiry events.

### A11 — High: Square monetary validation and cancellation recovery are insufficient

**Location:** `app/api/payments/square/webhook/route.ts:POST`.

The handler parses amount/currency and merchant fields but does not compare them to the local expected payment/connected merchant before marking PAID. Competing links are canceled inline; failure to delete a remote link is logged, while the local payment is canceled and a client may be told no payment was taken. A concurrently completed payment or still-payable remote link can contradict that statement. The webhook duplicates much of the shared confirmation command and can persist side effects before all followup work succeeds.

**Fix:** validate merchant, amount, currency, provider payment identity, and current state; use a common confirmation/reconciliation command and durable link-cancellation/notification jobs. Confirm provider cancellation before asserting non-payment, and reconcile late payments on canceled intents. **Verify:** wrong amount/merchant, cancellation timeout, simultaneous competing payments, and webhook replay.

### A12 — High: Stripe money routing and SaaS subscriptions are not tenant billing

**Locations:** `packages/integrations/payments.ts:getStripe`, `createDepositCheckout`; `packages/db/src/schema.ts:payments`; inspected `app/api/payments/` routes.

Stripe uses one environment secret with no tenant-connected-account or transfer destination in Checkout creation. Tenant metadata identifies records but does not allocate money to a studio. If independent studios expect settlement into their own accounts, this is an unresolved financial architecture requirement. No SaaS subscription/customer/invoice/entitlement lifecycle was found; appointment deposits must not be described as platform subscription billing.

**Fix:** document merchant-of-record and settlement intent first; implement explicit tenant routing if required, then a separate subscription lifecycle with signed events, entitlements, dunning, cancellation, and usage accounting. **Verify:** approved sandbox settlement/account tests and tenant entitlement tests. Production payment configuration requires explicit approval.

## Worker, calendar, onboarding, and operating findings

### A13 — High: lifecycle enqueueing is separate from appointment commits

**Locations:** `packages/automations/lifecycle.server.ts:scheduleConfirmedAppointmentAutomations`, `scheduleAppointmentCompletionFollowups`; `packages/booking/src/deposit-confirmation.server.ts`; `app/api/payments/webhook/route.ts`; `app/api/payments/square/webhook/route.ts`; `app/api/appointments/[id]/route.ts`.

Appointment state commits before reminder/followup enqueueing. Failure or termination between these steps can leave a confirmed/completed appointment without jobs. Some duplicate paths repair scheduling, but replay of Stripe's now-CONFIRMED branch does not and no general backfill reconciler was found. Dedupe prevents duplicate scheduled jobs; it does not guarantee jobs were scheduled.

**Fix:** enqueue via a transactional outbox alongside state changes, with idempotent consumption and periodic reconciliation of missing lifecycle events. **Verify:** crash after confirmation and midway through multiple enqueue operations, then recovery without duplicate delivery.

### A14 — Medium: scheduler latency, capacity, and unknown deliveries need operating controls

**Locations:** `app/api/automations/run/route.ts:POST`; `packages/automations/queue.server.ts:claimDueAutomationJobs`; `packages/automations/policy.ts`; user-reported five-minute cron.

One request claims 10 jobs. If one request runs every five minutes, nominal intake is 120 jobs/hour before retries unless further runs are arranged. A job due just after a tick may wait nearly five additional minutes, so one/two-minute response settings are not precise. DELIVERY_UNKNOWN and some FAILED outcomes intentionally stop automatic retry, but no complete reconciliation/alert operator workflow was found.

**Fix:** define latency/throughput objectives, run a continuously supervised worker or appropriately frequent bounded draining, expose oldest-due age and terminal-state alerts, and reconcile unknown delivery through provider status before any resend. **Verify:** backlog load, overlapping workers, lease loss, provider acceptance followed by crash, and cron missed ticks.

### A16 — Medium: Google and internal scheduling disagree about availability

**Locations:** `packages/scheduling/internal.ts:getInternalAvailability`; `app/api/availability/route.ts:handleGET`; `packages/integrations/calendar.ts:GoogleCalendarAdapter`; `app/api/appointments/[id]/route.ts:handlePOST`.

AI internal availability does not merge Google busy events while the legacy endpoint does. The legacy endpoint treats all appointment states as busy, including canceled/expired intents, and omits the explicit studio timezone used by the new provider path. Google list ignores pagination and all-day events; concurrent sync calls can create duplicate events before calendarEventId is saved.

**Fix:** unify availability through the provider abstraction, merge complete Google busy intervals with timezone handling, share occupied-state policy, and use deterministic provider event IDs plus durable sync reconciliation. **Verify:** canceled/expired holds, all-day events, pagination, DST, expired tokens, and concurrent sync.

### A17 — Medium: activation test evidence overstates delivered readiness

**Locations:** `app/api/onboarding/route.ts:getDetectedTests`, `load`, `handlePATCH`; `packages/onboarding/activation.ts:buildActivationPlan`.

An outbound message SID is counted as a passed test without requiring delivered status; owner manual test marking is also accepted. MOCK_APPROVED is an approval in the activation helper, and phone readiness is based on row existence. These are useful workflow indicators but insufficient production proof after number/campaign/config changes.

**Fix:** separate mock/manual/provider-verified evidence, bind test runs to current account/number/campaign configuration, require actual inbound verification and delivered outbound proof, and invalidate stale evidence on changes. **Verify:** rejected/undelivered callbacks, changed primary number, mock mode, and expired evidence.

### A18 — Medium: production diagnostics and recovery remain an evidence gap

**Locations:** `packages/db/src/index.ts`; `packages/ai/src/agent.server.ts:auditRun`, `auditAction`; `packages/automations/queue.server.ts`; `app/api/twilio/message-status/route.ts:POST`; repository deployment documentation.

Useful structured logs and audit tables exist, but agent audit persistence deliberately swallows failure. The DB pool has no explicit application timeout limits; several provider wrappers have no fetch deadline. Unmatched status callbacks are acknowledged after bounded lookups without a durable receipt. No complete health/alert/backup-restore/support runbook was found. Production controls may exist outside the repository and were not inspected.

**Fix:** set explicit bounded DB/provider deadlines, persist unmatched callback receipts for reconciliation, monitor lost audit writes and queue age, and document deploy/version/migration parity, tenant-aware support access, backups and restore drills, log redaction/retention, and alerts. **Verify:** provider stall, DB pool saturation, unmatched callback recovery, restore drill, and alert delivery in staging.

### A19 — Medium: waiver completion replay and immutable evidence need strengthening

**Locations:** `app/api/waivers/sign/route.ts:handlePOST`; `app/api/waivers/webhooks/jotform/[connectionId]/route.ts:POST`; `packages/db/src/schema.ts:waiverSubmissions`, `externalWaiverEvents`.

Native signing inserts a new record on each repeated request. Jotform's replay check occurs before an unconditional transaction update/event insert, so concurrent callbacks can create duplicate completion events or overwrite a previous submission reference. The native hash includes template body/version but submissions do not persist that exact signed body/version as a standalone snapshot; verification depends on retaining the referenced template unchanged.

**Fix:** add a unique signing intent and immutable signed-document snapshot, atomically compare-and-set external completion, and persist uniquely keyed provider events. Preserve historical signatures while reconciling duplicates. **Verify:** concurrent replay, distinct later submissions for one token, template edits/retirement, and document-hash reconstruction.

### A20 — High: public inquiry submissions can overwrite existing clients and reverse STOP

**Locations:** `app/api/public/booking-inquiries/route.ts:POST`; `app/api/public/consent/external/[formId]/route.ts:POST`; `packages/consent/server.ts:hasScopedSmsConsent`.

The public hosted form finds an existing tenant client by submitted phone number, then replaces that client's name/email and, if the checkbox is true, sets OPTED_IN even when the prior state was OPTED_OUT. No proof of phone ownership is required. Same-origin checks and a honeypot do not authenticate the person represented by the form. Someone knowing a client's number can alter identity information or record consent in that person's name. External ingestion is token-authorized but similarly trusts submitted identity/consent, and externalSubmissionId is not deduplicated. Client updates, evidence insertion, and inquiry insertion are separate writes: partial failure can change consent/profile without recording the complete submission. Any historical affirmative evidence satisfies `hasScopedSmsConsent`, so provenance and revocation must be handled deliberately.

**Fix:** store submitted contact details as inquiry data until the existing client is verified; require an authenticated client or possession-confirmed flow before replacing established identity or reversing a STOP suppression. Model consent/suppression transitions per sender scope, retain evidence history, and atomically persist uniquely keyed submissions. Add rate limiting and enforce actual body size rather than relying only on an optional Content-Length header. **Verify:** existing opted-out client, different-person submission with the same phone, failed evidence insert, replayed external event, and current scoped consent after revocation. Keep ordinary unchecked inquiry submission available without opting the customer in.

### A21 — High: duplicate signup emails can prevent both accounts from logging in

**Locations:** `app/api/auth/signup/route.ts:POST`; `app/api/auth/login/route.ts:POST`; `packages/db/src/schema.ts:users`; `packages/auth/schema.sql`.

Signup transactionally creates organization/owner/artist/session, but does not check or enforce normalized email uniqueness. The inspected users schema has no unique email constraint. Login requires exactly one active matching email, so a second signup using an existing address can make both accounts fail login after their current sessions end. This is a deterministic source-level mismatch; deployed indexes were not inspected. Signup also accepts an arbitrary nonempty timezone, which can later make Intl timezone formatting fail. Slug selection can race and return a duplicate-account error for two distinct owners choosing the same studio name.

**Fix:** choose a consistent identity model: global normalized-email uniqueness with explicit studio membership, or authenticated account selection for intentionally multiple identities. Add reviewed uniqueness/integrity handling and verified email/account-recovery flows; reject invalid IANA timezones and retry slug collisions safely. Existing duplicate identities require a deliberate reconciliation plan. **Verify:** sequential and concurrent repeated normalized emails, unrelated owners using the same studio name, invalid timezone, and existing-owner login after rejected signup. Preserve generic errors where email enumeration matters.

**Implementation status (October 8, 2026):** core A21 signup fix completed locally. Signup now checks normalized identity under a transaction advisory lock; the schema and prepared migration add global normalized email uniqueness. Login uses matching normalization; Intl validates timezones; conflict-aware organization insertion retries slug collisions. Real disposable PostgreSQL tests passed for concurrency, existing-owner login, rollback, invalid timezones, unique-index enforcement, and migration refusal with duplicates retained. Migration and deployment remain unapplied; existing production duplicates are unverified. Email verification, account recovery, and multi-studio membership are not implemented by this fix. See ROADMAP.md for commands and migration/rollback requirements.

### A22 — Medium: hosted inquiries are persisted without a staff processing path

**Locations:** `app/api/public/booking-inquiries/route.ts:POST`; `packages/db/src/schema.ts:bookingInquiries`; `components/public-booking-form.tsx`; inspected dashboard/inbox routes and pages.

The hosted form stores inquiry text, service, and reference URL, but repository references to bookingInquiries do not include an authenticated listing, conversation conversion, notification, or handling workflow. The dashboard may show a client but not the actual request. A studio can advertise appointment requests that silently accumulate without being actionable by staff. This form is an inquiry, not a slot booking; the distinction should remain visible to customers.

**Fix:** add scoped inquiry list/detail and status transitions, route requests into the appropriate artist's inbox, and record durable notification/assignment events. **Verify:** a submitted request appears for the correct staff member with its text/reference/service and can be handled exactly once, without inventing an appointment confirmation.

### A23 — High: configured service approval and AI mode are not enforced by mutation tools

**Locations:** `packages/ai/src/tools.ts:createBookingHold`; `packages/ai/src/agent.server.ts:runMaiaAgent`; `packages/ai/src/system-prompt.ts:buildSystemPrompt`; `packages/db/src/schema.ts:services`, `artists`; `app/api/booking/hold/route.ts:handlePOST`.

Services expose requiresConsultation/requiresArtistApproval, and artist aiMode defaults to ASSISTED, but booking mutations do not enforce those service flags and the agent does not branch on aiMode before exposing mutation tools or delivering a response. Prompt text encourages safe handling, which is useful but not a backend authorization gate. An approval-required service with no deposit can become immediately CONFIRMED. ASSISTED/DRAFT labels can imply review behavior that the live agent does not implement; exact intended semantics need to be defined.

**Fix:** enforce service eligibility, consultation and human approval states in the shared booking command. Define mode semantics and either implement draft/review/autonomous paths or remove unsupported labels from readiness/UI. **Verify:** direct and AI booking of approval-required/consultation services, mode-specific tool exposure/delivery, disabled artist booking, and adversarial customer instructions.

### A24 — Medium: clean database installation is not reproducible from the migration journal alone

**Locations:** `packages/db/drizzle/0000_studio_configuration_foundation.sql`; `packages/db/drizzle/meta/_journal.json`; `packages/auth/schema.sql`; `scripts/auth-setup.ts`; `drizzle.config.ts`; `package.json`.

The first journal migration alters organizations/artists/business_rules rather than creating the original schema. Auth OAuth state also has a separate setup SQL path. Existing production may be correctly migrated as reported, but a fresh staging database cannot be assumed to initialize by running db:migrate alone. Historical README instructions use db:push/seed, which is a different installation strategy and can undermine reliable migration parity.

**Fix:** document and version a reproducible baseline/bootstrap plus forward migrations, including auth state and the required preexisting release. Test from an empty disposable database and upgrade from the supported baseline; document restore/rollback boundaries. **Verify:** fresh install and supported upgrade both match the current schema without production db:push or destructive reset.

**Implementation progress (October 8, 2026):** a separate synthetic-staging bootstrap now generates the current schema without database access, checks a source hash, orders referenced unique indexes before foreign keys, refuses existing relations, and initializes transactionally. Full local PostgreSQL rollback/uniqueness/repeat-run tests passed; the fresh Railway test database was initialized with 48 empty tables. This does not resolve production baseline/forward-migration parity: the staging snapshot does not mark old journal migrations applied, and upgrade coverage remains outstanding. See TESTING_PROGRESS.md for exact scope and rollback constraints.

### A25 — High: external Meta account routing is ambiguous across organizations

**Locations:** `app/api/channels/meta-candidates/route.ts:upsertConnection`; `packages/channels/server.ts:processSocialInbound`; `packages/db/src/schema.ts:channelConnections`.

Connection creation looks up by organization/provider/externalAccountId, while inbound routing looks up by provider/externalAccountId across all organizations and takes the first ACTIVE row. No global routing uniqueness constraint is declared. If the same Page/Instagram account is connected to two organizations by an authorized administrator, incoming customer messages can be assigned to whichever row wins the query. This is a reachable model ambiguity, not evidence that such duplicate mappings exist in production.

**Fix:** establish a unique active provider/account routing owner, reject cross-tenant claims or use an explicit audited transfer flow, and validate ownership before enabling subscriptions. Include tenant equality on dependent identity joins. **Verify:** duplicate/concurrent connections across two organizations and transfer/reconnect without delivering messages into the prior tenant.

**Local implementation status (October 8, 2026):** provider/account ownership is now globally unique in the schema/prepared migration, including disconnected reservations. Both live candidate selection and mock setup reserve owner mappings transactionally before activation/subscription; cross-studio/artist claims fail. Inbound routing refuses ambiguity. Mocked boundary and real disposable PostgreSQL constraint/concurrency tests passed. Migration is not yet applied to staging/production; live Meta contracts and reconnect/transfer verification remain pending. Explicit transfer is not implemented; disconnect retains ownership. See ROADMAP.md for migration/rollback requirements.

### A26 — High: appointment cancellation leaves external bookings and calendar events active

**Locations:** `app/api/appointments/[id]/route.ts:handleDELETE`; `packages/scheduling/service.ts`; `packages/scheduling/square/provider.ts`; `packages/integrations/calendar.ts`.

Cancellation updates Maia status and cancels local lifecycle jobs but does not cancel an existing Square booking or delete/update a previously created Google event. No provider cancellation command was found in the scheduling adapter. Staff can see a canceled appointment locally while the provider still reserves the time; external reminders may continue. Local cancellation also does not document deposit refund responsibility.

**Fix:** persist a cancellation intent with provider-specific idempotent cancellation/calendar cleanup and reconciliation; show pending/provider-failed state until outcomes are known. Define the deposit/refund policy and track it independently. **Verify:** Square/Google appointments, timeout after accepted cancellation, replay, paid appointments, and availability after successful cleanup.

### A27 — High: claimed worker rows have the wrong runtime field names

**Locations:** `packages/automations/queue.server.ts:claimDueAutomationJobs` (RETURNING job.* and `return result.rows as ClaimedAutomationJob[]`), `updateClaimedJob`; `packages/automations/processor.server.ts:processAiResponse`, `currentAiEligibility`; `packages/automations/appointment-processor.server.ts:loadAppointment`.

The claim function uses raw pg SQL, whose rows have database column names (`organization_id`, `conversation_id`, `lock_token`, `appointment_id`, `attempt_count`, etc.). It casts those rows to the Drizzle select type, whose fields use camelCase (`organizationId`, `conversationId`, `lockToken`, `appointmentId`, `attemptCount`). A TypeScript cast does not rename runtime properties. Processing cannot find references/lock tokens and `updateClaimedJob` returns false for missing lockToken, leaving claimed work without successful completion and eventual lease-expiry handling. The reported empty-queue success bypasses this row-processing problem.

**Fix:** explicitly map every claimed column to the runtime job type, use quoted SQL aliases, or return a Drizzle-mapped projection while preserving atomic SKIP LOCKED claiming. Avoid unchecked casts as runtime validation. **Verify:** at least one actual local PostgreSQL row of every job type proceeds through claim, lease renewal, processing, and completion/cancellation; a mocked claim test must use raw snake_case rows. Existing queue tests inspect source strings and do not exercise this boundary. This is a deterministic source-level defect; no nonempty production queue was exercised.

## Twilio findings

T01–T08, including account ownership mismatch, concurrent provisioning, non-durable registration phases, stale rejected entities, missing polling, approval revocation, brand eligibility limitations, and unsafe resource adoption, are detailed with functions and fixes in [TWILIO_ISV_AUDIT.md](TWILIO_ISV_AUDIT.md). They are part of this readiness assessment.

## Recommended release gate

Before the first independent customer's self-service paid launch: resolve A01/A02, A20/A21/A23/A25–A27, T01–T06/T08, A04–A11, and A13; establish staging tests with real PostgreSQL concurrency and provider contract coverage. Then perform an explicitly approved clean studio registration using legitimate business information. Maintain existing approved studio resources while validating the new architecture. Demonstrate duplicate-event/crash recovery and delivered consent-respecting messaging before calling the flow verified. Subscription collection/entitlements and settlement decisions (A12) are required for a self-service paying-customer launch; an explicitly agreed manually invoiced pilot is a separate commercial operating model, not an implemented subscription feature. See the PR-1 through PR-7 production-readiness gates in ROADMAP.md; historical development sprint numbering is unchanged.


### A20 implementation evidence update (October 8, 2026)

Local and isolated synthetic staging code now preserves existing client identity/STOP, transacts intake, records claims separately, requires current active client consent for scoped evidence, bounds JSON bytes, serializes external keyed retries, and applies durable per-form quotas. Seven local PostgreSQL route-handler tests and isolated staging HTTP identity/unchecked checks passed; browser confirmation remains pending. Source files: `packages/consent/{intake.server,rate-limit.server,public-body,server}.ts`, both public intake routes, and the public booking page. No production deployment occurred. Remaining limitations include missing-ID external deduplication, verified reconsent, sender-scoped revocation history, and pre-authentication edge abuse protection. Keep A20 open until the remaining workflows and production verification are addressed.


### A02 Google credential implementation — October 8, 2026

Implemented a versioned, authenticated encryption envelope bound to organization/artist/calendar/token kind, using the existing compliance key infrastructure. OAuth callback now validates configuration before exchange, retains user-bound single-use state, checks artist tenant ownership, and serializes reconnect saves. Calendar consumers decrypt and refresh within 60 seconds of expiry under a per-scope transaction lock. Refresh omissions preserve the encrypted refresh token; failures leave credentials intact and return unavailable rather than claiming external availability. Ambiguous active connections fail closed. Provider requests have bounded timeouts. Isolated staging now blocks Google connect/callback as well as outbound provider networking.

Verification: 227 regression tests passed, zero failures, five opt-in DB groups skipped; dedicated real local PostgreSQL Google test passed with every provider response mocked. It covers four concurrent reconnects yielding one row, five concurrent refreshes yielding one mocked exchange, tenant/artist rejection, actual OAuth invalid/replayed-state rejection, explicit legacy conversion and write rollback. TypeScript and whitespace checks passed. Staging safety: three passed, one bootstrap group skipped. Local PostgreSQL stopped. No production or Google account access occurred.

Deployment status: **local implementation verified; real Google and production cutover unverified**. Legacy plaintext is rejected by normal reads; `convertLegacyGoogleCredentials` is an explicit tested operator utility, never invoked automatically. No schema migration was added. Review [GOOGLE_CALENDAR_CREDENTIALS.md](GOOGLE_CALENDAR_CREDENTIALS.md) before any approved inspection/conversion/deployment; old code and the new envelope are incompatible. Do not mark A02 production-resolved.

Next autonomous PR-1 task: A03 tenant relationship integrity and composite constraints, using disposable local fixtures. A20's verified reconsent/sender-scoped revocation work and A25's unapplied staging/production constraint remain tracked; live Google setup waits for separate credentials/authorization.


### A03 tenant relationship constraints — October 8, 2026

Prepared 65 composite tenant foreign keys and 16 parent identity indexes in the Drizzle schema and transactional migration `0005_tenant_relationship_boundaries.sql`. Added a read-only counts-only integrity report and exact relationship manifest. Migration preflight refuses inconsistent data; lock/statement timeouts bound the atomic upgrade. No record repair/deletion, RLS enablement or production connection was performed. Related inbox/dashboard/channel/waiver/Twilio/payment/automation joins now check tenant equality, protecting those reads before constraints are deployed.

Verification: dedicated local PostgreSQL suite **69 passed**, including all 65 cross-tenant updates rejected, pre-migration inbox corruption blocked, valid reads accepted, and dirty migration refused with data/index rollback. Full regression **228 passed**, zero failures, six opt-in database groups skipped; TypeScript and whitespace checks passed. Staging safety three passed, one bootstrap group skipped. Staging-only empty-database snapshot regenerated and tested locally; existing Railway databases and deployed schema remain unchanged. Local PostgreSQL stopped after tests.

Status: A03 composite-reference implementation verified locally; deployed integrity/constraints and role/RLS verification outstanding. Review [TENANT_RELATIONSHIP_CONSTRAINTS.md](TENANT_RELATIONSHIP_CONSTRAINTS.md) for covered relationships, same-studio/domain boundaries, approved rollout and rollback. Do not apply the historical journal to current-schema staging (A24), and keep `Postgres-ACf_` excluded. Current staging app copy predates these join changes; restart before further UI verification. No new manual provider testing is needed for this database checkpoint.

Next autonomous PR-1 work: A07 live AI date schema and A27 raw worker row mapping, followed by baseline/upgrade parity tests under A24. Earlier outstanding verified reconsent, live provider checks and production approvals remain open; historical sprint numbering is preserved.

## Implementation update — A07/A27

A07: the live agent now registers the corrected shared date schema (`packages/ai/src/availability-tool-schema.ts`); direct schema and existing scheduling-policy checks pass locally. Provider execution remains unverified.

A27: `packages/automations/queue.server.ts::claimDueAutomationJobs` maps raw PostgreSQL rows through `packages/automations/claimed-job.ts::mapClaimedAutomationJob` before committing. Schema-derived names and driver decoding replace the incorrect camelCase type assertion. Synthetic row tests pass; actual nonempty database processing is still pending, so this finding is not closed on unit-test evidence alone. No migration is needed.

### A27 verification follow-up

The actual nonempty PostgreSQL claim/processor lifecycle now passes locally (`packages/automations/__tests__/worker-postgres.test.ts`). Raw row mapping, concurrent claims, lease ownership, cancellation persistence, retries/exhaustion and ambiguous send suppression were exercised with synthetic fixtures and outbound networking blocked. The row-mapping defect is locally verified; this does not close the broader automation delivery and integration gates. Railway staging and production were untouched.

## A24 implementation and verification follow-up

`packages/db/baseline/pre-journal-schema.ts` and `pre-journal.sql` now provide a preserved, hashed historical baseline. `packages/db/__tests__/baseline-postgres.test.ts` applies the real six-entry Drizzle journal to fresh and populated synthetic schemas, verifies repeat-run idempotency/data preservation and compares structural columns, constraints and indexes with the current snapshot. Two opt-in tests passed locally. See [DATABASE_BASELINE.md](DATABASE_BASELINE.md).

Parity also exposed snapshot-only drift in `packages/db/src/schema.ts`: two missing checks, one missing index and redundant location foreign keys. Declarations and the generated snapshot now match existing journal behavior without rewriting migrations. Tenant constraint regression: 69 passed. This establishes a supported local baseline/upgrade path, not proof of the deployed database's schema or journal. Existing Railway snapshot adoption and production rollout remain unverified and require approval.

## A20 reconsent follow-up

`packages/consent/server.ts::grantVerifiedInboundConsent` now atomically persists scoped inbound evidence and client opt-in after signature validation in `app/api/twilio/inbound/route.ts`. Phone locks serialize with public intake/revocation; repeat IDs cannot replay an old START into new consent. Form/client/phone scope is validated. `hasScopedSmsConsent` excludes consent older than retained SMS STOP history; inbound decisions also use effective scope/history and recheck before synchronous delivery. Studio-wide STOP remains the conservative policy. Public intake still cannot reverse it.

The disposable PostgreSQL and actual signed HTTP handler test passed with synthetic credentials and outbound networking blocked. No live provider verification occurred. Remaining limitations: deleted legacy STOP history, full webhook crash/idempotency recovery, live YES confirmation and a separate sender-only suppression ledger/policy. These remain open; the implementation does not claim full A20 or production readiness.

## Twilio provisioning safety checkpoint

T02 now has a local preflight and existing-number service repair in the actual provisioning endpoint. Four mocked/direct tests passed; regression 235 passed, 9 opt-in groups skipped. Configuration failure occurs before external calls and repair avoids an extra purchase. T01 legal-customer bindings and T02/T03 operation-ledger/reconciliation work remain open; see TWILIO_ISV_AUDIT.md and TWILIO_LEGAL_CUSTOMERS.md. No live provider or deployed environment was accessed.
