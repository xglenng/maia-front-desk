# AI Business Manager & Continue Setup Banner - Deployment Checklist

## Pre-Deployment Verification

### Code Quality ✅
- [x] TypeScript compilation: **PASSED** (0 errors)
- [x] Next.js build: **PASSED** (no errors)
- [x] Linting: Follows existing project patterns
- [x] New test suite: **PASSED** (4/4 tests)
- [x] Full test suite: **PASSED** (120+ tests, 3 pre-existing failures unrelated to new code)

### Components Created
- [x] `components/continue-setup-banner.tsx` (3.5KB)
- [x] `components/business-manager-panel.tsx` (15KB)
- [x] `app/api/business-manager/chat/route.ts` (6.9KB)
- [x] `packages/onboarding/__tests__/continue-setup-banner.test.ts` (2KB)

### Files Modified
- [x] `app/page.tsx` - Added imports and integrated components

### Documentation
- [x] `AI_BUSINESS_MANAGER.md` - Technical overview
- [x] `MANUAL_TESTING_GUIDE.md` - Comprehensive testing procedures
- [x] `IMPLEMENTATION_SUMMARY.md` - Delivery summary

## Pre-Production QA Checklist

### Desktop Browser Testing
- [ ] Chrome (latest)
  - [ ] Banner displays at top of Overview
  - [ ] Business Manager button visible in bottom-right
  - [ ] Business Manager panel opens at 360×520px
  - [ ] All four starter chips work
  - [ ] Custom messages send and receive responses
  - [ ] Panel closes correctly
  - [ ] Light theme: correct styling
  - [ ] Dark theme: correct styling

- [ ] Safari (latest)
  - [ ] All interactive elements work
  - [ ] No layout issues
  - [ ] Scrolling smooth
  - [ ] Keyboard navigation works

- [ ] Firefox (latest)
  - [ ] All features functional
  - [ ] Styling consistent
  - [ ] No browser-specific issues

### Mobile Browser Testing
- [ ] iOS Safari (iPhone 12/13/14)
  - [ ] Business Manager button visible
  - [ ] Full-screen modal opens
  - [ ] Keyboard appears above composer
  - [ ] Messages send and receive
  - [ ] Close button works
  - [ ] Scrolling works
  - [ ] Banner displays correctly

- [ ] Chrome Android
  - [ ] Full-screen modal on mobile breakpoint
  - [ ] Responsive layout correct
  - [ ] Touch interactions work
  - [ ] Keyboard handling correct

### Tablet Testing
- [ ] iPad (landscape and portrait)
  - [ ] Layout adapts correctly
  - [ ] Business Manager panel displays properly
  - [ ] All interactions work

### Feature Testing

#### Continue Setup Banner
- [ ] Appears when setup incomplete
- [ ] Shows correct next step name
- [ ] "Continue setup" button opens wizard to correct step
- [ ] Dismiss button works (session-only for now)
- [ ] Disappears when all setup complete
- [ ] Updates when setup progresses
- [ ] Responds to onboarding API changes in real-time

#### Business Manager Panel
- [ ] Greeting message appears with user's first name
- [ ] Onboarding progress displayed (if incomplete)
- [ ] All four starter chips present and clickable
- [ ] Starter chips trigger correct messages:
  - [ ] "Walk me through setup"
  - [ ] "This week's bookings"
  - [ ] "Unpaid invoices"
  - [ ] "Monthly revenue"
- [ ] Custom message composer works
- [ ] Send button sends messages
- [ ] Enter key sends (Cmd+Enter on Mac, Ctrl+Enter on Windows)
- [ ] Messages display with correct styling (user vs assistant)
- [ ] Auto-scroll to latest messages
- [ ] Scrolling up to see history works
- [ ] Panel header controls work (expand, close)

#### AI Responses
- [ ] "This week's bookings" shows accurate data
- [ ] "Monthly revenue" calculated correctly with date range
- [ ] "Unpaid invoices" shows placeholder or actual data
- [ ] "Walk me through setup" provides explanation and links
- [ ] Setup links navigate correctly (e.g., `/settings/studio?onboardingStep=studio`)
- [ ] Responses include relevant business context
- [ ] Empty data handled gracefully

### Theme Testing
- [ ] Light theme colors correct
- [ ] Dark theme colors correct
- [ ] Good contrast in both themes
- [ ] Icons render correctly
- [ ] All text readable

### Data Isolation
- [ ] Sign in as user from Organization A
  - [ ] Only Org A data visible in Business Manager
  - [ ] Only Org A appointments shown
  - [ ] Only Org A revenue calculated
- [ ] Sign in as different user from Organization B
  - [ ] Only Org B data visible
  - [ ] No cross-organization data leakage
- [ ] Sign in as ARTIST role user
  - [ ] Only own appointments shown
  - [ ] Only own artist's revenue visible
  - [ ] Other artists' data not accessible
- [ ] Sign in as OWNER role user
  - [ ] All artists' appointments visible
  - [ ] Total organizational data shown
  - [ ] Still no data from other organizations

### Error Handling
- [ ] Network error (simulate offline)
  - [ ] Graceful error message appears
  - [ ] Composer still functional
  - [ ] User can retry
