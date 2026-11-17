# Walk-in Scheduling and Waiver Flow Fix - Summary

## Overview
Fixed Maia's walk-in scheduling to allow staff to create walk-ins outside public bookable hours, and implemented waiver flow for anonymous walk-ins.

## Changes Made

### 1. Backend Scheduling Changes

#### A. Modified `nativeSlotAvailable` function
**File**: `packages/booking/src/native-calendar.server.ts`

- Added optional `skipBookableHours` parameter (line 9)
- When `skipBookableHours=true`, the function:
  - **Still checks** for appointment conflicts and time-off blocks
  - **Still validates** that the slot is in the future
  - **Skips** the public bookable-hours restriction only
  - Returns `true` for free slots outside bookable hours

```typescript
export async function nativeSlotAvailable(
  tx:Transaction,
  organizationId:string,
  artistId:string,
  startsAt:Date,
  endsAt:Date,
  excludeId?:string,
  skipBookableHours?:boolean  // NEW
)
```

#### B. Updated Calendar API Routes
**File**: `app/api/calendar/route.ts`

- **POST handler (line 56)**: Pass `input.isWalkIn` to `nativeSlotAvailable` 
  - Walk-ins skip bookable-hours check
  - Regular bookings enforce hours
- **PATCH handler (line 118)**: Pass `current.isWalkIn` for reschedules
  - Allows existing walk-ins to be rescheduled outside bookable hours

```typescript
// POST - Create appointment
if(!await nativeSlotAvailable(tx,input.organizationId,input.artistId,
  startsAt,endsAt,undefined,input.isWalkIn))
  throw new Error('That time is outside bookable hours or is no longer available.');

// PATCH - Reschedule
if(!Number.isFinite(startsAt.getTime())||!await nativeSlotAvailable(
  tx,input.organizationId,input.artistId,startsAt,endsAt,current.id,current.isWalkIn))
  throw new Error('That time is outside bookable hours or is no longer available.');
```

### 2. Database Schema Changes

#### A. Walk-in Waiver Assignments
**File**: `packages/db/src/schema.ts` (line 754)

- Made `clientId` nullable in `externalWaiverAssignments`
- Allows anonymous walk-ins to have waivers without a pre-existing client

```typescript
clientId: uuid("client_id").references(() => clients.id),  // Now optional
```

**Migration**: `packages/db/drizzle/0031_walk_in_waivers.sql`
```sql
ALTER TABLE "external_waiver_assignments" ALTER COLUMN "client_id" DROP NOT NULL;
```

#### B. Walk-in Waiver Submissions
**File**: `packages/db/src/schema.ts` (line 674)

- Made `clientId` nullable in `waiverSubmissions`
- Allows signed waivers from anonymous walk-in clients to be archived

```typescript
clientId: uuid("client_id").references(() => clients.id),  // Now optional
```

**Migration**: `packages/db/drizzle/0032_walk_in_waiver_submissions.sql`
```sql
ALTER TABLE "waiver_submissions" ALTER COLUMN "client_id" DROP NOT NULL;
```

### 3. Waiver Assignment Endpoint Updates
**File**: `app/api/waiver-assignments/route.ts`

- Refactored `handlePOST` to handle walk-ins without client records
- **Key changes**:
  1. Fetch appointment first
  2. Optionally fetch client (nullable for walk-ins)
  3. For `CREATE_LINK` action: allow even without client contact details
  4. For SMS send action: reject if no phone number (must use CREATE_LINK for walk-ins)
  5. Store `clientId: client?.id || null` in assignment

```typescript
let client = appointment.clientId 
  ? (await db.select()...)[0] 
  : null;

if (parsed.data.action !== "CREATE_LINK" && client && (!client.phone || !client.smsOptIn)) {
  return NextResponse.json({ error: "..." }, { status: 409 });
}

// CREATE_LINK works for walk-ins without contact details
if(parsed.data.action==='CREATE_LINK'){
  await db.insert(externalWaiverEvents)...;
  return NextResponse.json({assignment,url:waiverUrl},{status:201});
}

// SMS send requires phone
if (!client || !client.phone) 
  return NextResponse.json({ 
    error: "Cannot send SMS to a walk-in without contact details. Use CREATE_LINK..." 
  }, { status: 409 });
```

## Workflow - Walk-in Waiver Flow

