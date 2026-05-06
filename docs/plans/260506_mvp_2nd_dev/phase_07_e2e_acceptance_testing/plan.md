# Phase 07: E2E Acceptance Testing

## Goal

Verify that all MVP 2nd features work end to end in a real browser against the connected Supabase project, confirm user-visible behavior matches the design, and catch cross-feature regressions not covered by unit or integration tests.

## Prerequisites

- Phases 01–06 Completion Criteria are all met.
- `npm run test:unit` and `npm run test:integration` pass with no failures.
- A running Next.js dev or preview server is available at the configured base URL.
- Playwright is installed and `playwright.config.ts` is configured.
- Test helpers in `tests/e2e/helpers.ts` can create and clean up users, holdings, dividend events, and notifications via the Supabase admin client.

## Implementation Scope

- Extend `tests/e2e/helpers.ts` with any helper functions needed for Phase 07 scenarios.
- Add Playwright spec files covering the new behaviors introduced in Phases 01–06.
- Update existing spec files (`mvp-critical-flows.spec.ts`, `portfolio.spec.ts`, `calendar.spec.ts`, `notifications.spec.ts`) where existing assertions conflict with Phase 01–06 changes.
- Every spec file must clean up its own test data in `afterAll`.

## Core Tasks

### 1. Helper additions (`tests/e2e/helpers.ts`)

- `createDividendEventViaAdmin(stockId, overrides)` — insert a dividend event with specified `payment_year`, `estimated_payment_month`, `review_status`, and `dividend_per_share`.
- `approveDividendEventViaAdmin(eventId)` — set `review_status = 'approved'` directly for a test event.
- `createHoldingWithGoal(userId, stockId, quantity, price, accountType, annualGoal)` — create a holding and set `annual_dividend_goal_amount` on `user_settings`.
- `setUserSetting(userId, key, value)` — upsert a single setting field for a test user.
- `getNotificationCount(userId)` — return the count of unread in-app notifications for a user.

### 2. Consistency verification (`tests/e2e/consistency.spec.ts`)

- **Annual total matches across screens**: Log in as a user with KDDI and JT holdings. Capture the annual after-tax dividend shown on `/app/home`. Navigate to `/app/portfolio`. Verify the portfolio annual total matches the home total.
- **Calendar reconciles with annual total**: On `/app/calendar`, sum the displayed monthly amounts for the current `payment_year`. Verify the sum equals the annual after-tax total shown on home and portfolio.
- **`payment_year` filter**: Navigate to the next year on `/app/calendar`. Verify the monthly amounts change (or show zero when no events exist for next year). Navigate back and verify the original amounts return.
- **Pending/rejected events excluded**: Create a pending dividend event for a held stock via helper. Verify the pending event amount does not appear in home or calendar totals. Approve the event. Verify the amount now appears.

### 3. Admin workflow (`tests/e2e/admin-workflow.spec.ts`)

- **Non-admin blocked**: Log in as a normal user. Navigate to `/admin`. Verify redirect or 403 response.
- **Admin can create and approve event**: Log in as admin. Navigate to `/admin/dividend-events/new`. Fill in KDDI `9433`, `payment_year`, `estimated_payment_month`, and `dividend_per_share`. Submit. Verify event appears in the admin list as `pending`. Click approve. Verify `review_status` changes to `approved` in the list. Navigate to `/app/home` as a normal user holding KDDI. Verify the approved event amount is reflected.
- **Admin can reject event**: Create a pending event via helper. Log in as admin. Navigate to the event. Click reject. Enter a rejection reason. Verify `review_status` changes to `rejected`. Verify the event amount is absent from the normal user's home and calendar.
- **Source URL is preserved**: Create an event with a source URL via the admin form. Verify the source URL appears as a link in the admin event list.

### 4. Price refresh and alert reliability (`tests/e2e/alerts.spec.ts`)

- **Stale price suppresses yield alert display**: Use a helper or admin API to set `stocks.price_updated_at` to 49 hours ago for a test stock. Log in as a user with a yield alert rule for that stock. Navigate to the notification rules or alert settings for that stock. Verify a stale-price warning or suppression indicator is displayed. (If the UI does not expose this, verify via the integration test for evaluation and document the manual check.)
- **State-transition: alert fires only once**: Set up a yield alert rule with `last_condition_met = false` and a condition the current yield meets. Trigger evaluation via admin API or Edge Function invocation. Verify one notification is created. Trigger evaluation again. Verify no additional notification is created. Navigate to `/app/notifications` and verify exactly one notification is listed.
- **Dividend change alert only for holders**: Create an approved dividend event change for a stock that User A holds but User B does not. Trigger the change notification via admin API. Navigate to `/app/notifications` as User B. Verify no notification for the change is shown. Navigate as User A. Verify the notification is shown.

