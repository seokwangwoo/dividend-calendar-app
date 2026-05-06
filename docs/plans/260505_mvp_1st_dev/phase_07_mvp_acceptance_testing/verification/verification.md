# Phase 07 Verification

- Phase file: `docs/plans/260505_mvp_1st_dev/phase_07_mvp_acceptance_testing/plan.md`
- Verification date: 2026-05-06
- Environment: local Next.js/Node workspace with `.env.local`; Playwright E2E tests use the configured Supabase project.

## E2E Coverage Added

Added Playwright configuration and four E2E test suites:

- `playwright.config.ts`
- `tests/e2e/helpers.ts`
- `tests/e2e/mvp-critical-flows.spec.ts`
- `tests/e2e/portfolio.spec.ts`
- `tests/e2e/calendar.spec.ts`
- `tests/e2e/notifications.spec.ts`

### `mvp-critical-flows.spec.ts` (3 tests)
- Signup and password reset entry points.
- Logged-out redirect from `/app/home`.
- Login through the browser UI.
- New holding creation for KDDI `9433`.
- Calendar route and 12-month display.
- Portfolio listing after holding creation.
- Stock detail and notification rule setup with investment-neutral disclaimer.
- Settings monthly goal persistence and tax notice.
- Logout.
- Non-admin redirect away from `/admin/*`.
- Admin access to admin placeholder route.

### `portfolio.spec.ts` (3 tests)
- Edit holding quantity (100株 → 200株) via UI.
- Soft delete holding and verify it disappears from portfolio list.
- Account type filter shows only NISA, only 特定口座, and all holdings.

### `calendar.spec.ts` (4 tests)
- 12-month display and year navigation (next/prev year).
- Basis toggle between 税引後 and 税引前.
- Account type filter (NISA, 特定口座, 全口座).
- Month row click reveals dividend detail with totals.

### `notifications.spec.ts` (3 tests)
- Unread notification shows 未読 badge; clicking 既読にする changes it to 既読.
- すべて既読にする marks all unread notifications as read and hides the button.
- Investment-neutral disclaimer is visible on the notifications page.

### Helper additions in `helpers.ts`
- `createHolding(userId, stockId, quantity, averagePurchasePrice, accountType)` — inserts a holding via admin client.
- `createInAppNotification(userId, stockId, opts)` — inserts an in-app notification via admin client.

## Commands

- PASS: `npm run typecheck`
  - `tsc --noEmit` completed successfully after adding all new test files.
- PASS: `npm run lint`
  - `eslint . --max-warnings=0` completed successfully.
- PASS: `npm run test:unit`
  - 2 files, 19 tests passed.
- PASS: `npm run build`
  - Next.js production build completed successfully.
- PASS: `npm run test:integration`
  - 10 files, 62 tests passed covering RLS, admin review pipeline, dividend calculation, calendar, home, stock detail, notifications, settings, and unsupported stock rules.
- PASS: `npx playwright test --list`
  - 13 E2E tests discovered across 4 spec files.
- BLOCKED: `npm run test:e2e`
  - Full E2E execution requires a running Next.js dev server and a connected Supabase project.
  - Tests are discoverable and type-check cleanly; runtime execution has not been verified in this environment.

## Current Status

E2E tests have been extended from 3 to 13 tests covering portfolio CRUD, calendar interactions, and notification management. All tests are discoverable and pass static analysis. Runtime execution is blocked pending a connected environment with `npm run test:e2e`.
