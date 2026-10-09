# A03 tenant relationship boundary

## Prepared change

`packages/db/src/schema.ts` now defines 16 unique `(id, organization_id)` parent keys and 65 composite tenant foreign keys. `packages/db/tenant-relations.json` records the exact coverage. Relationships include artist/user ownership, OAuth state, consent forms/evidence/inquiries, services, availability, channels, conversations, appointments, calendars, scheduling mappings, payments, waivers, Twilio accounts/services/numbers/porting/campaigns, automation context, and activation events. Existing location constraints remain intact.

Null optional references retain PostgreSQL MATCH SIMPLE behavior; organization IDs remain required. Original single-column foreign keys and delete behavior remain in place. The new composite constraints preserve explicit cascade behavior where the original reference cascaded. Parent primary keys already prevent duplicate IDs; the extra indexes enable organization-bound references.

The migration is `packages/db/drizzle/0005_tenant_relationship_boundaries.sql`. It sets a five-second lock timeout and sixty-second per-statement timeout, locks affected tables in a stable order, and checks all 65 relationship counts before adding indexes/constraints. Any inconsistent relationship raises a counts-only error. It never changes, merges, or deletes customer records. The read-only report is `packages/db/tenant-integrity.sql` and returns only failing relationship names/counts. The migration must run transactionally through the reviewed migration workflow.

Inbox, dashboard, channel, waiver, Twilio/compliance, and related payment/automation joins now include organization equality. This protects those reads before schema deployment; constraints protect writes once applied. Remaining unrelated query authorization is not proven by foreign keys.

## Verified locally

The dedicated local PostgreSQL suite passed 69 checks: snapshot/migration coverage, pre-migration inbox rejection of corrupted foreign artist/client references and acceptance of a valid conversation, dirty migration refusal without row changes/partial indexes, and all 65 cross-organization updates rejected with 23503 after migration. Valid synthetic rows were created for the affected child tables. The integrity report then returned no violations, and all 65 constraints were validated. Tests use a Unix-socket-only disposable cluster and isolated schemas; no production-derived fixture or provider access.

Full regression: 228 passed, no failures, six opt-in database groups skipped. TypeScript passed. Staging safety: three passed, one bootstrap group skipped. The regenerated staging snapshot contains the new constraints for future empty databases; the existing Railway clean database has not been upgraded.

## Rollout — not performed

1. Obtain explicit approval before inspecting a production database. Run the read-only count report in the exact approved environment; do not expose customer fields or provider credentials. Reconcile failures with explicit business/ownership decisions and audited corrections. The production-derived `Postgres-ACf_` remains excluded.
2. Test the reviewed upgrade against a properly isolated snapshot using synthetic data. Existing clean staging was bootstrapped from a current-schema snapshot without historical journal parity. Do not apply the whole legacy migration chain there; prepare a specific baseline-aware staging upgrade and preserve its bootstrap metadata/history (A24).
3. Review index size, constraint validation time, write volume and lock requirements. Large tables may need a separately reviewed concurrent-index / NOT VALID then VALIDATE rollout rather than this atomic small-database migration. Do not silently remove timeouts to make a live rollout succeed.
4. Take a protected backup and obtain explicit production migration/deployment approval. Confirm application and migration order, and run transactional migration only in the approved target. Foreign reference corrections, backup restores and production deployment each need their own concrete authorization.
5. Verify authorized read paths and valid tenant writes after deployment, plus constraint/role parity. Local test evidence does not establish deployed parity.

## Rollback and remaining boundaries

On preflight, lock or validation failure, transaction rollback leaves existing records and schema unchanged. For an applied migration, a reviewed rollback can drop only the 65 newly named constraints and then the 16 newly named indexes; keep original keys, constraints and customer data. Removing these guards reopens the cross-tenant write risk, so prefer a corrective change. No automatic rollback script or production action is installed.

These constraints enforce organization equality, not artist equality within a studio or client equality between a waiver/payment and its appointment. Shared client/template policy and domain-specific artist/client consistency remain separate authorization/state-machine requirements. Provider identifiers stored as raw strings/JSON are not covered by these relational keys. Messages and agent records inherit tenant identity through their single owning conversation/run; global queries still need explicit scope.

RLS was evaluated but not enabled: the current app uses a shared pool and has browser, webhook, public form and cross-tenant worker access paths. Safe RLS requires transaction-local tenant context on every path, a non-owner/non-BYPASSRLS application role, explicit public/webhook policies and a separately controlled worker role. Pool reuse without transaction-local context risks leaking a previous request's tenant. Implement and test that design as a separate change; do not infer production RLS or role state without an approved inspection. A03's composite-reference work is locally verified, while deployed integrity, role/RLS evaluation and rollout remain outstanding.
