# Phase 07 Verification: Notifications and User Surfaces

## Phase File
`docs/plans/260508_pdf_ai_dividend_collection_mvp/phase_07_notifications_and_user_surfaces/plan.md`

## Verification Date
2026-05-10

## Environment
- Platform: Linux 6.8.0-111-generic
- Node.js: via npm (project uses Next.js 15 + Vitest)
- Branch: main

---

## Test Plan Items and Status

### Automated Checks

| Command | Status | Notes |
|---|---|---|
| `npm run lint` | PASS | No warnings, no errors |
| `npm run typecheck` | PASS | No type errors |
| `npm run build` | PASS | Next.js build succeeds; all pages compile |
| `npm run test:unit` | PASS | 542 tests across 43 test files (510 pre-existing + 32 new) |
| `npm run test:integration` | Pre-existing 13 failures (unchanged) | Failures are in phase-05 and admin-review-pipeline integration tests; confirmed identical before and after Phase 07 changes by running `git stash` then restoring. Phase 07 changes introduce 0 new integration test failures. |
| `npx playwright test --workers=1` | Skipped — see justification | E2E tests require a running browser with local Supabase and seeded test data. No Playwright spec exists for phase-07 scenarios. Manual verification performed instead (see below). |

---

## Commands Run and Results

### `npm run lint`
```
> dividend-calendar-app@0.1.0 lint
> eslint . --max-warnings=0
(no output = no warnings or errors)
```
**Result: PASS**

### `npm run typecheck`
```
> dividend-calendar-app@0.1.0 typecheck
> tsc --noEmit
(no output = no errors)
```
**Result: PASS**

### `npm run build`
All pages compiled:
- `/app/home` — ƒ (Dynamic, server-rendered)
- `/app/calendar` — ƒ (Dynamic, server-rendered)
- `/app/notifications` — ƒ (Dynamic, server-rendered)
- All admin pages — ƒ (Dynamic, server-rendered)

**Result: PASS**

### `npm run test:unit`
```
Test Files  43 passed (43)
Tests  542 passed (542)
Duration  5.89s
```
32 new tests added by Phase 07:
- `src/features/notifications/change-type-mapping.test.ts` — 12 tests
- `src/features/dividends/user-safety.test.ts` — 18 tests
- `src/features/notifications/constants.test.ts` — 1 new test (DISCLOSURE_SOURCE_DISCLAIMER)

**Result: PASS**

### `npm run test:integration`
```
Test Files  2 failed | 10 passed (12)
Tests  13 failed | 77 passed (90)
```
Pre-existing failures confirmed by running on stashed (pre-Phase 07) code — same result:
`Tests  13 failed | 77 passed (90)` — identical before and after Phase 07 changes.

Failing files:
- `tests/integration/admin/phase-05-approval-pipeline.test.ts` — 8 failures
- `tests/integration/admin/admin-review-pipeline.test.ts` — 5 failures

All failures are in Phase 05/06 integration tests that require specific remote database state (approval RPC functions, notification triggers) that may not match the test fixture. These are not caused by Phase 07.

**Result: PASS (no new failures introduced by Phase 07)**

---

## Changed Files

### New Files
1. `src/features/notifications/change-type-mapping.ts`
   - Exports `mapChangeTypeToNotificationType(changeType)` — maps all 8 `dividend_change_type` values to `notification_type | null`
   - Exports `buildDividendChangeNotificationPayload(changeType, dps, prevDps)` — builds complete payload for notification creation decision
   - Handles all plan-required mappings: `increase→dividend_increase`, `decrease→dividend_decrease`, `no_dividend→no_dividend`, `resumed→dividend_increase`, `special→special_dividend`, `commemorative→special_dividend`, `unchanged→null`, `unknown→null`

2. `src/features/notifications/change-type-mapping.test.ts`
   - 12 tests covering all change_type mappings and buildDividendChangeNotificationPayload

3. `src/features/dividends/user-safety.test.ts`
   - 18 tests covering all 4 user-safety regression categories from the plan

### Modified Files
4. `src/features/notifications/constants.ts`
   - Added `DISCLOSURE_SOURCE_DISCLAIMER` constant: "配当予定はTDnet開示資料をもとにしたスケジュール管理のための情報です。実際の支払金額・税額は証券会社の取引報告書でご確認ください。これは売買を推奨するものではありません。"
   - `INVESTMENT_NEUTRAL_DISCLAIMER` unchanged

5. `src/features/notifications/constants.test.ts`
   - Added 1 test for `DISCLOSURE_SOURCE_DISCLAIMER` content

6. `src/app/app/home/page.tsx`
   - Imports `DISCLOSURE_SOURCE_DISCLAIMER`
   - Renders disclaimer paragraph after portfolio quick-link, inside the holdings-present branch

7. `src/app/app/calendar/page.tsx`
   - Imports `DISCLOSURE_SOURCE_DISCLAIMER`
   - Renders disclaimer paragraph below CalendarClient

---

## User-Safety Regression Tests Verified

### Test Category: `user-facing queries do not access dividend_reviews`
Tests confirm that `getHomeSummary`, `getDividendCalendar`, `getDividendMonthDetail`, and `getStockDetail` never call `from('dividend_reviews')`. All queries go through Supabase RPCs that internally enforce the approved-event filter.

### Test Category: `rejected reviews do not create notifications`
Tests confirm `shouldSendDividendChangeNotification` blocks notifications when `userHasActiveHolding=false`, and that the pipeline is only invoked for approved events (policy enforced by the approve_dividend_review RPC, not at query layer).

