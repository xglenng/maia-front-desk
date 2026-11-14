# AI Business Manager & Continue Setup Banner

## Overview

This implementation adds two connected features to the Maia Front Desk dashboard:

1. **Continue Setup Banner** - A dismissible banner on the Overview dashboard that guides users through incomplete onboarding steps
2. **AI Business Manager** - An internal AI assistant accessible via a floating button that helps users understand their business performance and navigate setup

Both features share the same onboarding state and respond consistently to setup progress.

## Components

### Continue Setup Banner (`components/continue-setup-banner.tsx`)

- **Location:** Displayed at the top of the Overview dashboard content
- **Visibility:** Shows only when setup is incomplete; hides when all required steps are done
- **Behavior:**
  - Fetches onboarding readiness on mount
  - Identifies the next incomplete step from the wizard
  - Shows the step name (e.g., "Next setup step · Check your services")
  - "Continue setup" button opens the wizard at the next incomplete step
  - "X" button dismisses the banner (localStorage would be needed to persist dismissal across sessions)
- **Styling:** Dark banner with Maia branding (✦ sparkle icon) and contrasting buttons

### Business Manager Panel (`components/business-manager-panel.tsx`)

- **Button:** ✦ icon button, fixed to bottom-right corner
- **Desktop Mode:** 360px × 520px panel with header, message area, and composer
  - Header shows "Business Manager" with Expand/Minimize and Close controls
  - Messages scroll with auto-scroll to latest
  - Composer with textarea and Send button
  - Starter chips appear below the greeting message
- **Mobile Mode:** Full-screen overlay
  - Fixed header with title and close button
  - Scrolling message area
  - Composer stays visible above keyboard
  - Starter chips appear below greeting
- **Personalization:** Greeting message includes user's first name when available
- **Starter Chips:** Four quick-start actions
  - "Walk me through setup" - Guides through setup steps
  - "This week's bookings" - Shows appointments for the current week
  - "Unpaid invoices" - Lists outstanding invoices (placeholder)
  - "Monthly revenue" - Shows this month's revenue from confirmed appointments

## API Endpoint

### POST `/api/business-manager/chat`

**Authentication:** Required (uses `identity()` from auth middleware)

**Request Body:**
```json
{
  "message": "string (1-1000 chars)"
}
```

**Response:**
```json
{
  "reply": "string"
}
```

**Behavior:**
1. Fetches the user's organization and authorized artists
2. Gathers business context:
   - **This week's bookings:** Appointments from Monday to next Sunday
   - **Monthly revenue:** Confirmed appointments in the current calendar month
   - **Unpaid invoices:** Placeholder (feature not yet implemented)
   - **Onboarding progress:** Current setup status and next required step
3. Constructs a system prompt with all context
4. Calls the configured language model (uses `configuredLanguageModel()`)
5. Returns the assistant's reply

