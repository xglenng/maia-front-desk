# Manual Testing Guide: AI Business Manager & Continue Setup Banner

## Overview

This guide covers manual testing procedures for the new AI Business Manager and Continue Setup Banner features on the Maia Front Desk dashboard.

## Prerequisites

1. Local development environment running (`npm run dev`)
2. Signed-in user with organization and artist records
3. Dashboard accessible at `http://localhost:3000`
4. Browser developer tools open (for network inspection)

## Feature 1: Continue Setup Banner

### Test 1.1: Banner Visibility (Incomplete Setup)

**Precondition:** User's setup is not yet complete (at least one required step is incomplete)

**Steps:**
1. Navigate to the Overview dashboard
2. Look at the top of the main content area
3. Verify a dark banner appears with:
   - ✦ Sparkle icon
   - Text "Next setup step · [Step Name]" (e.g., "Next setup step · Check your services")
   - "Continue setup" button (blue/primary color)
   - Dismiss "×" button (top right of banner)

**Expected Result:** Banner displays with correct next step name, clear typography, and proper spacing

---

### Test 1.2: Continue Setup Button Navigation

**Precondition:** Banner is visible with an incomplete step

**Steps:**
1. Click the "Continue setup" button
2. Verify the onboarding wizard opens
3. Verify the wizard displays the correct step (matching the banner's stated next step)
4. Verify the URL includes `?onboardingStep=[step-id]` parameter
5. Complete or update a field in the step
6. Return to Overview (via browser back or close wizard)
7. Verify the banner now shows the next incomplete step (if any)

**Expected Result:** Wizard opens to correct step, progress is persisted, banner updates after changes

---

### Test 1.3: Banner Dismissal

**Precondition:** Banner is visible

**Steps:**
1. Click the "×" dismiss button on the banner
2. Verify the banner disappears immediately
3. Reload the page (`Cmd+R` or `Ctrl+R`)
4. Check if the banner reappears

**Expected Result (Current Implementation):** Banner reappears after reload (dismissal is session-only, not persisted to localStorage)

**Note:** Persistent dismissal across sessions is listed as a future enhancement

---

### Test 1.4: Banner Hides When Setup Complete

**Precondition:** All required setup steps are marked COMPLETE

**Steps:**
1. Ensure all required onboarding steps show status COMPLETE in `/api/onboarding/readiness`
2. Navigate to Overview
3. Look at the top of the content area

**Expected Result:** No banner appears. The Overview content flows directly from header to metrics

---

### Test 1.5: Mobile Responsive Behavior

**Precondition:** Banner is visible

**Steps (Desktop to Mobile):**
1. Open browser DevTools (F12)
2. Toggle Device Toolbar (Ctrl+Shift+M)
3. Set viewport to iPhone 12 (390×844) or similar
4. Verify banner appears correctly:
   - Banner spans full width
   - Text is readable and not truncated
   - Buttons are large enough to tap (48px+ height)
   - No horizontal scrolling

**Expected Result:** Banner is fully responsive and mobile-friendly

---

## Feature 2: AI Business Manager

### Test 2.1: Desktop Panel - Button and Open

**Precondition:** User is signed in

**Steps:**
1. Look at bottom-right corner of the viewport
2. Verify a button with ✦ (sparkle) icon appears
3. Click the sparkle button
4. Verify a panel opens with:
   - Dimensions approximately 360px wide × 520px tall
   - Positioned at bottom-right, with margin from edge
   - Fixed header with "Business Manager" title
   - Expand (⬆) and Close (✕) buttons in header
   - Message area with scrolling content
   - Composer with textarea and Send button at bottom

**Expected Result:** Panel opens correctly positioned, sized, and with all UI elements visible

---

### Test 2.2: Desktop Panel - Greeting Message

**Precondition:** Panel is open

**Steps:**
1. Verify the first message in the panel is from "Maia" (assistant)
2. Check the greeting text includes:
   - "Hi [FirstName]!" (personalized with user's first name if available)
   - "I'm your Maia Business Manager"
   - Reference to setup, bookings, invoices, and revenue
3. Below the greeting, verify:
   - Current onboarding progress summary
   - Link to the next setup step (if setup incomplete)

**Expected Result:** Personalized greeting with business context and setup progress

---

### Test 2.3: Desktop Panel - Starter Chips

**Precondition:** Panel is open and greeting message is visible

**Steps:**
1. Below the greeting, verify four clickable chips appear:
   - "Walk me through setup"
   - "This week's bookings"
   - "Unpaid invoices"
   - "Monthly revenue"
2. Click each chip one at a time
3. Verify each chip:
   - Inserts the corresponding text into the composer
   - Sends the message
   - Composer clears
   - Message appears in the conversation with "user" styling
   - AI responds with relevant content
   - Response is displayed with "assistant" styling

**Expected Result:** All four chips work; each sends appropriate message and receives response

---

### Test 2.4: Desktop Panel - Composer and Manual Messages

**Precondition:** Panel is open, starter chips have been clicked and responses received

**Steps:**
1. Click in the textarea composer
2. Type a custom question: "What's my studio's timezone?"
3. Press Send or Cmd+Enter / Ctrl+Enter
4. Verify:
   - Message appears in conversation as user message
   - Composer clears
   - AI responds with the timezone if available
   - Response is visible in the panel

**Expected Result:** Custom questions work; AI uses context to answer

---

### Test 2.5: Desktop Panel - Scroll Behavior

**Precondition:** Panel is open with multiple messages (>5 messages recommended)

**Steps:**
1. Verify scrollbar appears in message area if content exceeds 400px
2. Scroll up to see earlier messages
3. Send a new message
4. Verify panel auto-scrolls to show the latest message
5. Manually scroll up to see earlier messages
6. Verify manual scroll position is respected (doesn't auto-jump)

**Expected Result:** Scrolling works smoothly; auto-scroll to latest happens on new messages

---

### Test 2.6: Desktop Panel - Header Controls

**Precondition:** Panel is open

**Steps:**
1. Click the Expand (⬆) button
2. Verify the panel expands or transitions to a larger view
3. Click the Close (✕) button
4. Verify the panel closes and disappears

**Expected Result:** Header controls work; panel can be expanded and closed

---

### Test 2.7: Mobile Panel - Full-Screen View

**Precondition:** Browser viewport is mobile-sized (< 700px width), user is signed in

**Steps (in Mobile Viewport):**
1. Click the ✦ (sparkle) button
2. Verify the view transitions to full-screen modal:
   - Overlay covers entire viewport
   - Fixed header at top with "Business Manager" title and close button (✕)
   - Message area takes most of the viewport
   - Composer stays at bottom
3. Verify greeting and starter chips appear
4. Click a starter chip
5. Verify message is sent and response appears

**Expected Result:** Mobile view is full-screen with fixed header and composer above keyboard

---

### Test 2.8: Mobile Panel - Keyboard Behavior

**Precondition:** Mobile panel is open

**Steps (on actual mobile device or DevTools device emulation):**
1. Click in the textarea
2. Verify the keyboard appears and doesn't cover the composer
3. Type some text
4. Verify composer stays visible above keyboard
5. Send the message
6. Dismiss keyboard (tap outside or return key)
7. Verify panel layout adjusts correctly

**Expected Result:** Composer stays visible above keyboard; no overlap or layout shift

---

### Test 2.9: Mobile Close Button

**Precondition:** Mobile panel is open

**Steps:**
1. Verify close button (✕) appears in the fixed header
2. Click it
3. Verify the panel closes and returns to the normal dashboard view
4. Verify the ✦ button is still visible in the bottom-right corner

**Expected Result:** Close button works; returns to dashboard with button still accessible

---

## Feature 3: Business Manager AI Responses

### Test 3.1: Weekly Bookings Response

**Precondition:** Panel is open, there are appointments scheduled for the current week

**Steps:**
1. Click "This week's bookings" starter chip
2. Wait for AI response
3. Verify response includes:
   - Summary of appointments for the week
   - Client names and service types
   - Appointment times/dates
   - Distinction between confirmed and pending appointments

**Expected Result:** AI provides accurate summary of this week's bookings

---

### Test 3.2: Empty Bookings Handling

**Precondition:** Panel is open, there are NO appointments for the current week

**Steps:**
1. Click "This week's bookings" starter chip
2. Wait for AI response
3. Verify response indicates no appointments (e.g., "No appointments scheduled for this week")

**Expected Result:** AI gracefully handles empty data

---

### Test 3.3: Monthly Revenue Response

**Precondition:** Panel is open, there are confirmed appointments with pricing in the current calendar month

**Steps:**
1. Click "Monthly revenue" starter chip
2. Wait for AI response
3. Verify response includes:
   - Total revenue amount
   - Date range (current calendar month)
   - Number of confirmed appointments
   - Note about what's included (confirmed appointments only, excludes pending)

**Expected Result:** AI provides accurate monthly revenue summary

---

### Test 3.4: Unpaid Invoices Response

**Precondition:** Panel is open

**Steps:**
1. Click "Unpaid invoices" starter chip
2. Wait for AI response
3. Verify response indicates:
   - "Invoice management is coming soon" (current placeholder)
   - OR actual invoice data if the `studioInvoices` table integration is complete

**Expected Result:** Placeholder message or actual data depending on implementation status

---

### Test 3.5: Setup Walkthrough

**Precondition:** Panel is open, setup is incomplete

**Steps:**
1. Click "Walk me through setup" starter chip
2. Wait for AI response
3. Verify response:
   - Explains the current incomplete step
   - Provides a link to navigate to that step (e.g., `/settings/studio?onboardingStep=studio`)
4. Click the link
5. Verify the settings page opens with the correct onboarding step active
6. Return to the dashboard/Business Manager
7. Verify the AI can continue the walkthrough

**Expected Result:** AI explains setup steps and provides working navigation links

---

## Feature 4: Theming and Styling

### Test 4.1: Light Theme

**Precondition:** Dashboard is in light mode

**Steps:**
1. Open Business Manager panel
2. Verify styling:
   - Background is light (--paper color)
   - Text is dark (--ink color)
   - Buttons have appropriate contrast
   - Border appears subtle
   - Sparkle icon (✦) is visible
3. Check Continue Setup Banner:
   - Background is dark/accent color
   - Text is readable
   - Buttons contrast well

**Expected Result:** All components are properly styled for light theme

---

### Test 4.2: Dark Theme

**Precondition:** Dashboard is in dark mode

**Steps:**
1. Open Business Manager panel
2. Verify styling:
   - Background is dark (--paper color for dark theme)
   - Text is light (--ink color for dark theme)
   - Buttons have appropriate contrast
   - Border is visible but subtle
3. Check Continue Setup Banner:
   - Still readable
   - Button colors contrast properly

**Expected Result:** All components are properly styled for dark theme

---

## Feature 5: Data Isolation and Permissions

### Test 5.1: Organization Isolation

**Precondition:** Set up two separate organizations, with different artists and appointments

**Steps (with OWNER role user from Org A):**
1. Sign in as OWNER of Organization A
2. Click starter chips in Business Manager
3. Verify data shown only belongs to Org A
4. Sign out
5. Sign in as OWNER of Organization B
6. Open Business Manager
7. Verify data shown only belongs to Org B

**Expected Result:** Users only see their own organization's data

---

### Test 5.2: Artist Role - Data Limitation

**Precondition:** Create two artists in the same organization (Artist 1 and Artist 2)

**Steps (with ARTIST role user as Artist 1):**
1. Sign in as Artist 1
2. Open Business Manager
3. Click "This week's bookings"
4. Verify bookings shown only include appointments for Artist 1
5. Sign out
6. Sign in as Artist 2
7. Open Business Manager
8. Verify bookings shown only include appointments for Artist 2

**Expected Result:** ARTIST role users only see their own data, not other artists' data

---

### Test 5.3: OWNER Role - Full Access

**Precondition:** Multiple artists in organization with appointments

**Steps (with OWNER role user):**
1. Sign in as OWNER
2. Open Business Manager
3. Click "This week's bookings"
4. Verify bookings include all artists' appointments
5. Verify no data from other organizations is visible

**Expected Result:** OWNER users see all artists' data within their organization

---

## Feature 6: Responsive Design Verification

### Test 6.1: Desktop (1920×1080)

**Steps:**
1. Set viewport to 1920×1080
2. Verify Business Manager button appears at bottom-right
3. Open panel
4. Verify panel is 360px × 520px with margin from edges
5. Verify all content is visible without horizontal scroll

**Expected Result:** Desktop layout is correct

---

### Test 6.2: Tablet (768×1024)

**Steps:**
1. Set viewport to 768×1024 (iPad portrait)
2. Verify Business Manager button appears
3. Open panel
4. Verify panel is still 360px width (about 47% of screen)
5. Verify content is readable

**Expected Result:** Tablet layout displays correctly

---

### Test 6.3: Mobile (390×844)

**Steps:**
1. Set viewport to 390×844 (iPhone 12)
2. Verify Business Manager button appears at bottom-right
3. Open panel
4. Verify full-screen overlay appears (triggered at 700px breakpoint)
5. Verify header is fixed and doesn't scroll
6. Verify composer is at bottom, stays above keyboard
7. Verify no horizontal scrolling

**Expected Result:** Mobile layout uses full-screen mode correctly

---

## Feature 7: Error Handling

### Test 7.1: Network Error - Chat API Fails

**Precondition:** Business Manager panel is open

**Steps (with network simulation):**
1. Open DevTools Network tab
2. Enable throttling or simulate offline
3. Send a message via starter chip or composer
4. Verify:
   - Request fails (network error shown in console)
   - User message appears in conversation
   - Error response appears (e.g., "Sorry, I encountered an error")
   - Composer is still functional

**Expected Result:** Errors are handled gracefully; user can retry

---

### Test 7.2: No Organization Error

**Precondition:** User exists but has no organization

**Steps:**
1. Attempt to open Business Manager
2. Verify API call returns 404
3. Check browser console for error
4. Verify panel shows an error message or doesn't load

**Expected Result:** Error is handled without crashing the UI

---

### Test 7.3: No Artists Error

**Precondition:** Organization exists but has no artists

**Steps:**
1. Open Business Manager
2. Send a message
3. Verify API response includes "No artists configured"
4. Verify error appears in UI

**Expected Result:** Graceful error message

---

## Feature 8: Integration with Onboarding

### Test 8.1: Setup Progress Consistency

**Precondition:** Setup is incomplete

**Steps:**
1. Open Business Manager panel
2. Note the setup progress shown in greeting
3. Note the next step mentioned
4. Note any links provided
5. Click "Continue setup" button in the banner (or link in Business Manager)
6. Complete or advance one step in the wizard
7. Return to dashboard
8. Open Business Manager again
9. Verify progress has updated to reflect the completion

**Expected Result:** Business Manager and banner stay in sync with setup progress

---

### Test 8.2: Setup Completion

**Precondition:** Complete all required setup steps

**Steps:**
1. Mark all steps as COMPLETE
2. Return to Overview dashboard
3. Verify Continue Setup banner is hidden
4. Open Business Manager
5. Verify greeting mentions setup is complete (or similar)
6. Verify no setup progress is shown

**Expected Result:** Both banner and Business Manager reflect setup completion

---

## Accessibility & Usability

### Test A.1: Keyboard Navigation

**Precondition:** Business Manager panel is open

**Steps:**
1. Press Tab to focus elements
2. Verify focus order:
   - Header buttons (expand, close)
   - Message area (read-only, may skip)
   - Textarea composer
   - Send button
   - Starter chips
3. Use Enter to activate buttons and send messages
4. Use Shift+Tab to reverse navigate

**Expected Result:** All interactive elements are keyboard accessible

---

### Test A.2: Screen Reader

**Precondition:** Screen reader enabled (e.g., NVDA, JAWS, VoiceOver)

**Steps:**
1. Navigate to Business Manager button
2. Verify button is labeled (aria-label or visible text)
3. Open panel
4. Verify "Business Manager" heading is announced
5. Tab through elements and verify labels are announced
6. Verify messages have clear structure

**Expected Result:** Screen reader users can navigate and understand the interface

---

## Summary Checklist

### Continue Setup Banner
- [ ] Appears when setup is incomplete
- [ ] Shows correct next step name
- [ ] "Continue setup" button opens wizard to correct step
- [ ] Dismiss button works (session-only)
- [ ] Hides when setup is complete
- [ ] Responsive on mobile
- [ ] Styled correctly in light and dark themes

### Business Manager Panel
- [ ] Button (✦) appears in bottom-right
- [ ] Panel opens with correct dimensions on desktop
- [ ] Full-screen view on mobile (<700px)
- [ ] Greeting is personalized with user's first name
- [ ] All four starter chips work
- [ ] Composer sends messages correctly
- [ ] Auto-scrolls to latest messages
- [ ] Header controls (expand, close) work
- [ ] Mobile keyboard behavior is correct

### AI Responses
- [ ] Weekly bookings summary is accurate
- [ ] Monthly revenue is calculated correctly
- [ ] Unpaid invoices shows placeholder or data
- [ ] Setup walkthrough explains steps with links
- [ ] Responses include relevant business context
- [ ] Handles empty data gracefully
- [ ] Respects organization and artist isolation

### Theming & Styling
- [ ] Light theme styling is correct
- [ ] Dark theme styling is correct
- [ ] Buttons have proper contrast
- [ ] Text is readable throughout
- [ ] Icons render correctly

### Data Isolation
- [ ] Organization isolation is enforced
- [ ] Artist role sees only own data
- [ ] OWNER role sees all artists' data
- [ ] No cross-organization data leaks

### Error Handling
- [ ] Network errors are handled
- [ ] Missing data displays appropriate messages
- [ ] Invalid requests return proper errors
- [ ] UI remains functional after errors

---

## Known Limitations & Future Work

1. **Dismissal Persistence:** Banner dismissal is session-only. To persist dismissal across sessions, store state in localStorage and check on page load.

2. **Invoice Data:** Unpaid invoices currently show a placeholder. Full integration requires the `studioInvoices` table.

3. **Streaming Responses:** Long AI responses currently wait for full completion before displaying. Future: Use streaming API for progressive display.

4. **Timezone Handling:** Revenue calculations currently use server timezone. Future: Ensure all calculations use studio's configured timezone.

5. **Usage Counter:** Usage metrics not yet displayed. Requires integration with API usage/allowance system.

6. **Links in Business Manager:** Links from Business Manager responses to other Maia screens (e.g., Calendar view for bookings) are not yet fully implemented.

---

## Quick Reference: API Endpoints

- **Readiness API:** `GET /api/onboarding/readiness`
- **Business Manager Chat:** `POST /api/business-manager/chat`
  - Request: `{ "message": "string" }`
  - Response: `{ "reply": "string" }`

---

## Quick Reference: Component Locations

- **Banner Component:** `/components/continue-setup-banner.tsx`
- **Business Manager Component:** `/components/business-manager-panel.tsx`
- **Chat API:** `/app/api/business-manager/chat/route.ts`
- **Dashboard Integration:** `/app/page.tsx` (lines 1-160)
- **Tests:** 
  - `/packages/onboarding/__tests__/continue-setup-banner.test.ts`
  - `/components/__tests__/continue-setup-banner.test.tsx` (to be expanded)

---

## Troubleshooting

**Business Manager panel doesn't open:**
- Check browser console for errors
- Verify user is signed in
- Verify viewport is not on unsupported screen size

**AI responses are generic or missing data:**
- Check browser network tab for `/api/business-manager/chat` request
- Verify response includes business context in the system prompt
- Check that user's organization has artists and appointments

**Banner doesn't appear:**
- Navigate to `/api/onboarding/readiness` in browser to verify data
- Check that setup is actually incomplete
- Verify user is signed in

**Mobile layout shows panel instead of full-screen:**
- Check window.innerWidth against 700px breakpoint
- Verify DevTools device emulation is correct
- Try actual mobile device

---

End of Manual Testing Guide. For questions or issues, refer to the code comments in component files.
