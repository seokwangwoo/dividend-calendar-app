# Phase 08: UI Value Verification and Screen Rendering Tests

## Goal

Run Playwright E2E tests to confirm that every user-facing screen renders the exact values returned by Supabase RPCs and queries, with correct formatting, labeling, empty states, and boundary handling.

## Prerequisites

- Phase 07 Completion Criteria are met.
- Phase 07 seed data exists:
  - User A: KDDI 100 shares NISA avg 4300, JT 100 shares tokutei avg 3800
  - User B: KDDI 50 shares general avg 4100
  - Approved, pending, and rejected dividend events
  - Target yield rules and evaluated notifications
- All `/app/*` routes and UI components are implemented and reachable.
- Playwright is installed and `playwright.config.ts` is valid.

## Implementation Scope

- Write one focused Playwright spec file per screen.
- Pre-calculate expected display values from seed data and compare them against DOM text.
- Verify number formatting, currency symbols, percentage precision, and status label mapping.
- Verify filter and basis switches cause correct value updates without reload.
- Verify empty states and boundary values (`undecided`, `null` price, zero holdings).

## Core Tasks

1. **Home screen value verification**
   - Log in as User A.
   - Verify primary number: annual after-tax dividend.
   - Verify secondary numbers: annual before-tax dividend and estimated tax.
   - Verify current-month expected after-tax deposit.
   - Verify next dividend card: ticker, stock name, display date, before-tax amount, after-tax amount, status label.
   - Verify monthly goal progress: target amount, current amount, achievement rate.
   - Verify recent dividend change badge and description.
   - Verify empty state when no holdings exist.

2. **Calendar screen value verification**
   - Verify all 12 months render with correct totals.
   - Verify basis switch (`before_tax` ↔ `after_tax`) updates every monthly total.
   - Verify account filter (`all`, `nisa`, `tokutei`, `general`) updates totals and event lists.
   - Verify month detail: per-stock event cards with ticker, stock name, account type badge, status badge, before-tax amount, after-tax amount, display date.
   - Verify month totals: `totalBeforeTaxAmount`, `totalEstimatedTaxAmount`, `totalAfterTaxAmount`.
   - Verify `undecided` amounts are not shown as zero.

3. **Portfolio screen value verification**
   - Verify summary card: holding count, annual after-tax dividend, average after-tax yield.
   - Verify account filter updates summary and holding cards.
   - Verify sort options: highest dividend, ticker ascending, recently added.
   - Verify holding card values: stock name, ticker, quantity, account type label, average purchase price, annual after-tax dividend.
   - Verify empty state when no holdings exist.

4. **Stock detail screen value verification**
   - Verify stock info: ticker, name, current price, expected annual dividend per share, expected dividend yield.
   - Verify user holdings section: account type, quantity, annual before-tax amount, annual after-tax amount.
   - Verify dividend schedule: event type, expected payment date/month, dividend per share, status label.
   - Verify source metadata: source type, source URL, source published at, review status.
   - Verify "add to portfolio" link appears when user does not hold the stock.
   - Verify yield is unavailable when current price is null or zero.

5. **Notifications screen value verification**
   - Verify filter tabs: all, target yield, dividend change, data update.
   - Verify notification groups: today, this week, older.
   - Verify notification card values: title, body summary, stock ticker and name, created time, unread/read state.
   - Verify target yield notification body includes evaluated yield, target yield, condition operator.
   - Verify investment-neutral disclaimer is present.

6. **Settings screen value verification**
   - Verify account email is displayed.
   - Verify toggle states: email notifications, in-app notifications.
   - Verify default amount basis selector shows persisted value.
   - Verify currency display is JPY.
   - Verify monthly dividend goal amount.
   - Verify tax calculation notice is visible.
   - Verify logout button exists.

7. **Common formatting and mapping verification**
   - Number format: `¥1,234,567`.
   - Percentage format: `3.50%`.
   - Status labels:
     - `estimated` → `予想`
     - `confirmed` → `確定`
     - `paid` → `支払済`
     - `undecided` → `未定`
   - Account type labels:
     - `nisa` → `NISA`
     - `tokutei` → `特定口座`
     - `general` → `一般口座`
   - Review status labels (admin context only):
     - `approved` → `検収済`
     - `pending` → `検収待ち`
     - `rejected` → `却下`
   - Special dividend labels:
     - `dividend_increase` → `増配`
     - `dividend_decrease` → `減配`
     - `no_dividend` → `無配`
     - `special_dividend` → `特別配当`

8. **Boundary and edge case verification**
   - All dividends `undecided` in a month → month total shows `未定` or null, not zero.
   - Current price is null or zero → yield shows unavailable, not a calculated number.
   - Zero holdings → empty state appears, no fake totals.
   - Rejected or pending dividend events do not appear as confirmed data on user screens.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run existing tests: `npm test`.
- Run Playwright E2E value verification specs:
  ```text
  npx playwright test tests/e2e/verify-home-values.spec.ts
  npx playwright test tests/e2e/verify-calendar-values.spec.ts
  npx playwright test tests/e2e/verify-portfolio-values.spec.ts
  npx playwright test tests/e2e/verify-stock-detail-values.spec.ts
  npx playwright test tests/e2e/verify-notifications-values.spec.ts
  npx playwright test tests/e2e/verify-settings-values.spec.ts
  ```
- Each spec must contain at least five strict value assertions comparing pre-calculated expected text against rendered DOM text.

## Completion Criteria

- All six Playwright E2E spec files exist and pass.
- Every major value displayed on home, calendar, portfolio, stock detail, notifications, and settings is verified against seed data.
- Number formatting, currency, percentage, status labels, and account type labels are consistent across all screens.
- Empty states and boundary values render exactly as specified.
- Filter and basis switches update values correctly without page reload.
- Build, lint, typecheck, and all Playwright tests pass.

## Excluded From This Phase

- New feature implementation.
- Admin screen value verification (covered in Phase 07).
- TDnet data pipeline verification.
- Performance and load time testing (covered in Phase 07).
- Mobile responsive layout testing.
- Multi-language (i18n) testing.
- Visual regression or screenshot comparison tests.