### 5. Email delivery (`tests/e2e/email-delivery.spec.ts`)

End-to-end email delivery cannot be fully verified without a real Resend sandbox. Cover the following at the UI and API level instead.

- **Email opt-in persists**: Log in as a user. Go to `/app/settings`. Enable email notifications. Save. Reload the page. Verify the email notification toggle is still enabled.
- **Email opt-out persists**: Disable email notifications. Save. Reload. Verify toggle is off.
- **Delivery state visible to admin**: After triggering a notification that should be emailed (user has email enabled), verify the notification record in the admin view shows `email_delivery_status` in a pending or sent state (not errored silently). Document that actual Resend delivery is verified separately via sandbox or logs.

### 6. PWA and empty state UX (`tests/e2e/pwa-and-empty-state.spec.ts`)

- **New user onboarding flow**: Log in as a freshly created user with no holdings. Navigate to `/app/home`. Verify the add-holding CTA is shown. Verify dividend summary cards are absent. Click the CTA. Verify navigation reaches the stock search/add-holding page.
- **Portfolio empty state**: Navigate to `/app/portfolio` as the same zero-holding user. Verify an empty state is shown with an add-holding CTA. Verify no portfolio summary numbers appear.
- **Calendar empty state**: Navigate to `/app/calendar`. Verify a "no holdings" or "no events" empty state is shown rather than zero-value rows.
- **Annual goal prompt**: Log in as a user with holdings but no `annual_dividend_goal_amount` set. Navigate to `/app/home`. Verify a goal-setting CTA is visible.
- **Portfolio sort**: Log in as a user with at least two holdings with different annual dividend amounts. Navigate to `/app/portfolio`. Apply the "highest annual after-tax dividend" sort. Verify the first holding has the highest amount. Apply "ticker ascending". Verify holdings are sorted by ticker alphabetically.
- **PWA manifest reachable**: Fetch `GET /manifest.webmanifest`. Verify HTTP 200, `Content-Type: application/manifest+json`, and the response contains `name`, `short_name`, `display`, and at least one `icons` entry.

### 7. CSV import and calendar basis (`tests/e2e/csv-import.spec.ts`)

- **Valid CSV import**: Log in as a user with no holdings. Upload a CSV containing one valid KDDI row (`9433,100,4300,nisa`). Verify the preview shows one valid row with calculated annual dividend. Confirm import. Verify the holding appears in `/app/portfolio`.
- **Invalid row blocked**: Upload a CSV containing a valid row and an invalid row (negative quantity). Verify the invalid row shows a row-level error. Verify only the valid row is imported after confirmation.
- **Unsupported ticker error**: Upload a CSV with only an unsupported ticker. Verify a row error says the ticker is not supported. Verify no holding is created.
- **Existing holdings not overwritten**: Add a KDDI holding manually. Upload a CSV with a second KDDI row. Verify a second holding row is created, not an overwrite of the first.
- **Calendar basis switch — payment month default**: Navigate to `/app/calendar`. Verify the basis control shows "支払月" (or equivalent payment-month label) as the active selection.
- **Calendar basis switch — record date**: Switch the basis to record date. Verify months with unknown record dates show an "unknown" indicator rather than a value. Verify months with known record dates show the expected amounts.
- **Calendar basis switch — ex-dividend date**: Switch the basis to ex-dividend date. Verify months without ex-dividend date data show unknown state.
- **Basis change preserves other filters**: Apply NISA account filter and "税引後" amount basis. Switch the calendar view basis. Verify NISA filter and after-tax basis are still active.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:unit` — all unit tests must pass.
- Run `npm run test:integration` — all integration tests must pass.
- Run `npx playwright test --workers=1` — all E2E specs must pass, including new Phase 07 specs.
- Review `test-results/` for any failed traces. Fix failures caused by the current phase.
- Document any tests skipped due to blocked infrastructure (Resend sandbox, Stooq network) with concrete justifications.

## Completion Criteria

- Home, portfolio, and calendar show the same annual after-tax dividend total for the same user, year, and approved events.
- Admin workflow for creating, approving, and rejecting events is verified end to end.
- Yield alerts respect stale-price suppression and state-transition deduplication.
- Dividend change alerts reach only active holders.
- Email opt-in preference persists and gates delivery state.
- New users land on an onboarding home screen; zero-holding states are handled on all screens.
- PWA manifest is reachable and well-formed.
- CSV import preview shows row-level errors for invalid data and commits only valid rows.
- Calendar basis switch works for payment month, record date, and ex-dividend date.

## Excluded From This Phase

- Real Resend production email delivery verification (sandbox or log review is acceptable).
- Full Stooq network fetch during CI (mock or skip with justification).
- Native PWA install prompt triggering (not automatable in Playwright without OS-level interaction).
- Performance benchmarks or Lighthouse scoring.