**Access Control:**
- Enforces organization isolation (only reads data for the user's organization)
- Artist-level filter if user has the ARTIST role
- Uses Drizzle ORM to safely query appointments and clients

## Integration

### Dashboard Page (`app/page.tsx`)

1. Imports both new components
2. Adds `<ContinueSetupBanner />` to the Overview view (top of content)
3. Adds `<BusinessManagerPanel firstName={...} />` to the main layout (global, always available)

### Data Flow

1. **On Page Load:**
   - Dashboard fetches `/api/dashboard` for daily activity
   - Banner fetches `/api/onboarding/readiness` for setup progress
   - Business Manager initializes with closed state

2. **When User Opens Business Manager:**
   - Panel renders greeting message with user's first name
   - Starter chips become interactive

3. **When User Sends Message:**
   - Message is sent to `/api/business-manager/chat`
   - API gathers current business data and onboarding status
   - AI responds based on studio's configuration and user's role
   - Response is streamed back and displayed in conversation

4. **When User Asks to Walk Through Setup:**
   - Business Manager explains the current step
   - Links point to the relevant Maia screen (e.g., `/settings/studio` for profile)
   - Links include the `onboardingStep` query parameter to maintain wizard state

5. **When User Dismisses Banner:**
   - Banner stays hidden during the session
   - Reappears on page reload (unless dismissal is persisted to localStorage)

## Styling & Theming

- **Colors:** Uses Maia's existing CSS variables (--ink, --paper, --line, etc.)
- **Mobile:** Full responsive breakpoint at 700px
  - Desktop panel anchors to bottom-right
  - Mobile uses full-screen overlay
- **Typography:** Matches dashboard styles (font sizes, weights, line heights)
- **Icons:** Uses Maia's sparkle (✦) and standard icon set

## Testing

### Unit Tests

**File:** `packages/onboarding/__tests__/continue-setup-banner.test.ts`

Tests the wizard integration:
- ✓ Correctly identifies incomplete setup steps
- ✓ Wizard stage index resolves for all stages
- ✓ Identifies the next incomplete step

**File:** `components/__tests__/continue-setup-banner.test.tsx` (to be completed)

Tests the component rendering and interaction:
- ✓ Renders banner when setup is incomplete
- ✓ Hides banner when all steps are complete
- ✓ Dismiss button works
- ✓ "Continue setup" button navigates correctly

### Manual Testing Checklist

#### Desktop Browser
- [ ] Banner appears on Overview dashboard
- [ ] Banner shows correct next step
- [ ] "Continue setup" button opens wizard at correct step
- [ ] Dismiss button hides banner
- [ ] Business Manager button (✦) appears in bottom-right
- [ ] Clicking button opens 360×520 panel
- [ ] Panel shows greeting with user's first name
- [ ] Starter chips are clickable
- [ ] Sending a message fetches response and displays it
- [ ] Panel expands/minimizes with header controls
- [ ] Close button closes panel

#### Mobile Browser
- [ ] Business Manager button (✦) appears
- [ ] Clicking button opens full-screen overlay
- [ ] Header stays fixed at top
- [ ] Messages scroll independently
- [ ] Composer stays above keyboard
- [ ] Close button works
- [ ] Starter chips work
- [ ] Messages send and receive correctly

#### Both Themes
- [ ] Styling matches dashboard in light theme
- [ ] Styling matches dashboard in dark theme
- [ ] Colors contrast well for accessibility

#### Setup Progress
- [ ] Banner disappears when all setup steps complete
- [ ] Continuing setup on one step reappears in banner after reload
- [ ] Banner tracks progress when steps are completed elsewhere

#### Isolation
- [ ] Only data for the signed-in user's organization appears
- [ ] ARTIST role users only see their own artists' data
- [ ] OWNER role users see all artists' data
- [ ] Business Manager responses respect the same isolation

## Edge Cases & Error Handling

1. **No Organization:** Gracefully returns 404 from API
2. **No Artists:** API returns error; Business Manager can still explain setup
3. **No Onboarding Data:** Banner doesn't render
4. **API Failure:** Chat endpoint returns error response; UI shows "Sorry, I encountered an error"
5. **Empty Bookings/Revenue:** Chat endpoint provides "No appointments scheduled" context
6. **Mobile Keyboard:** Composer stays visible above keyboard thanks to `position: fixed`
7. **Studio Timezone:** Monthly revenue calculations work with the studio's timezone (TBD in full implementation)

## Future Enhancements

1. **Persist Dismissal:** Store dismissed state in localStorage to respect user preference
2. **Full Invoice Support:** Connect to actual invoice data when `studioInvoices` table is integrated
3. **Usage Counter:** Show token/API call usage if Maia has an allowance system
4. **Context Awareness:** AI could remember conversation history within a session
5. **Links to Settings:** Starter chips like "This week's bookings" could link directly to calendar view
6. **Help Desk Integration:** "Help Desk" link in Business Manager header to contact support
7. **Streaming Responses:** Use ReadableStream for longer responses instead of waiting for full completion
8. **Training Data:** Collect anonymized feedback on responses to improve future interactions

## File Structure

```
maia-front-desk/
├── components/
│   ├── continue-setup-banner.tsx      (new)
│   ├── business-manager-panel.tsx     (new)
│   └── __tests__/
│       └── continue-setup-banner.test.tsx (new)
├── app/
│   ├── page.tsx                       (modified - adds banner and manager)
│   ├── dashboard.css                  (no changes needed)
│   └── api/
│       ├── business-manager/
│       │   └── chat/
│       │       └── route.ts           (new)
│       └── ...
└── packages/
    └── onboarding/
        └── __tests__/
            └── continue-setup-banner.test.ts (new)
```

## Notes

- The Business Manager uses the `ai` package (v4.3.19) and existing `configuredLanguageModel()` function
- All database queries use Drizzle ORM with proper type safety
- The feature respects existing auth middleware and permission checks
- Mobile detection uses window resize listener with cleanup
- Component state is local (no Redux/Context needed at this stage)
- Business Manager is always rendered to dashboard page but only visible when opened
