# Versioned Maia consent forms

Maia-native consent forms have separate routing settings, saved content drafts,
immutable published versions, and authenticated read-only previews. Externally
hosted forms continue to be edited with their provider.

## Behavior

- **Edit form** changes the name, audience, wording, questions, selected logo, and
  signature wording in a draft. **Save draft** does not change issued links.
- **Publish new version** publishes the saved draft explicitly. Stale saves and
  simultaneous publications return a conflict; reload before retrying.
- New manual, AI, and automation assignments bind a published version under the
  same form lock used by publishing. Existing assignments keep their version.
- The first new assignment for a legacy native form adopts its current verified
  definition as version 1 for new links only. Any draft baseline advances with a
  revision change. Historical assignments are never backfilled.
- Public signing resolves the assignment's version, including its audience and
  template. Signed evidence and document hashes are not rewritten by editing.
- Saved-draft, current, and historical previews require owner or assigned-staff
  authorization and use the public signing renderer with submission disabled.
  Preview does not create assignments, submissions, messages, or automation jobs.
- Settings still manage routing, activation, and priority. Native audience changes
  belong in the content editor and publication workflow.

## Legacy records

Unsigned non-void assignments without a version block publication. Completed or
reviewed legacy assignments must have retained definition and audience evidence
matching the retained template body. Missing or unverifiable evidence blocks
publication. Form names never determine audience. An existing signed snapshot
is used to render a completed legacy assignment; current content is not substituted.

Review unresolved links and missing evidence from an authorized database copy.
Do not manufacture historical versions, infer wording from today's template,
or invalidate client links merely to bypass the guard. Any replacement/reissue
requires an explicit operational decision and preservation of existing evidence.
Production counts have not been inspected by this implementation.

## Database and rollout

Migration `0038_consent_versions.sql` adds `consent_form_versions`,
`consent_form_drafts`, and nullable `external_waiver_assignments.native_version_id`.
Composite foreign keys enforce organization/form consistency. Database triggers
prevent changes to published versions and their templates, and prevent rebinding
versioned assignments to a different version or recipient. Legacy rows remain null.

The migration was tested using Drizzle against a populated disposable PostgreSQL
0037-equivalent baseline and repeated to verify migration-journal idempotency.
The repository's full historical migration replay still fails on the pre-existing
`owner_welcome_emails` duplicate-table conflict around migrations 0027/0028.
Do not alter deployed historical migrations or skip journal entries blindly.
Inspect the actual target journal, resolve that conflict, review every pending
migration, and take a database backup before an approved release.

Quiesce issuance and editing during rollout: apply the reviewed migration and
release the matching application together. Old application code can still create
unversioned assignments. Verify manual and automated issuance, public signing,
editor authorization, and historical links before resuming normal operation.
This work does not authorize production migrations or deployment.

## Rollback

Retain all version/draft tables, templates, assignment references, signed records,
and hashes. After versioned assignments exist, reverting to the old public resolver
would make links read mutable current content again and is unsafe. Prefer disabling
new publication while retaining the version-aware resolver and signing path. Any
application rollback must preserve those capabilities and access to retained records.
No destructive down migration is supplied.

## Verification

`packages/waivers/__tests__/consent-versions-postgres.test.ts` exercises the real
migration, draft/publish conflicts, historical signing, legacy evidence guards,
read-only preview side effects, tenant/staff authorization, and database retention.
Run with the disposable container workflow used by request-flow tests; never set
its database configuration to production. Existing request-flow integration tests
also replay the new migration with the preceding request/industry migrations.
