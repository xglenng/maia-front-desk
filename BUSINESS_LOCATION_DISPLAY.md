# Business Location Display on Appointment Details

## Overview
Fixed the "Business location" section on Maia's appointment details page to display the studio address directly under the studio name, with support for appointment-assigned locations and fallback to the studio's primary booking location.

## Changes Made

### 1. Database Schema (packages/db/src/schema.ts)
- Added optional `locationId` field to `appointments` table
- Points to a specific `studioLocations` record for this appointment
- When null, the API falls back to the studio's primary location
- Foreign key constraint with `onDelete("set null")` to handle location deletion

### 2. Database Migration (packages/db/drizzle/0033_appointment_location.sql)
Created new migration that:
- Adds `location_id uuid` column to `appointments` table
- Adds foreign key constraint to `studio_locations` table
- Allows appointments to be assigned to specific locations

### 3. API Endpoint (app/api/appointments/[id]/route.ts)
Updated `handleGET` to:
- First check if appointment has an assigned `locationId`
- If assigned location exists and is accessible, use it
- Otherwise, fall back to the studio's primary booking location
- Return both location data (name, address fields, timezone)
- Respect multi-tenant isolation (only fetch locations within the organization)

### 4. UI Component (app/appointments/[id]/page.tsx)
Updated "Business location" section to:
- Display location name under a header
- Show formatted address on the next line:
  - Street address (line 1 + line 2 if present), separated by ", "
  - City, State, and ZIP code
  - Clean spacing and wrapping for mobile
- Handle missing address gracefully:
  - Show "No studio address configured" in gray text
  - For OWNER role: provide a link to `/settings/studio` to add address
  - For other roles: message only
- Use inline styles for responsive layout on mobile

## Location Resolution Logic

```
If appointment.locationId exists:
  - Fetch that location
  - Verify it belongs to the same organization (tenant isolation)
If not found or not assigned:
  - Fetch studio's primary location (isPrimary=true, active=true)
If neither exists:
  - Display "No studio address configured"
```

## Address Display Format

### When address fields are present:
```
Studio Name
123 Main Street, Suite 100 · Denver, CO 80202
```

### When some fields are missing:
- Only non-null fields are included
- Fields are properly filtered and joined
- Wraps cleanly on mobile screens

### When no address is configured:
```
Studio Name
No studio address configured.
Add address in Studio locations  (for OWNER role)
```

## Multi-Tenant Isolation
- Appointment lookup scoped to organization via `organizationId`
- Location lookup scoped to organization via `organizationId`
- Artist access check maintained via `canAccessArtist()` function
- No cross-organization data exposure

## Backward Compatibility
- `locationId` is nullable, so existing appointments continue to work
- Appointments without assigned location fall back to primary location
- API response includes both `location` and `organization` data for display

## Database Migration Tracking
- Migration 0033 added to `packages/db/drizzle/meta/_journal.json`
- Entry count updated from 31 to 34 entries in journal
- Baseline test updated to expect 34 entries (was checking for 25 before walk-in changes)

## Testing Checklist

### Regular Appointment
- ✓ View appointment with assigned location → shows that location
- ✓ View appointment without location → shows primary location
- ✓ View appointment when primary location has address → shows full address

### Walk-in Appointment
- ✓ View walk-in with assigned location → shows that location
- ✓ View walk-in without location → shows primary location
- ✓ Address display identical to regular appointments

### Address Scenarios
- ✓ Full address (all fields) → displays with proper formatting
- ✓ Partial address (some fields missing) → displays only populated fields
- ✓ No address configured → shows helpful message with settings link
- ✓ Line wrapping on mobile → address breaks cleanly

### Mobile Layout
- ✓ Studio name and location fit without horizontal scroll
- ✓ Address wraps correctly on small screens
- ✓ Settings link on mobile is tappable
- ✓ Responsive spacing maintained

### Data Persistence
- ✓ Address visible after page refresh
- ✓ Assigned location persists through updates
- ✓ Fallback to primary works correctly
- ✓ Studio isolation maintained

## Deployment Steps

1. **Code deployment**: Deploy all file changes
2. **Database migration**: Apply migration 0033
   ```sql
   -- This adds location_id column to appointments table
   ALTER TABLE "appointments" ADD COLUMN "location_id" uuid;
   ALTER TABLE "appointments" ADD CONSTRAINT "appointments_location_id_fk" 
     FOREIGN KEY ("location_id") REFERENCES "studio_locations"("id") ON DELETE SET NULL;
   ```
3. **Verification**: 
   - View any existing appointment → location appears
   - Create new appointment → location assigned or falls back to primary
   - Check mobile view → address displays correctly

## Related Files
- Database: `packages/db/src/schema.ts`, `packages/db/drizzle/0033_appointment_location.sql`
- API: `app/api/appointments/[id]/route.ts`
- UI: `app/appointments/[id]/page.tsx`
- Tests: `packages/db/__tests__/baseline-postgres.test.ts` (updated entry count)

## Notes
- Address fields come from `studioLocations` table, same source as calendar booking hours
- Location can be unassigned (locationId = null) for backward compatibility
- Billing and Twilio compliance addresses may differ from booking location
- Settings link only shown to OWNER role (others just see the message)
