# Phase 05: PWA and Empty State UX

## Goal

Make the web app installable enough for beta use and ensure first-run and empty-state flows guide users directly to adding their first holding without a separate onboarding slide.

## Prerequisites

- Phase 04 Completion Criteria are met.
- The authenticated app shell and bottom navigation are stable.
- Home, portfolio, calendar, notifications, and settings routes are already implemented.

## Implementation Scope

- Add PWA manifest, app icons, theme color, and viewport metadata.
- Add a conservative service worker that caches static app assets only and does not cache authenticated Supabase data.
- Implement home-as-onboarding behavior for users with zero holdings.
- Implement portfolio and calendar empty states with clear add-holding CTAs.
- Ensure annual-goal empty state appears when holdings exist but no annual goal is set.
- Add portfolio sort controls that were noted as missing in MVP 1st verification.
- Keep cards and controls consistent with the existing financial app UI style.

## Core Tasks

1. **PWA metadata**
   - Add `manifest.webmanifest` or Next.js metadata manifest.
   - Provide required icon sizes using existing brand assets or simple generated app icons.
   - Set app name, short name, theme color, background color, display mode, and start URL.

2. **Service worker**
   - Cache static shell assets with a versioned cache name.
   - Avoid caching Supabase API responses, authenticated HTML, or user data.
   - Add update handling that does not interrupt active user workflows.

3. **Home onboarding empty state**
   - If holding count is zero, hide dividend number cards and show a single add-holding CTA.
   - Route CTA to the current stock search/add holding path.
   - Keep greeting and bottom navigation visible.

4. **Portfolio and calendar empty states**
   - Show portfolio empty state when no active holdings exist.
   - Show calendar empty state when no active holdings exist or no payment events match the selected year.
   - Use distinct copy for "no holdings" and "no events this year".

5. **Goal and sort UX**
   - Show annual goal CTA when holdings exist and `annual_dividend_goal_amount` is null.
   - Add portfolio sort options for highest annual after-tax dividend, ticker ascending, and recently added.
   - Ensure filters and sorts preserve stable layout on mobile.

6. **Unit tests to add**

   `src/features/holdings/sort.test.ts` (new):
   - `sortHoldings(holdings, 'annual_after_tax_desc')` returns holdings ordered highest annual after-tax dividend first.
   - `sortHoldings(holdings, 'ticker_asc')` returns holdings ordered by ticker string ascending.
   - `sortHoldings(holdings, 'recently_added')` returns holdings ordered by `created_at` descending.
   - Sorting preserves all holding fields; no field is mutated.
   - Empty array returns empty array for every sort option.

   `src/features/home/onboarding.test.ts` (new):
   - `getHomeDisplayMode(holdingCount)` returns `'onboarding'` when `holdingCount === 0`.
   - `getHomeDisplayMode(holdingCount)` returns `'dashboard'` when `holdingCount > 0`.

   `src/features/home/goal-state.test.ts` (new):
   - `getGoalDisplayState(holdingCount, annualGoal)` returns `'hidden'` when `holdingCount === 0`.
   - `getGoalDisplayState(holdingCount, null)` returns `'prompt'` when `holdingCount > 0`.
   - `getGoalDisplayState(holdingCount, 120000)` returns `'progress'` when `holdingCount > 0` and goal is set.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:unit` — all new sort, onboarding, and goal-state tests must pass.
- Run Playwright screenshots for mobile and desktop home, portfolio, and calendar empty states.
- Run a PWA/Lighthouse installability check if available locally.
- Manually verify service worker does not serve stale authenticated data after logout/login.

## Completion Criteria

- The app exposes valid PWA metadata and install icons.
- Static assets can be cached without caching user-specific Supabase responses.
- New users land on `/app/home` and see a clear add-holding CTA instead of zero-value dashboard cards.
- Portfolio and calendar empty states route users to add holdings.
- Annual goal unset state uses annual-goal copy and routes to settings or inline goal input.
- Portfolio sort controls exist and work with account filters.

## Excluded From This Phase

- Offline portfolio editing.
- Push notifications.
- Native app store packaging.
- Multi-step onboarding carousel.
- Account deletion.
