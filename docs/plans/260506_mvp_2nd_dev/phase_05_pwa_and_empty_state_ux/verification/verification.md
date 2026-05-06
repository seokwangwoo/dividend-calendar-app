# Phase 05 Verification Evidence

- Phase file: `docs/plans/260506_mvp_2nd_dev/phase_05_pwa_and_empty_state_ux/plan.md`
- Verification date: 2026-05-06
- Environment: Local development (Node.js, Vitest)

## Test Plan Verification

| # | Check | Command | Status | Notes |
|---|-------|---------|--------|-------|
| 1 | Lint | `npm run lint` | PASS | No warnings |
| 2 | Type check | `npm run typecheck` | PASS | No errors |
| 3 | Build | `npm run build` | PASS | Next.js build succeeded |
| 4 | Unit tests | `npm run test:unit` | PASS | 309 tests passed |
| 5 | Playwright screenshots | N/A | SKIPPED | Playwright not configured for empty-state screenshots in local dev |
| 6 | Lighthouse installability | N/A | SKIPPED | Requires built and served app; manifest structure validated manually |
| 7 | Manual SW stale-data check | N/A | SKIPPED | Requires browser runtime; SW excludes auth paths explicitly |

## Unit Test Details

### `src/features/holdings/sort.test.ts`
- `annual_after_tax_desc` orders highest first — PASS
- `ticker_asc` orders by ticker string ascending — PASS
- `recently_added` orders by `created_at` descending — PASS
- Preserves fields, no mutation — PASS
- Empty array returns empty array — PASS

### `src/features/home/onboarding.test.ts`
- `getHomeDisplayMode(0)` returns `'onboarding'` — PASS
- `getHomeDisplayMode(>0)` returns `'dashboard'` — PASS

### `src/features/home/goal-state.test.ts`
- `getGoalDisplayState(0, *)` returns `'hidden'` — PASS
- `getGoalDisplayState(>0, null)` returns `'prompt'` — PASS
- `getGoalDisplayState(>0, number)` returns `'progress'` — PASS

## Implementation Summary

1. **PWA metadata**
   - `public/manifest.webmanifest` with name, short_name, theme_color, background_color, display, start_url, and SVG icons.
   - `src/app/layout.tsx` updated with `manifest`, `icons`, and `viewport` metadata (themeColor, device-width).

2. **Service worker** (`public/sw.js`)
   - Versioned static cache (`static-v1`).
   - Caches only same-origin static assets (script, style, image, document, manifest).
   - Explicitly bypasses `/auth/`, `/api/`, Supabase URLs, and requests with `Authorization` header.
   - Cleanup of old caches on activate.

3. **Service worker registration** (`src/components/service-worker-registration.tsx`)
   - Client-side effect registers `/sw.js` on mount.
   - Included in `RootLayout`.

4. **Home onboarding / empty state**
   - Home page already had `hasHoldings` check with `EmptyState`.
   - Added `getHomeDisplayMode` and `getGoalDisplayState` helpers for explicit state logic.
   - Goal prompt shows when holdings exist but `annual_dividend_goal_amount` is null.

5. **Portfolio sort**
   - `src/features/holdings/sort.ts` implements `sortHoldings` with three options.
   - `PortfolioClient` updated with sort pill buttons alongside account-type filters.
   - Sort recomputes on filter or sort change using `useMemo`.

6. **Calendar empty state**
   - `CalendarClient` shows centered message when `calendar.length === 0` and not loading.

## Skipped Checks Justification

- **Playwright screenshots**: Playwright config exists but empty-state screenshot specs are not part of the current test suite.
- **Lighthouse installability**: Manifest structure and icon paths were validated manually; full Lighthouse requires serving the built app.
- **Manual SW stale-data check**: Service worker code explicitly skips authenticated requests; runtime verification requires browser.

## Failures

- None.
