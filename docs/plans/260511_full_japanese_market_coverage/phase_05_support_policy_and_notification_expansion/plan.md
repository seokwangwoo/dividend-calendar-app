# Phase 05: Support Policy and Notification Expansion

## Goal

Clarify the `support_status` semantics for a full-market catalog and ensure notifications/calculations behave correctly for newly added stocks.

## Prerequisites

- Phase 04 Completion Criteria are met.
- Admin review UI exists.
- `get_home_summary`, `get_dividend_calendar`, `get_stock_detail` RPCs exist.

## Implementation Scope

- Redefine `support_status` or introduce additional status columns.
- Update holding creation and notification rule creation guards.
- Update portfolio/calendar/home RPCs to handle stocks with no approved dividend events gracefully.

## Core Tasks

1. **Policy redefinition**
   - Extend `stock_support_status` enum: `('supported', 'unsupported', 'delisted')`.
   - Semantics:
     - `supported` = has at least one approved `dividend_events` row.
     - `unsupported` = no approved dividend data yet.
     - `delisted` = not present in latest JPX master CSV.
   - Update any seed/import logic to set `supported` only when approved dividend events exist.
   - `delisted` stocks are excluded from search, price refresh, and dividend collection.
   - Existing holdings for `delisted` stocks are **not** auto-deleted. Show a "상장 폐지" badge on the portfolio card; user deletes manually.
   - Auto-promotion: when the first `dividend_event` for a stock is approved, automatically update `stocks.support_status = 'supported'` in the `approve-dividend-review` Edge Function.
   - Document decision in `docs/plans/260511_full_japanese_market_coverage/README.md` or a decision record.

2. **Holding creation guards**
   - Allow holdings for any stock regardless of `support_status` (even `unsupported`).
   - When a stock has no approved dividend data, show the portfolio card with the same layout as supported stocks, but render "배당 데이터 확보 중" text in the dividend amount area instead of `¥0` or `¥-`.

3. **Notification rule guards**
   - Block notification rule creation if `expected_annual_dividend_per_share IS NULL` (regardless of `support_status`).
   - On stock detail page:
     - Dividend schedule area shows "배당 데이터 확보 중" when no approved dividend events exist.
     - Notification rule button is **disabled** (not hidden) when `expected_annual_dividend_per_share IS NULL`.
     - Show tooltip/message: "배당 데이터가 확볐되면 알림을 설정할 수 있습니다."
   - Do not block based on `support_status` alone (a newly added stock with dividend data should be allowed).

4. **RPC null-safety**
   - Audit `get_home_summary`, `get_dividend_calendar`, `get_stock_detail` for null dividend handling.
   - Ensure empty dividend schedules return `[]` and totals return `null` (not zero) when there is no data.
   - Ensure `get_home_summary` does not crash when `next_dividend` is null.

5. **`calculate_holding_dividend` relaxation**
   - Remove the `unsupported` stock rejection in `calculate_holding_dividend`.
   - Allow `unsupported` stocks to pass through and return `null` amounts/yields when `expected_annual_dividend_per_share IS NULL`.
   - Keep rejection only for `delisted` stocks (or remove entirely if RLS/search already blocks access).

## Test Plan

- Create a holding for a stock with zero approved dividend events.
- Verify home/calendar show no crash and appropriate empty states.
- Run notification rule creation attempt on a no-data stock and confirm graceful rejection.
- Run `npm run lint` and `npm run typecheck`.

## Completion Criteria

- Any stock can be added to portfolio.
- Stocks without approved dividend data show graceful empty states (not zero).
- Notification rules cannot be created for stocks lacking yield data.
- `support_status` semantics are documented and consistent across DB and frontend.

## Excluded From This Phase

- Automatic support status promotion when dividend data arrives.
- Dividend prediction for stocks without data.
- User-requested stock support flow.
