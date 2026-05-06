# Phase 03: Price Refresh and Alert Reliability

## Goal

Make price-based notification rules reliable by refreshing supported stock prices daily, suppressing yield alerts when cached prices are stale, and deduplicating alerts by rule state transition.

## Prerequisites

- Phase 02 Completion Criteria are met.
- Supported stock rows include ticker values that can be mapped to Stooq symbols.
- Scheduler secrets can be configured for local and GitHub Actions Cron execution.

## Implementation Scope

- Implement Stooq free CSV daily close refresh for supported Japanese stocks.
- Store current price, price timestamp, refresh status, failure count, and last error using existing `stocks` columns where sufficient; add a small `stock_price_refresh_logs` table if needed.
- Add ticker-to-Stooq symbol mapping for supported seed stocks.
- Suppress yield-based alert evaluation when `stocks.price_updated_at` is older than 48 hours.
- Add `notification_rules.last_condition_met boolean not null default false`.
- Update yield rule evaluation so notifications emit only on false-to-true transitions.
- Deduplicate dividend change notifications by `(user_id, stock_id, dividend_event_id, type)`.
- Ensure dividend change alerts are sent only to users who hold the stock.
- Add admin-visible warning or log output for three consecutive price refresh failures.

## Core Tasks

1. **Price refresh foundation**
   - Add migration fields or log table required for refresh status and failure tracking.
   - Implement `refresh-stock-prices` Edge Function or scheduler-invoked script.
   - Parse Stooq CSV using a structured parser, not ad hoc string slicing.
   - Update only supported stocks with valid prices.

2. **Scheduler integration**
   - Add or update GitHub Actions Cron workflow for daily price refresh.
   - Require a scheduler secret for invoking the Edge Function.
   - Log refresh counts, skipped symbols, and failures.

3. **Yield alert stale policy**
   - Update `evaluate_notification_rules` to skip yield rules when price is older than 48 hours.
   - Record skipped stale evaluations in logs or job payload output.
   - Leave dividend-change alert evaluation unaffected by stale prices.

4. **State-transition deduplication**
   - Add `last_condition_met` to `notification_rules`.
   - Update rule evaluation transitions:
     - false to true creates notification and sets true.
     - true to true creates no notification.
     - true to false sets false.
     - false to false creates no notification.
   - Keep rule status and notification settings respected.

5. **Holder-only dividend change alerts**
   - Ensure approval/change logic queries distinct active holding users for the event stock.
   - Add uniqueness protection or explicit lookup to avoid duplicate dividend change notifications.
   - Confirm users without holdings do not receive dividend change notifications.

6. **Unit tests to add**

   `src/features/stocks/stooq-parser.test.ts` (new):
   - Valid Stooq CSV row with date and close price parses to `{ ticker, price, updatedAt }`.
   - Row with missing or non-numeric close price returns null.
   - Empty CSV body returns an empty result, not an error.
   - Ticker is normalized from Stooq `<ticker>.JP` format to a four-digit Japanese stock code.

   `src/features/stocks/price-refresh.test.ts` (new):
   - `isStalePrice(updatedAt, thresholdHours)` returns `true` when `now - updatedAt > threshold`.
   - `isStalePrice` returns `false` for a timestamp within the threshold.
   - `isStalePrice` returns `true` for a null `updatedAt` (treat unknown as stale).

   `src/features/notifications/evaluation.test.ts` (update):
   - Yield rule with stale price (`price_updated_at` > 48 h): evaluation skipped, no notification, `last_condition_met` unchanged.
   - Yield rule, fresh price, `last_condition_met = false`, condition now met: notification created, flag set to `true`.
   - Yield rule, fresh price, `last_condition_met = true`, condition still met: no new notification, flag unchanged.
   - Yield rule, fresh price, `last_condition_met = true`, condition now unmet: no notification, flag set to `false`.
   - Dividend change alert sent only to users with an active holding for the changed stock.
   - Duplicate alert for `(user_id, stock_id, dividend_event_id, type)` is not created.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:unit` — all new parser, stale-price, and evaluation tests must pass.
- Run Supabase DB lint if available with `npx supabase@latest db lint --linked`.
- Manually invoke local or linked `refresh-stock-prices` with a limited symbol set.
- Manually evaluate notification rules for fresh price, stale price, false-to-true, true-to-true, and true-to-false cases.

## Completion Criteria

- Supported stocks can be refreshed from Stooq daily close data.
- `stocks.current_price` and `stocks.price_updated_at` update only from valid parsed prices.
- Yield alerts are skipped when cached price is older than 48 hours.
- Yield alerts are emitted only when a rule changes from unmet to met.
- Dividend change notifications are created only for active holders of the changed stock.
- Duplicate dividend change notifications cannot be generated for the same user, event, and type.

## Excluded From This Phase

- Real-time intraday prices.
- Paid market data APIs.
- Watchlist alerts for unowned stocks.
- Email delivery of generated notifications.
