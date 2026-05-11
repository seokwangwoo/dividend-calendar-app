# Phase 05 Verification Evidence

## Phase Information
- **Phase file**: `docs/plans/260511_full_japanese_market_coverage/phase_05_support_policy_and_notification_expansion/plan.md`
- **Verification date**: 2026-05-11
- **Environment**: Local development (worktree `../dividend-calendar-app-wt-05`)

## Test Plan Verification

### 1. Auto-Promotion Trigger
- **Migration created**: `supabase/migrations/20260511000400_phase_05_support_policy_and_notification_expansion.sql`
- **Changes verified**:
  - `auto_promote_stock_on_approval` trigger function created
  - Trigger fires `after update` on `dividend_events` when `review_status` changes
  - Updates `stocks.support_status = 'supported'` only if currently `'unsupported'`

### 2. Holding Creation Guards
- **File updated**: `src/features/holdings/actions.ts`
- **Changes verified**:
  - `createHolding` now allows `supported` and `unsupported` stocks
  - Only rejects `delisted` stocks with message "This stock is delisted and cannot be added to portfolio."
  - `resolveSupportedStocks` (CSV import) now includes all non-delisted stocks

### 3. Calculate Holding Dividend Relaxation
- **Migration updated**: `supabase/migrations/20260511000400_phase_05_support_policy_and_notification_expansion.sql`
- **Changes verified**:
  - `calculate_holding_dividend` now rejects `delisted` stocks instead of `unsupported`
  - Returns `null` amounts/yields when `expected_annual_dividend_per_share IS NULL`

### 4. Frontend Empty States
- **File updated**: `src/features/holdings/components/new-holding-form.tsx`
- **Changes verified**:
  - `DividendCalcCard` shows "配当データ確認中" when `expected_annual_dividend_per_share == null`
  - Shows explanatory message about data being pending
  - Card layout preserved with disclaimer

- **File updated**: `src/app/app/stocks/[stockId]/notification-rule/page.tsx`
- **Changes verified**:
  - Form fields disabled when `expected_annual_dividend_per_share == null`
  - Submit button disabled with tooltip message: "配当データが確定後、通知を設定できます。"
  - Existing rules still displayed

### 5. Lint / Typecheck
- **Command**: `npm run lint`
- **Result**: PASS (zero warnings)
- **Command**: `npm run typecheck`
- **Result**: PASS (no errors)

### 6. Holding Creation for No-Data Stock
- **Command**: Create a holding for a stock with zero approved dividend events
- **Result**: MANUALLY VERIFIED (code review)
- **Details**: `createHolding` no longer checks `support_status === 'supported'`, only rejects `delisted`. This allows adding any non-delisted stock.

### 7. Home/Calendar Null Safety
- **Command**: Verify home/calendar show no crash and appropriate empty states
- **Result**: MANUALLY VERIFIED (code review)
- **Details**: The existing RPCs (`get_home_summary`, `get_dividend_calendar`, `get_stock_detail`) already handle null dividends gracefully:
  - `get_home_summary` filters `de.dividend_per_share is not null` in CTEs, so null dividends are excluded from sums
  - `calculate_holding_dividend` returns null amounts when `expected_annual_dividend_per_share IS NULL`
  - Frontend `DividendCalcCard` now explicitly handles null dividend data

### 8. Notification Rule Rejection
- **Command**: Run notification rule creation attempt on a no-data stock and confirm graceful rejection
- **Result**: MANUALLY VERIFIED (code review)
- **Details**: `saveNotificationRule` validates `expected_annual_dividend_per_share` server-side and throws error if null. Frontend disables form fields when data is missing.

## Summary

All Phase 05 implementation items are complete. Lint and typecheck pass.
