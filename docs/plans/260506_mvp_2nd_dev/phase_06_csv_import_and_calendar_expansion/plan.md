# Phase 06: CSV Import and Calendar Expansion

> **⚠️ Scope update (2026-05-12):** This phase has been **superseded** by `docs/plans/20260512_mvp_gap_close`:
> - **CSV import** is fully implemented in `20260512_mvp_gap_close/phase_03_csv_holdings_import`.
> - **Calendar basis UI expansion** (`record_date` / `ex_dividend_date` views) has been **removed from MVP scope** and deferred to a future Phase 2+ plan. The original MVP policy (`payment_month` only in the user UI) is restored in `20260512_mvp_gap_close/phase_01_mvp_policy_alignment`.
>
> The remaining content below is kept for historical reference.

## Goal

Add the most useful deferred MVP 2 features: CSV-based holding import and alternate calendar views for payment month, record date, and ex-dividend date while keeping payment month as the default cash-flow view.

## Prerequisites

- Phase 05 Completion Criteria are met.
- Holding create/update logic and stock search are stable.
- Dividend events include `payment_year`, `estimated_payment_month`, `record_date`, and `ex_dividend_date` where available.

## Implementation Scope

- Add CSV import route or modal from the portfolio screen.
- Support a documented MVP CSV format: `ticker`, `quantity`, `average_purchase_price`, `account_type`, and optional `memo`.
- Validate CSV rows before commit and show a preview with row-level errors.
- Allow importing only supported stocks; unsupported rows must be visible with errors and skipped until fixed.
- Commit valid rows as holdings using the same validation and RLS-safe write path as manual entry.
- Add calendar basis switch with values `payment_month`, `record_date`, and `ex_dividend_date`.
- Keep `payment_month` as the default basis for monthly cash-flow totals.
- Show unavailable basis data as unknown rather than inventing dates.

## Core Tasks

1. **CSV parser and validation**
   - Use a structured CSV parser.
   - Normalize account types to `nisa`, `tokutei`, and `general`.
   - Validate positive quantity, positive average purchase price, supported ticker, and account type.
   - Provide row numbers and actionable error messages.

2. **CSV preview UI**
   - Add upload control and preview table.
   - Separate valid rows from invalid rows.
   - Show calculated estimated annual before-tax and after-tax amounts for valid rows when approved event data exists.
   - Require explicit confirmation before inserting holdings.

3. **CSV commit flow**
   - Insert valid holdings using authenticated Supabase client or server action.
   - Do not overwrite existing holdings automatically.
   - Show import result summary with inserted count and skipped count.
   - Invalidate portfolio, home, and calendar queries after successful import.

4. **Calendar basis contracts**
   - Add a basis parameter to calendar query functions and RPCs.
   - Define basis enum once in this phase: `payment_month`, `record_date`, `ex_dividend_date`.
   - For `payment_month`, aggregate by `payment_year` and `estimated_payment_month`.
   - For `record_date` and `ex_dividend_date`, aggregate by the actual date year/month where the date is present.

5. **Calendar UI expansion**
   - Add segmented basis control near the year and amount-basis controls.
   - Label the default basis as payment/cash-flow oriented.
   - Show "date unknown" state for event rows missing the selected basis date.
   - Preserve account type and before-tax/after-tax filters across basis changes.

6. **Unit tests to add**

   `src/features/holdings/csv-parser.test.ts` (new):
   - Valid row `9433,100,4300,nisa` parses to `{ ticker: '9433', quantity: 100, averagePurchasePrice: 4300, accountType: 'nisa' }`.
   - Account type aliases: `NISA` (uppercase) normalized to `nisa`; `特定口座` rejected with a clear error.
   - Negative quantity produces a row error with the row number.
   - Zero average purchase price produces a row error.
   - Unsupported ticker produces a row-level "ticker not supported" error (lookup must be mockable).
   - Row with an extra or missing column produces a parse error.
   - Empty file body returns an empty valid-rows list and no errors.
   - Header row `ticker,quantity,average_purchase_price,account_type` is skipped, not treated as a data row.

   `src/features/calendar/basis.test.ts` (new):
   - Calendar basis enum values are exactly `payment_month`, `record_date`, and `ex_dividend_date`.
   - For `payment_month`, events without `estimated_payment_month` are excluded from aggregation.
   - For `record_date`, events without `record_date` produce `{ month: null, unknown: true }` result entries.
   - For `ex_dividend_date`, events without `ex_dividend_date` produce `{ month: null, unknown: true }` result entries.
   - Switching basis does not alter the account-type filter or amount-basis state.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:unit` — all new CSV parser and calendar basis tests must pass.
- Run Playwright tests for CSV preview, validation errors, successful import, and post-import portfolio totals.
- Run Playwright tests for calendar basis switching and unknown date rendering.
- Manually import a CSV containing one valid supported row, one unsupported ticker, and one invalid amount.

## Completion Criteria

- Users can preview and import valid supported-stock holdings from CSV.
- Invalid CSV rows are not inserted and clearly show row-level errors.
- Existing manual holding creation and edit flows continue to work.
- Calendar defaults to payment-month cash-flow view.
- Calendar can switch to record-date and ex-dividend-date views where data exists.
- Missing record/ex-dividend dates display as unknown and do not create false monthly totals.

## Excluded From This Phase

- Brokerage CSV auto-detection for every broker format.
- Automatic duplicate merging.
- CSV export.
- Watchlist import.
- Full tax-lot accounting.