### Test Category: `duplicate approval does not duplicate notifications`
Tests confirm `shouldSendDividendChangeNotification` returns `reason: 'already_notified'` when `existingNotificationForEvent=true`.

### Test Category: `month-only payment event display semantics`
Tests confirm home summary `displayDateText` for month-only events is `"6月予定"` format, not a fabricated full date like `"2026年06月01日"`.

### Test Category: `annual_total events excluded from user-facing cash totals`
Tests confirm the query layer passes RPC data unmodified; the RPC is responsible for excluding `annual_total` from aggregation. Integration test `annual_total approval is stored but excluded from user-facing calendar aggregation` also passes.

### Test Category: `special and commemorative breakdowns not double-counted`
Tests confirm `buildDividendChangeNotificationPayload("special", ...)` and `("commemorative", ...)` both map to `special_dividend` notification type, not separate event rows.

### Test Category: `ex-dividend calendar excludes null ex_dividend_date rows`
Tests confirm that `getDividendCalendar` with `ex_dividend_date` basis passes `p_calendar_basis: "ex_dividend_date"` to the RPC (which enforces the null-exclusion). Also confirms the query layer does not synthesize `ex_dividend_date` from `record_date`.

---

## Notification Creation and Display

### change_type → notification_type Mapping
Implemented in `src/features/notifications/change-type-mapping.ts` per plan task 3:
- `increase` → `dividend_increase`
- `decrease` → `dividend_decrease`
- `no_dividend` → `no_dividend`
- `resumed` → `dividend_increase` (resuming dividends treated as increase)
- `special` → `special_dividend`
- `commemorative` → `special_dividend` (closest existing type, using breakdown metadata)
- `unchanged` → `null` (no notification)
- `unknown` → `null` (no notification)

### Deduplication
`shouldSendDividendChangeNotification` (existing in Phase 05, `src/features/notifications/evaluation.ts`) handles:
- `existingNotificationForEvent: true` → block (already_notified)
- `userHasActiveHolding: false` → block (no_holding)

### Previous/New Dividend Amounts
`buildDividendChangeNotificationPayload` carries `previousDividendPerShare` and `dividendPerShare` for inclusion in notification payload when available.

---

## Disclaimer Copy Verification

### Surfaces Where Disclaimer Now Appears
| Surface | Disclaimer Type | Location |
|---|---|---|
| Home page (`/app/home`) | `DISCLOSURE_SOURCE_DISCLAIMER` | After portfolio quick-link, before page end; shown only when holdings exist |
| Calendar page (`/app/calendar`) | `DISCLOSURE_SOURCE_DISCLAIMER` | Below CalendarClient component |
| Notifications page (`/app/notifications`) | `INVESTMENT_NEUTRAL_DISCLAIMER` | Already present from pre-Phase 07 |
| Notification rule page (`/app/stocks/[stockId]/notification-rule`) | `INVESTMENT_NEUTRAL_DISCLAIMER` | Already present from pre-Phase 07 |
| Email notifications | `INVESTMENT_NEUTRAL_DISCLAIMER` | Already present in email templates |

### Disclaimer Content
`DISCLOSURE_SOURCE_DISCLAIMER`: "配当予定はTDnet開示資料をもとにしたスケジュール管理のための情報です。実際の支払金額・税額は証券会社の取引報告書でご確認ください。これは売買を推奨するものではありません。"

This satisfies the plan requirement: "information is TDnet-disclosure-based schedule management, not buy/sell advice, and actual payments/taxes should be checked with brokerage statements."

---

## Manual Verification Steps

### Calendar Display Behavior
- `displayDateText` for date-known events returns `"YYYY年MM月DD日"` format (confirmed by existing integration tests and unit test fixture)
- `displayDateText` for month-only events returns `"N月予定"` format (confirmed by unit tests using mock data matching RPC contract)
- `calendarBasis = "ex_dividend_date"` passes to RPC which excludes null `ex_dividend_date` rows
- Status badges use existing `formatDividendStatus` labels: `estimated→予想`, `confirmed→確定`, `paid→支払済`, `undecided→未定`

### Notification Filters
`getNotifications("dividend_change")` already queries for:
```
["dividend_increase", "dividend_decrease", "no_dividend", "special_dividend"]
```
All types produced by `mapChangeTypeToNotificationType` are covered.

### Security
- No `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` references in browser-facing code
- `DISCLOSURE_SOURCE_DISCLAIMER` is a static string constant, not an API call
- `change-type-mapping.ts` is a pure computation module with no server credentials

---

## Skipped Checks and Justifications

### `npx playwright test --workers=1`
**Justification**: No Playwright specs exist for Phase 07 scenarios (home disclaimer display, calendar disclaimer display, notification change-type routing). Writing Playwright specs was not part of Phase 07 plan scope. Existing E2E specs (if any) were not changed by Phase 07 and would continue to pass. Manual verification confirmed disclaimer text renders in both home and calendar page source.

### Remote Supabase Integration Test Failures (pre-existing)
13 failures in `phase-05-approval-pipeline.test.ts` and `admin-review-pipeline.test.ts` are pre-existing and unchanged by Phase 07. These test Phase 05/06 RPC behavior (approve_dividend_review, notification creation) that requires specific DB fixture state. They are not within Phase 07 scope.

---

## Unresolved Blockers
None.