- [ ] No organization (if possible to test)
  - [ ] Proper error response
  - [ ] UI doesn't crash
- [ ] No artists configured
  - [ ] Clear error message
  - [ ] Appropriate guidance provided
- [ ] Empty/missing data
  - [ ] AI explains missing data naturally
  - [ ] No zero values or generic responses

### Accessibility
- [ ] Tab navigation through all interactive elements
- [ ] Keyboard shortcuts work (Enter to send, etc.)
- [ ] Focus indicators visible
- [ ] Screen reader compatible (test with NVDA/JAWS/VoiceOver)
- [ ] Color contrast meets WCAG AA standards

### Performance
- [ ] Page load time not noticeably increased
- [ ] Business Manager API responds in <2 seconds
- [ ] No console errors
- [ ] Network waterfall looks reasonable
- [ ] No memory leaks (check DevTools over time)

### Integration with Existing Features
- [ ] Dashboard Overview tab still works
- [ ] Calendar tab unaffected
- [ ] Inbox tab unaffected
- [ ] Clients tab unaffected
- [ ] Settings remain accessible
- [ ] No conflicts with existing styles
- [ ] No conflicts with existing scripts

## Deployment Steps

### 1. Pre-Deployment (Dev Environment)
```bash
# Verify builds succeed
npm run typecheck    # TypeScript compilation
npm run build        # Next.js production build
npm test             # Run all tests

# Verify no console errors in dev server
npm run dev
# Navigate to each dashboard view and check browser console
```

### 2. Staging Deployment
- [ ] Deploy to staging environment
- [ ] Run full manual test suite (use MANUAL_TESTING_GUIDE.md)
- [ ] Test with production-like data volume
- [ ] Verify API performance under load
- [ ] Check for any edge cases with real data

### 3. Production Deployment
- [ ] Create deployment PR with changes
- [ ] Request review from team
- [ ] Obtain approval
- [ ] Deploy to production
- [ ] Monitor error logs for first 24 hours
- [ ] Verify in production:
  - [ ] Banner appears for incomplete setups
  - [ ] Business Manager opens and responds
  - [ ] All data is accurate
  - [ ] No unusual error patterns

### 4. Post-Deployment
- [ ] Monitor error tracking (Sentry, etc.)
- [ ] Check API logs for failures
- [ ] Verify user engagement metrics if available
- [ ] Gather feedback from early users
- [ ] Document any issues found

## Rollback Plan

If critical issues are discovered:

1. **Quick Rollback (if needed within 1 hour)**
   ```bash
   # Revert the deployment
   git revert [deployment-commit]
   npm run build
   # Redeploy
   ```

2. **Feature Flag (if available)**
   - Disable Business Manager and banner via feature flag
   - Keep code deployed for later debugging

3. **Partial Rollback**
   - Disable Business Manager API if that's the issue
   - Keep banner (it only displays existing onboarding data)

## Known Limitations to Document for Users

1. **Banner Dismissal is Session-Only**
   - Currently, dismissing the banner only hides it for the current session
   - The banner will reappear after a page refresh
   - Future: Will persist dismissal to localStorage

2. **Invoice Management**
   - "Unpaid invoices" chip currently shows a placeholder message
   - Full invoice integration pending implementation of invoices table
   - Feature: Will show actual unpaid invoice count and details

3. **Streaming Responses**
   - Long AI responses wait for full completion before displaying
   - Future: Will implement streaming responses for better UX

4. **Usage Counter**
   - No usage counter displayed yet
   - Future: Will show API call allowance and remaining quota

## Success Metrics

After deployment, track:

1. **Adoption Metrics**
   - How many users open the Business Manager?
   - How often are starter chips used?
   - What percentage click "Continue setup"?

2. **Setup Metrics**
   - Does the banner help users progress through setup?
   - Reduction in incomplete setups?
   - Faster setup completion times?

3. **Engagement Metrics**
   - Average messages per session
   - User satisfaction/feedback
   - Repeat usage of Business Manager

4. **Performance Metrics**
   - API response time (should be <2s)
   - Page load impact
   - Error rates

## Communication

### What to Tell Users

1. **New Feature: Continue Setup Banner**
   - Appears at top of Overview when setup is incomplete
   - Guides you to the next step
   - Click "Continue setup" to proceed

2. **New Feature: AI Business Manager**
   - New ✦ button in bottom-right corner
   - Ask questions about your bookings, revenue, and setup
   - Four quick-start options available
   - Open questions about your business

### What to Tell Support

- Users can dismiss the banner if they want to see it later
- Banner reappears on page refresh
- Business Manager works best with complete setup
- API may be slower if organization has large data volumes
- Contact support if responses seem inaccurate

## Final Checklist Before Going Live

- [ ] All tests passing
- [ ] Build succeeds
- [ ] No TypeScript errors
- [ ] Code reviewed and approved
- [ ] Documentation complete and accurate
- [ ] Screenshots/demos prepared if needed
- [ ] Support team trained
- [ ] Monitoring/alerts configured
- [ ] Rollback plan in place
- [ ] Team on call for first 24 hours after deployment

---

**Deployment Status:** Ready for QA → Staging → Production  
**Timeline:** After manual testing approval  
**Owner:** Development Team  
**Last Updated:** 2024  
