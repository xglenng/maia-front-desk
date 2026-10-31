# Square catalog import

## Behavior

On Services & Pricing, select an artist, open **Import from an app**, and choose Square → **Connect Square account**. Sign-in and authorization happen at Square. The connection requests only `ITEMS_READ`, not scheduling, customers, orders, or payments. It uses the existing configured Square application and registered callback URL (`SQUARE_REDIRECT_URI` or the app's `/api/integrations/square/callback`). No new redirect registration is needed if that existing callback is registered correctly.

After authorization, the artist returns to the same modal. **Read Square catalog** fetches the chosen service and merchandise variations and creates an editable preview using the existing CSV validation/import path. Names, service types, durations, and prices can be reviewed before saving. No service is saved at authorization or catalog read. A merchant account can contain multiple artists' services: users must choose only those intended for the selected artist.

Existing services are skipped by the established name/type duplicate rule; prices and deposits are not overwritten. New services follow the existing CSV-import defaults (no deposit, manual payment configuration), rather than connecting Square payments or scheduling. USD fixed prices and variable/quote prices are supported. Unsupported currencies/invalid fixed prices are skipped with a count. Missing durations remain validation errors for the user to correct. Imports are capped at 250 services; larger catalogs require split CSV imports. Merchandise can be imported alongside services as described below. Inventory and AI normalization remain outside this import.

## Security and isolation

The new `square_catalog_connections` table holds encrypted access/refresh tokens under the existing compliance encryption key, separately from `scheduling_connections`. Composite foreign keys bind artist and studio. Read, preview, connect, and disconnect require the studio owner or the artist's assigned user. OAuth uses a separate `square_catalog_oauth_states` table with hashed, user/studio/artist-bound, ten-minute, single-use state. The registered callback checks these states first and preserves the owner-only legacy scheduling callback as a separate branch.

Token exchange and refresh use fixed Square hosts, no redirects, and 15-second timeouts. Refresh writes use a compare-and-set guard so disconnect/reconnect cannot be overwritten by stale refreshes. Tokens are not returned to the browser. Disconnect clears only these stored catalog tokens; it does not revoke the entire Square app, since an independent scheduling connection might use it. Users may revoke access at Square when appropriate for all their connections.

The catalog parser reuses Square's existing pagination and integer handling, with a catalog-import-only page/cursor limit. The preview uses the existing tenant-scoped, transactional, artist-locked importer for deduplication. Neither the scheduling connection nor service-provider mappings are created or changed by catalog import.

## Configuration and deployment

Requires `SQUARE_APPLICATION_ID`, `SQUARE_APPLICATION_SECRET`, the configured environment, a registered HTTPS callback, and a stable existing `COMPLIANCE_ENCRYPTION_KEY` (or its established fallback). Never paste keys into a URL or commit them. Isolated local previews block live catalog reads and authorization except explicit sandbox authorization mode.

Migration `0023_square_catalog_connection.sql` adds two tables without changing existing data. Apply only with explicit production approval and before deploying code that reads them, including the shared callback. Local tests must cover fresh and populated journal upgrades. Rollback can leave the additive tables intact; rolling code back removes the feature without altering scheduling. Retain the encryption key for stored tokens; no credential rotation is part of this release.

Live OAuth and real Square account catalog access are not considered verified until an authorized sandbox/production account completes that flow. Automated tests use synthetic credentials and mocked Square responses, never real grants or payments.

## Validation evidence

- Unit tests verify the exact read-only scope, CSV escaping, source-value preservation, unsupported-price handling, and the import size limit.
- The isolated PostgreSQL test covers anonymous/peer/foreign access denial, hashed one-time OAuth state, wrong-user and expired state, denied grants, encrypted storage, preview/import/deduplication, refresh success/failure, local disconnect, tenant foreign keys, unchanged scheduling records/mappings, and the existing owner scheduling callback.
- The real Drizzle baseline test applies the journal on empty and populated supported local schemas and compares it with the generated staging snapshot.

## Review validation

Import remains disabled while any selected row has validation errors. The review footer shows the count, first affected service and error, a jump to that row, and an option to deselect rows with errors. Category and description fields are editable in each row’s details; category is limited to 80 characters and description to 500. Source content is never silently truncated. Unchecked rows do not block importing the selected valid services.

The review toolbar includes Select all, Deselect all, and a selected-service count. Bulk selection changes only the draft; saving still requires valid selected rows and an explicit Import action.

## Combined services and merchandise import

The connected Square panel offers Services only, Items only, or Services and items. Merchandise reads use the existing ITEMS_READ grant. REGULAR catalog items become merchandise; appointment services stay in the service review. Gift cards and other unsupported product types are excluded. Each variation retains its source name, SKU, category, and supported USD fixed/variable price. Invalid lengths remain editable rather than being silently truncated. Zero or unsupported fixed prices are skipped because Maia merchandise requires a positive fixed price.

Both groups are reviewed before a single Save action. `/api/services/import` validates item fields and inserts both groups in one transaction under the same artist row lock. Existing merchandise names are skipped using a trimmed, case-insensitive key, and existing prices are never overwritten. A failure rolls back both groups. Only selected rows are sent. No inventory, images, Square tax rules, deposits, or scheduling changes are imported. Item tax rates start at zero and must be reviewed.

On success the modal closes, the services list refreshes, and the importer shows counts for services and items. On failure the preview and selections remain available. This release requires no database migration. Deployment remains subject to production approval.

The Items page includes Import from Square beside Add item. It opens the same catalog review modal directly with Items only selected; users may switch to Services and items. A successful import closes the modal and reloads the item list. The artist selector is disabled while an import request is running. New Square authorizations use the existing callback flow, which returns to Services & Pricing and retains the chosen import kind for the same artist when session storage is available.
