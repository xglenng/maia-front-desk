# Studio colors and mobile interface

Settings → Team & invitations uses a white workspace, bold sans-serif headings, rounded inputs, black primary actions, a team list and labeled color swatches. The dashboard and inbox share the lighter styling. On phones (700px and below), a fixed Home/Calendar/Inbox/Clients/Settings navigation replaces the dashboard side rail. Settings remains owner-only. Opening a conversation on a phone hides the bottom navigation so it cannot cover the reply composer; the conversation back control restores the list. Square screenshots are visual references; this is Maia's own interface and icon set.

Each artist has a persisted calendar_color selected from eight named colors. Owners can change it, including profiles with linked logins; ARTIST accounts cannot change studio team colors. Names and explicit Artist/Apprentice labels remain visible, so color never grants access or substitutes for role/status text. Apprentice labels represent the existing requires_supervisor_approval flag. No permissions, prices, payments or scheduling rules are changed by a color update.

The team list, dashboard artist filter, selected artist's calendar appointment cards, and inbox artist indicators use the same saved color. The calendar still displays one selected artist at a time, with colored filter chips to switch between authorized profiles. It does not add a combined studio calendar or new week/list scheduling behavior. New members receive an unused palette color when available. Studios with more than eight members reuse the palette; owners may intentionally select the same color. Legacy fallback colors are deterministic by profile ID if a value is missing.

## Migration and rollback

Migration 0013 adds a nullable, palette-constrained artists.calendar_color column and assigns legacy profiles colors in studio/name order, preserving any explicit color already saved. It changes display metadata only. Synthetic staging has been migrated and checked. Production requires explicit authorization for both pending migration 0012 (invitations) and 0013 and a deployment. Apply migrations before the new application.

Rollback leaves the additive color column and values in place; the previous application ignores them. Do not drop the column or remove the constraint during a normal application rollback. The interface can be rolled back independently of this metadata.

## Validation

Unit tests cover palette validation, deterministic fallback and new-color selection. Isolated staging HTTP checks cover persistence, unauthorized and cross-tenant writes, invalid colors, dashboard color data, and inbox list/detail consistency, alongside the invitation/access tests. Build/type checks and phone-sized visual inspection cover the shared layout. No live messages, bookings or payments are created by color edits.