### 1. Create Anonymous Walk-in
- Staff opens Calendar
- Clicks "Walk-in" or toggles Walk-in in + Appointment
- Selects service, date, time, duration, price
- **No customer required**
- Saves walk-in appointment (creates generic "Walk-in" client)

### 2. Create Waiver Link
- From appointment details or Waivers page
- Staff clicks "Create consent form link"
- API creates waiver assignment with optional clientId
- Returns shareable waiver URL

### 3. Client Signs Waiver
- Client opens waiver URL on phone or studio tablet
- Fills form fields (including signer name and details)
- Signs and submits
- Signed submission saved with appointment
- No customer card created
- No SMS confirmations/reminders queued

### 4. Access Archive
- Signed waiver appears in waiver archive
- Searchable by appointment/artist
- Retained for 3 years per existing policy

## Validation & Safety

### Walk-ins Skip Only Public Bookable Hours
- ✅ Appointment conflict checks still enforced
- ✅ Explicit time-off blocks still enforced  
- ✅ Slot must be in the future
- ✅ Artist authorization still required
- ✅ Studio isolation still enforced

### Anonymous Walk-ins Create No Client Card
- ✅ Generic "Walk-in" client for appointment
- ✅ No SMS confirmations/reminders queued
- ✅ Waiver signer details collected in form only
- ✅ No follow-up conversations created

### Regular Bookings Unchanged
- ✅ Still require bookable hours
- ✅ Still require client selection
- ✅ All existing validation intact

## Testing Checklist

### Scheduling
- [ ] Create walk-in at 11 PM (outside bookable hours) → saves
- [ ] Walk-in survives browser refresh
- [ ] Reschedule walk-in to another off-hours slot → succeeds
- [ ] Create walk-in with conflicting appointment → "overlaps..." error
- [ ] Create walk-in during time-off → "artist has time off..." error
- [ ] Regular booking at 11 PM → "outside bookable hours" error
- [ ] Regular booking with valid client → still works

### Waivers
- [ ] Save anonymous walk-in (no customer)
- [ ] "Create consent form link" appears on walk-in appointment
- [ ] Generate waiver link (CREATE_LINK action)
- [ ] Share link with test inbox or mobile device
- [ ] Sign waiver with test name and details
- [ ] Signed submission appears in archive
- [ ] Archive shows signer details (not "Walk-in")
- [ ] Try SMS send for walk-in → error message redirects to CREATE_LINK

## Files Changed

### Core Changes
1. `packages/booking/src/native-calendar.server.ts` - Scheduling logic
2. `app/api/calendar/route.ts` - Calendar endpoints
3. `app/api/waiver-assignments/route.ts` - Waiver creation

### Schema Changes
4. `packages/db/src/schema.ts` - Made clientId optional in 2 tables
5. `packages/db/drizzle/0031_walk_in_waivers.sql` - Migration
6. `packages/db/drizzle/0032_walk_in_waiver_submissions.sql` - Migration

## Migration Instructions

### Staging/Production Deployment

1. Deploy code changes (without schema changes)
2. Run migrations:
   ```bash
   npm run apply-migration -- 0031_walk_in_waivers.sql
   npm run apply-migration -- 0032_walk_in_waiver_submissions.sql
   ```
3. Verify schema:
   ```sql
   \d external_waiver_assignments
   \d waiver_submissions
   -- Both should show client_id as nullable
   ```
4. Test on staging with existing waivers

## Backward Compatibility

- ✅ All existing appointments preserved
- ✅ All existing clients preserved
- ✅ All existing waivers unchanged
- ✅ Regular booking logic unchanged
- ✅ SMS/confirmation automation unchanged for regular bookings
- ✅ Archive retention policy unchanged (3 years)

## Implementation Notes

1. **Generic "Walk-in" Client**: Each walk-in creates a client with:
   - firstName: "Walk-in"
   - phone: null
   - email: null
   - notes: "Walk-in appointment - no contact follow-up"
   
   This ensures the appointments.clientId foreign key remains valid while marking them as anonymous.

2. **No Client Card in Directory**: Since phone/email are null and notes explicitly indicate walk-in, they don't appear in normal client lookups.

3. **Waiver Signer Details**: The waiver form collects the signer's actual name during signing. The `signedName` field in `waiverSubmissions` contains this detail, not "Walk-in".

4. **SMS Fallback**: Walk-ins created through CREATE_LINK don't receive SMS reminders. The waiver link is standalone and can be shared however the studio prefers.
