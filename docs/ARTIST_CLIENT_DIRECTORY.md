# Signed-in artist client directory

The Clients dashboard view (`/api/dashboard?view=Clients`) resolves the single artist linked to the authenticated account, ignores owner artist selection for that view, and refuses accounts without exactly one linked profile. The page displays only that artist's name. Artist authorization and tenant validation still apply before the handler.

Clients must belong to the organization and have an association with the selected artist through a non-WEB_TEST conversation, an appointment, an invoice, or an explicit `artist_clients` row. Owners use the same association filter on this view; their existing studio-wide permissions elsewhere are unchanged. A client associated with multiple artists appears in each artist's directory. Unassigned legacy clients are not automatically assigned.

Manual client creation retains its owner-only policy and links new clients to the owner's authenticated artist in the same transaction. A missing or ambiguous profile causes a 409 without creating a client. Explicit associations do not grant SMS consent. Invoice customer selection and SMS client authorization recognize these links and retain their existing consent/provider checks.

## Deployment

Apply reviewed additive migration `0039_artist_clients.sql` before deploying the application code. It creates an empty relationship table, a uniqueness index, and composite foreign keys preventing cross-tenant artist/client links. No production migration was run during implementation. Do not use staging schema initialization on production.

Rollback application code first. Preserve/export the relationship table; dropping it would lose assignments for manually created clients. Leaving this additive table in place is the safer rollback. Existing relationships through appointment/message/invoice history require no backfill.

Validation: the opt-in PostgreSQL route test applies the migration on an isolated schema, checks manual assignment visibility, peer-only exclusion for owners, artist separation, missing-profile refusal, cross-organization FK rejection, and existing invoice workflows using synthetic providers.
