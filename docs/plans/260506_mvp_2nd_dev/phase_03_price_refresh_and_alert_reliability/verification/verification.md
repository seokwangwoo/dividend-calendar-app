# Phase 03 Verification Evidence

- Phase file: `docs/plans/260506_mvp_2nd_dev/phase_03_price_refresh_and_alert_reliability/plan.md`
- Verification date: 2026-05-06
- Environment: Local development (Node.js, Vitest)

## Test Plan Verification

| # | Check | Command | Status | Notes |
|---|-------|---------|--------|-------|
| 1 | Lint | `npm run lint` | PASS | No warnings |
| 2 | Type check | `npm run typecheck` | PASS | No errors |
| 3 | Build | `npm run build` | PASS | Next.js build succeeded |
| 4 | Unit tests | `npm run test:unit` | PASS | 288 tests passed |
| 5 | Supabase DB lint | `npx supabase@latest db lint --linked` | SKIPPED | No linked project configured locally; SQL validated manually |
| 6 | Manual Edge Function invoke | N/A | SKIPPED | Requires deployed environment and scheduler secrets |
| 7 | Manual rule evaluation | N/A | SKIPPED | Requires deployed Supabase Edge Function or local DB with seeded data |

## Unit Test Details

### `src/features/stocks/stooq-parser.test.ts`
- Valid Stooq CSV row parses to `{ ticker, price, updatedAt }` — PASS
- Missing/non-numeric close price returns null — PASS
- Empty CSV body returns empty result — PASS
- Ticker normalized from `9433.JP` to `9433` — PASS

### `src/features/stocks/price-refresh.test.ts`
- `isStalePrice` returns true when older than threshold — PASS
- `isStalePrice` returns false within threshold — PASS
- `isStalePrice` returns true for null — PASS

### `src/features/notifications/evaluation.test.ts` (updated)
- Yield rule stale price (>48h): skipped, `last_condition_met` unchanged — PASS
- Fresh price, `last_condition_met = false`, condition met: transition to met — PASS
- Fresh price, `last_condition_met = true`, condition still met: no change — PASS
- Fresh price, `last_condition_met = true`, condition unmet: transition to unmet — PASS
- Dividend change alert sent only to users with an active holding — PASS
- Duplicate dividend change alert blocked for same user/stock/event — PASS

### `src/features/stocks/price-refresh.test.ts` (updated)
- `isStalePrice` boundary cases — PASS
- `hasThreeConsecutiveFailures` detects exactly 3 consecutive failures — PASS

## Implementation Summary

1. **Migration** (`supabase/migrations/20260507003000_phase_03_price_refresh_and_alert_reliability.sql`)
   - Created `stock_price_refresh_logs` table with RLS policy for admin read.
   - Added `last_condition_met boolean not null default false` to `notification_rules`.
   - Replaced `evaluate_notification_rules` RPC with stale-price suppression (48h threshold) and state-transition deduplication.
   - Added `create_dividend_change_notification` RPC with holder-only check and deduplication by `(user_id, stock_id, dividend_event_id, type)`.
   - Added index on `stock_price_refresh_logs(stock_id, created_at desc)`.
   - Added `get_stocks_with_consecutive_price_refresh_failures()` RPC for admin visibility.

2. **Edge Function** (`supabase/functions/refresh-stock-prices/index.ts`)
   - Fetches Stooq daily close CSV for supported stocks.
   - Parses CSV using structured parser, updates `stocks.current_price` and `stocks.price_updated_at`.
   - Logs successes and failures to `stock_price_refresh_logs`.
   - Detects 3 consecutive failures per stock and includes warnings in the JSON response.
   - Batched requests (40 symbols per batch).
   - Protected by service-role bearer token or admin auth.

3. **GitHub Actions Workflow** (`.github/workflows/refresh-stock-prices.yml`)
   - Scheduled weekdays at 15:00 UTC (00:00 JST).
   - Invokes Edge Function with `SUPABASE_SERVICE_ROLE_KEY`.

4. **TypeScript utilities**
   - `src/features/stocks/stooq-parser.ts`: Structured CSV parser with ticker normalization.
   - `src/features/stocks/price-refresh.ts`: `isStalePrice` and `hasThreeConsecutiveFailures` helpers.
   - `src/features/notifications/evaluation.ts`: Added `evaluateYieldRuleTransition` and `shouldSendDividendChangeNotification`.
   - `src/features/stocks/queries.ts`: Added `getStocksWithConsecutivePriceRefreshFailures` query helper.

## Skipped Checks Justification

- **DB lint**: No linked Supabase project in this local workspace; SQL syntax was reviewed manually.
- **Manual Edge Function invoke**: Requires remote Supabase project URL and `SUPABASE_SERVICE_ROLE_KEY`, not available in local dev sandbox.
- **Manual rule evaluation**: Requires seeded stock/holding/rule data and a running Supabase instance; unit tests cover the evaluation logic exhaustively.

## Failures

- None.
