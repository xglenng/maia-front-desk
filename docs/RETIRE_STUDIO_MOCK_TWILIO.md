# Embellished Studios mock-account retirement

Prepared maintenance only; not applied to production.

Target: Render service `srv-dbd4k6qvcj2c73es2n30`, internal database host `dpg-dbd69j7b9u1s73dgmev0-a`, database `maia_render_production`. Target verification reuses the existing maintenance target check. The studio is resolved from Val's fixed artist ID and its name must match Embellished Studios.

Inspect (default read-only):

```
node scripts/render-retire-studio-mocks.cjs
```

Apply only after approved inspection and maintenance authorization:

```
MAIA_RETIRE_STUDIO_MOCKS=1 node scripts/render-retire-studio-mocks.cjs
```

The whole organization's account/service/phone graph must have ACMOCK/MGMOCK/PNMOCK markers and MOCK_APPROVED numbers with matching account ownership. No legal-account bindings, A2P campaigns, port requests, account-creation intents, or provisioning operations may exist. The routine refuses cascading foreign keys and lets any other foreign-key reference abort the transaction. It never changes another tenant or calls Twilio.

On apply, a single `ARCHIVE_STUDIO_MOCK_TWILIO` activation event stores the old resource rows except encrypted credentials. Audit insertion and removal of the mock phone/service/account rows happen in one transaction. The legal business record is preserved. Only counts are printed. A rerun after successful cleanup makes no changes.

Rollback: before a live account is created, an operator can restore the archived synthetic graph in account/service/phone order with the original IDs, after checking uniqueness and references. Mock credential material is intentionally excluded; restoring a test record requires synthetic credential material, never real credentials. Do not restore mocks over newly created live resources. No automated rollback or live ownership inference is provided.

Validation: three unit tests plus an isolated PostgreSQL test passed. The database test loads the repository schema into a disposable local schema, verifies live-record refusal, inspection without writes, archived history, removal, and rerun behavior. No production or provider action was run during validation.

The free Render web service has no shell. If approved, publish the maintenance scripts, run inspection through a temporary deployment command, inspect the counts, then apply through a second temporary startup command and restore the normal command. Do not buy a number or create a live account as a side effect of cleanup. Production deployment and command changes require explicit authorization.
