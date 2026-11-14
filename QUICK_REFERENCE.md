# AI Business Manager & Continue Setup Banner - Quick Reference

## What Was Built

### 1. Continue Setup Banner
- **Location:** Top of Overview dashboard
- **Shows:** Next incomplete setup step
- **Action:** Click "Continue setup" → Wizard opens to that step
- **Dismiss:** Click × (session-only for now)
- **Hides:** Automatically when setup complete

### 2. AI Business Manager
- **Button:** ✦ sparkle icon, bottom-right corner
- **Desktop:** 360×520px floating panel
- **Mobile:** Full-screen overlay
- **Features:**
  - Personalized greeting with user's name
  - Four starter chips with real data
  - Custom message composer
  - AI responses with business context

## File Locations

```
Components:
  components/continue-setup-banner.tsx (3.5 KB)
  components/business-manager-panel.tsx (15 KB)

API:
  app/api/business-manager/chat/route.ts (6.9 KB)

Tests:
  packages/onboarding/__tests__/continue-setup-banner.test.ts (2 KB)

Integration:
  app/page.tsx (lines 1-160, imports + integration)

Docs:
  AI_BUSINESS_MANAGER.md (tech overview)
  MANUAL_TESTING_GUIDE.md (test procedures)
  IMPLEMENTATION_SUMMARY.md (what was delivered)
  DEPLOYMENT_CHECKLIST.md (go-live checklist)
```

## Key Features

### Continue Setup Banner
```
✦ Next setup step · Check your services
[Continue setup]  [×]
```
- Auto-hides when setup complete
- Opens wizard at incomplete step
- Respects existing permissions

### Business Manager Panel
```
╔═══════════════════════════════╗
║ Business Manager  ⬆ ✕        ║
╠═══════════════════════════════╣
║ Hi [Name]! I'm your Maia...  ║
║ [Current setup progress]      ║
║                                ║
║ [Walk me through setup]       ║
║ [This week's bookings]        ║
║ [Unpaid invoices]             ║
║ [Monthly revenue]             ║
║                                ║
║ User: "What's my timezone?"   ║
║ Maia: "Your timezone is..."   ║
╠═══════════════════════════════╣
║ [Compose message...]  [Send] ║
╚═══════════════════════════════╝
```

## API Endpoint

```
POST /api/business-manager/chat

Request:
  { "message": "string" }

Response:
  { "reply": "string" }

Requires: Authentication (identity check)
Returns: 401 if not authenticated, 404 if no org, 200 with reply on success
```

## Testing Commands

```bash
# Type check
npm run typecheck

# Build
npm run build

# Run new tests
node --import tsx --test packages/onboarding/__tests__/continue-setup-banner.test.ts

# Run all tests (including pre-existing)
npm test

# Dev server
npm run dev
# Then navigate to http://localhost:3000
```

## Desktop Layout (≥700px)

```
┌─────────────────────────────────────────────────┐
│ Overview | Calendar | Inbox | Clients          │
└─────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────┐
│ ✦ Next setup step · Check your services  [×]   │ ← Banner
├─────────────────────────────────────────────────┤
│                                                  │
│ Dashboard content here                          │
│                                                  │
│                                                  │
│                                    ┌──────────┐ │
│                                    │ ✦ Chat  │ │ ← Button
│                                    └──────────┘ │
└─────────────────────────────────────────────────┘
     When clicked: 360×520px panel appears at bottom-right
```

## Mobile Layout (<700px)

```
┌─────────────────────────────┐
│ Overview | Calendar | ...   │
└─────────────────────────────┘
┌─────────────────────────────┐
│ ✦ Next setup · Services  [×]│ ← Banner
├─────────────────────────────┤
│ Dashboard content           │
│                             │
│                             │
│                             │
│          ✦ (button) ────────┼─────→ When clicked: Full-screen modal
└─────────────────────────────┘
```

## Performance Targets

