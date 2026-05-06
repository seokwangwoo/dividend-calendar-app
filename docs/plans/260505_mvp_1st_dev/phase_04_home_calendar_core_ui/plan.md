# Phase 04: Home and Calendar Core UI

## Goal

Implement the main product value screens: home summary, monthly dividend calendar, month detail, and stock detail using approved dividend data and user holdings.

## Prerequisites

- Phase 03 is complete.
- Holdings and dividend calculations work.
- `dividend_events` has approved seed or manually inserted records for supported stocks.

## Implementation Scope

- Home screen.
- Calendar screen.
- Month detail behavior.
- Stock detail screen.
- RPCs for home, calendar, month detail, and stock detail.
- Status badges and source display.

## Data Rules

- User-facing dividend calculations must use `dividend_events.review_status = 'approved'`.
- Pending and rejected events can exist but must not be shown as confirmed user-facing data.
- If a dividend amount is unknown, show unknown or undecided, not zero.
- If a payment date is unknown but month is known, display month-level expected text.
- If both date and month are unknown, group under unknown status, not a calendar month.

## RPC: `get_home_summary`

Input:

- `p_year int`

Return:

- `year`
- `annualDividend`
  - `beforeTaxAmount`
  - `estimatedTaxAmount`
  - `afterTaxAmount`
  - `currency`
- `currentMonthDividend`
  - `month`
  - `afterTaxAmount`
- `nextDividend`
  - `ticker`
  - `stockName`
  - `displayDateText`
  - `beforeTaxAmount`
  - `afterTaxAmount`
  - `status`
- `monthlyGoal`
  - `targetAmount`
  - `currentAmount`
  - `achievementRate`
- `recentDividendChange`
  - latest approved increase, decrease, no dividend, special dividend, or data update for user-held stock

Rules:

- Use authenticated user from `auth.uid()`. No `p_user_id` parameter required.
- Include only active holdings.
- Include only approved dividend events.
- Current month is inferred from `now()` inside the function. No `p_month` input is required.
- `achievementRate` is null when the user has no monthly goal.

Note: All RPC return fields use camelCase for JSON serialization. Internal queries use snake_case column names; transformation occurs in the function's SELECT clause.

## RPC: `get_dividend_calendar`

Input:

- `p_year int`
- `p_basis text`: `before_tax` or `after_tax`
- `p_account_type text`: `all`, `nisa`, `tokutei`, `general`

Return:

- `year`
- `basis`
- `currency`
- `months`
  - `month`
  - `amount`
  - `eventCount`

Rules:

- Group by expected payment month.
- Use approved dividend events only.
- Include active holdings only.
- Filter by account type when not `all`.

## RPC: `get_dividend_month_detail`

Input:

- `p_year int`
- `p_month int`
- `p_basis text`
- `p_account_type text`

Return:

- `year`
- `month`
- `basis`
- `totalBeforeTaxAmount` — sum across all events in the month; null if all dividend amounts are null.
- `totalEstimatedTaxAmount` — null if all dividend amounts are null.
- `totalAfterTaxAmount` — null if all dividend amounts are null.
- `events`
  - `holdingId`
  - `stockId`
  - `ticker`
  - `stockName`
  - `accountType`
  - `quantity`
  - `eventType`
  - `displayDateText`
  - `beforeTaxAmount` — null when dividend amount is `undecided`.
  - `estimatedTaxAmount` — null when `beforeTaxAmount` is null.
  - `afterTaxAmount` — null when `beforeTaxAmount` is null.
  - `status`
  - `reviewStatus`
  - `sourceType`
  - `sourceUrl`

Note: The `total` prefix is used only for month-level aggregates. Per-event fields omit the prefix.

## RPC: `get_stock_detail`

Input:

- `p_stock_id uuid`

Return:

- stock:
  - ticker
  - name
  - currentPrice
  - expectedAnnualDividendPerShare
  - expectedDividendYield
- userHoldings:
  - accountType
  - quantity
  - annualBeforeTaxAmount
  - annualAfterTaxAmount
- dividendSchedule:
  - eventType
  - expectedPaymentDate
  - expectedPaymentMonth
  - dividendPerShare
  - status
- source:
  - sourceType
  - sourceUrl
  - sourcePublishedAt
  - reviewStatus

## Home Screen

Route: `/app/home`

Show:

- Greeting.
- Annual expected after-tax dividend as the primary number.
- Annual before-tax dividend and estimated tax as secondary numbers.
- Current month expected after-tax deposit.
- Next dividend card.
- Monthly goal progress.
- Recent dividend change.

Empty state:

- If no holdings exist, show a compact prompt to add first stock.
- Do not show fake dividend totals.

## Calendar Screen

Route: `/app/calendar`

Show:

- Year selector.
- Amount basis selector: before-tax or after-tax.
- Account filter.
- Monthly summary list for January to December.
- Selected month detail.
- Event cards with:
  - stock name and ticker
  - display date
  - before-tax amount
  - after-tax amount
  - account type
  - status badge

MVP view basis:

- Payment month.
- Expected payment date when available.

Excluded view basis:

- Ex-dividend date.
- Record date.

## Stock Detail Screen

Route: `/app/stocks/[stockId]`

Show:

- Current stock information.
- User holding information for that stock.
- Dividend schedule.
- Data source and review status.
- Link to target dividend yield notification settings.

If the user does not hold the stock:

- Show stock details and a link to add it to portfolio.

## Status Display

Map `dividend_events.status` values:

- `estimated`: 予想
- `confirmed`: 確定
- `paid`: 支払済
- `undecided`: 未定

Map `dividend_events.review_status` values (used in source metadata display):

- `approved`: 検収済
- `pending`: 検収待ち, admin only
- `rejected`: 却下, admin only

Map notification types (used in notification cards and home recent change section):

- `dividend_increase`: 増配
- `dividend_decrease`: 減配
- `no_dividend`: 無配
- `special_dividend`: 特別配当
- `data_update`: データ更新

Notification type badges use a distinct style from dividend status badges to avoid confusion.

## Test Plan

- Home with no holdings shows add-first-stock state.
- Home with holdings shows annual before-tax, tax, and after-tax totals.
- Home current month uses only events in the current month.
- Calendar shows all 12 months.
- Calendar basis switch changes displayed totals.
- Calendar account filter excludes unrelated holdings.
- Month detail lists per-stock dividend events.
- Stock detail shows source URL and review status for approved data.
- Pending and rejected dividend events do not appear as user-facing confirmed events.

## Completion Criteria

- Home and calendar render real data for authenticated users.
- RPC results match portfolio calculations.
- Calendar filters and basis switches work.
- Stock detail links portfolio, dividend schedule, source, and notification setup entry.
- Build, lint, typecheck, and core UI scenarios pass.

## Excluded From This Phase

- Notification rule creation.
- Notification evaluation.
- Email sending.
- Admin review workflow.
- TDnet collection and parsing.
