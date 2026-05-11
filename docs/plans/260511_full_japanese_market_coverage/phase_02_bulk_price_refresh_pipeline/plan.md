# Phase 02: Bulk Price Refresh Pipeline

## Goal

Make the daily price refresh reliable for ~4,000 tickers without hitting Stooq rate limits or GitHub Actions timeouts.

## Prerequisites

- Phase 01 Completion Criteria are met.
- `stocks` table contains all tickers with valid `ticker` values.
- `stock_price_refresh_logs` table and `refresh-stock-prices` Edge Function exist.

## Implementation Scope

- Refactor `refresh-stock-prices` Edge Function for batching and throttling.
- Update the GitHub Actions Cron workflow to handle longer runs or split batches.
- Improve failure tracking and stale-price suppression logic.

## Core Tasks

1. **Architecture: separate `process-price-refresh` Edge Function and workflow**
   - Do **not** extend `process-jobs`. Create a dedicated `process-price-refresh` Edge Function.
   - Create a new GitHub Actions workflow `refresh-stock-prices.yml` that runs daily at 00:00 JST (weekdays only).
   - `refresh-stock-prices.yml` invokes `process-price-refresh` in a loop until no pending jobs remain.
   - Workflow loop: Node.js `while` script with `fetch()` (same pattern as `collect-disclosures.yml`).
   - Loop body: POST to `process-price-refresh` with `{ run_date: "YYYY-MM-DD" }` → parse response → sleep 10s → repeat while `remainingJobs > 0`.
   - `process-price-refresh` queries `jobs` table filtered by `type = 'refresh_stock_prices'` only, completely separate from `process-jobs` which handles `download_disclosure_pdf` and `parse_disclosure_pdf_ai`.

2. **Job creation and idempotency**
   - `process-price-refresh` accepts `run_date` (e.g., `"2026-05-11"`) in the request body.
   - On each invocation, it first checks if `refresh_stock_prices` jobs for the given `run_date` exist. If not, it creates all chunk jobs for that date.
   - Chunk size: 50 tickers per job. ~4,000 tickers → ~80 jobs.
   - Job payload: `{ run_date: "2026-05-11", offset: 0, tickers: ["9433", "2914", ...] }`.
   - If pending jobs for the given `run_date` already exist, it claims and executes the oldest pending job.
   - Returns `{ processed, remainingJobs, failedTickers }` so the workflow loops while `remainingJobs > 0`.

3. **Stooq API call details**
   - One ticker per request (comma-separated batch does not work reliably).
   - Use JSON response endpoint: `https://stooq.com/q/l/?s={ticker}.JP&f=sd2t2ohlcv&h&e=json`.
   - 200ms delay between ticker calls within a chunk to avoid burst rate limiting.
   - TSE tickers map to Stooq by appending `.JP`.

4. **Failure handling per ticker**
   - If a single ticker fails (HTTP error, timeout, invalid response), log `stock_price_refresh_logs` with `status: "failure"` and continue with the next ticker.
   - Do **not** stop the entire chunk because of one ticker failure.
   - Consecutive failure detection (`get_stocks_with_consecutive_price_refresh_failures`) remains active.

5. **Chunk-level retry policy**
   - If a chunk job fails (e.g., Stooq 429, Edge Function timeout), retry with `max_attempts = 3` and exponential backoff (5min → 15min → 45min).
   - After 3 failures, mark the job as `failed` and log the error for admin review.
   - Do not split the chunk into individual ticker jobs on retry.

5. **Stale price policy**
   - Keep the 48-hour stale threshold for notification rules.
   - Refresh target: **all stocks except `delisted`** (both `supported` and `unsupported`).

6. **Operational parameters**
   - Environment variable `STOOQ_REQUEST_DELAY_MS` (default: 200).
   - Environment variable `PRICE_REFRESH_CHUNK_SIZE` (default: 50).
   - Workflow loop sleep between invocations: 10 seconds.

7. **Authentication**
   - `process-price-refresh` accepts `Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}` or `Bearer {API_SECRET}` only (service-to-service).
   - Admin manual invocation is via GitHub Actions `workflow_dispatch`, not direct Edge Function call.

## Test Plan

- Run a dry-run price refresh against the full catalog in staging.
- Verify `stock_price_refresh_logs` shows < 5% failure rate.
- Confirm `evaluate_notification_rules` still skips stale prices correctly.
- Run GitHub Actions workflow manually and verify it completes within the job timeout.

## Completion Criteria

- All `stocks` rows receive a `current_price` update at least once per business day.
- Refresh pipeline completes within GitHub Actions timeout (or uses continuation/batching).
- Consecutive failure detection works for any ticker (`get_stocks_with_consecutive_price_refresh_failures`).
- No Stooq rate-limit blocks observed over a 3-day staging test.

## Excluded From This Phase

- Real-time or intraday prices.
- Changing price data sources.
- Frontend price display changes beyond stale banner.