- **API Response:** <2 seconds
- **Page Load Impact:** Minimal (<100ms additional)
- **Bundle Size:** ~25KB (gzipped) for both components
- **Memory:** Minimal, components clean up on unmount

## Security Notes

- All API requests require authentication
- Organization isolation enforced at database level
- Artist role gets artist-scoped data only
- Owner role gets all organization data
- No sensitive data in error messages
- Input validation with Zod

## Data Included in AI Context

- **Weekly Bookings:** Appointments Monday-Sunday current week
- **Monthly Revenue:** Confirmed appointments in current calendar month
- **Onboarding Status:** Current setup progress and next step
- **Studio Timezone:** For accurate time calculations
- **User Role:** OWNER or ARTIST (affects data scope)

## Integration Points

1. **Onboarding System**
   - Uses `stageComplete()` from `@/packages/onboarding/wizard`
   - Fetches progress from `/api/onboarding/readiness`
   - Opens wizard with `onboardingStep` query parameter

2. **Database Layer**
   - Drizzle ORM queries with organization filtering
   - Appointments, artists, clients, organizations tables
   - Type-safe Date comparisons

3. **AI System**
   - Uses `configuredLanguageModel()` from `@/packages/ai`
   - Dynamic system prompt with business context
   - Existing LLM configuration applied

4. **Dashboard**
   - Integrated into `/app/page.tsx`
   - Banner in Overview view
   - Panel globally available

## Responsive Breakpoint

- **700px:** Switches between desktop panel and mobile full-screen
- Uses `window.innerWidth` at component init and on resize
- Handles viewport changes gracefully

## Future Work

1. **localStorage:** Persist dismissed banner state
2. **Invoices:** Connect to actual invoices table
3. **Streaming:** Implement ReadableStream for long responses
4. **Usage Counter:** Display API allowance
5. **Help Desk:** Add support chat link
6. **History:** Remember conversation context
7. **Deep Links:** Quick navigation from responses

## Troubleshooting

### Banner doesn't appear
- Check `/api/onboarding/readiness` in browser
- Verify setup is incomplete
- Ensure user is signed in

### Business Manager doesn't respond
- Check network tab for `/api/business-manager/chat` requests
- Verify user's organization has artists
- Check console for TypeScript/runtime errors
- Verify API key/auth token is valid

### Mobile layout shows panel instead of full-screen
- Check `window.innerWidth < 700` threshold
- Verify DevTools device emulation (if testing)
- Try actual mobile device

### Styling looks wrong
- Clear browser cache
- Check CSS variables (--ink, --paper, etc.)
- Verify light/dark theme toggle working
- Inspect element in DevTools

### Data looks incomplete
- Verify organization/artist has appointments
- Check database directly for data
- Verify user role (ARTIST vs OWNER)
- Check timezone for date range queries

## Support Resources

- **Technical Details:** See `AI_BUSINESS_MANAGER.md`
- **Testing Procedures:** See `MANUAL_TESTING_GUIDE.md`
- **Implementation Details:** See `IMPLEMENTATION_SUMMARY.md`
- **Deployment Guide:** See `DEPLOYMENT_CHECKLIST.md`
- **Code Comments:** Check component source files
- **Tests:** See `packages/onboarding/__tests__/continue-setup-banner.test.ts`

## Version Info

- **Node.js:** 18+ (uses node:test)
- **Next.js:** 15.5.25
- **React:** 18+
- **TypeScript:** 5+
- **Database:** Drizzle ORM with PostgreSQL
- **AI:** ai@4.3.19

## Deployment Status

✅ **Code Complete**  
✅ **TypeScript Passes**  
✅ **Build Succeeds**  
✅ **Tests Pass**  
✅ **Documentation Complete**  
⏳ **Manual QA Testing**  
⏳ **Staging Deployment**  
⏳ **Production Deployment**  

---

**For More Information:** See documentation files in repository root  
**Last Updated:** November 2024  
**Status:** Ready for QA Testing
