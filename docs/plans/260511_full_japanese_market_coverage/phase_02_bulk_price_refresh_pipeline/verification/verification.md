# Phase 02 Verification Evidence

## Phase Information
- **Phase file**: `docs/plans/260511_full_japanese_market_coverage/phase_02_bulk_price_refresh_pipeline/plan.md`
- **Verification date**: 2026-05-11
- **Environment**: Local development (worktree `../dividend-calendar-app-wt-02`)

## Test Plan Verification

### 1. Schema Changes
- **Migration created**: `supabase/migrations/20260511000100_phase_02_bulk_price_refresh_pipeline.sql`
- **Changes verified**:
  - `refresh_stock_prices` added to `job_type` enum via `ALTER TYPE ... ADD VALUE IF NOT EXISTS`
  - `get_stocks_with_consecutive_price_refresh_failures` updated to include `support_status in ('supported', 'unsupported')` (previously only `'supported'`)

### 2. Edge Function `process-price-refresh`
- **File created**: `supabase/functions/process-price-refresh/index.ts`
- **Features verified**:
  - Service-to-service auth only (`Bearer {SUPABASE_SERVICE_ROLE_KEY}` or `Bearer {API_SECRET}`)
  - Accepts `{ run_date: "YYYY-MM-DD" }` in request body
  - Creates chunk jobs (50 tickers per chunk) for all non-delisted stocks on first invocation for a date
  - Explicitly sets `max_attempts: 4` on each job to allow 3 retries with backoff
  - Claims and executes the oldest pending job on subsequent invocations
  - Uses Stooq JSON endpoint: `https://stooq.com/q/l/?s={ticker}.JP&f=sd2t2ohlcv&h&e=json`
  - 200ms delay between ticker calls (configurable via `STOOQ_REQUEST_DELAY_MS`)
  - Individual ticker failures are logged to `stock_price_refresh_logs` and continue to next ticker
  - Chunk-level retry on `RetryableError` (e.g., Stooq 429) with exponential backoff: 5min → 15min → 45min
  - Stuck job recovery: at the start of each invocation, `running` jobs for the current `run_date` with `updated_at > 10 minutes ago` are reset to `pending`
  - After `max_attempts` reached, job marked as `failed`
  - Returns `{ processed, remainingJobs, failedTickers, errors }`
  - Updates `stocks.current_price` and `stocks.price_updated_at` on success

### 3. GitHub Actions Workflow
- **File updated**: `.github/workflows/refresh-stock-prices.yml`
- **Changes verified**:
  - Runs daily at 00:00 JST on weekdays (cron: `0 15 * * 1-5` UTC)
  - Supports `workflow_dispatch` with optional `run_date` input
  - Node.js while-loop script calls `process-price-refresh` repeatedly
  - Sleeps 10 seconds between invocations
  - Parses `result.remainingJobs` and exits loop when 0
  - Safety limit of 200 iterations to prevent infinite loops
  - Tracks consecutive HTTP errors; fails workflow after 3 consecutive errors
  - Exits with error if max iterations reached with remaining jobs

### 4. TypeScript Types
- **File updated**: `src/types/supabase.ts`
- **Changes verified**:
  - `job_type` enum updated to include `"refresh_stock_prices"`

### 5. Lint / Typecheck
- **Command**: `npm run lint`
- **Result**: PASS (zero warnings)
- **Command**: `npm run typecheck`
- **Result**: PASS (no errors)

### 6. Dry-Run Price Refresh Against Full Catalog
- **Command**: Run a dry-run price refresh against the full catalog in staging
- **Result**: SKIPPED
- **Reason**: No staging environment or local Supabase instance with 4,000+ stocks available in this development environment. The Edge Function logic was manually reviewed for correctness.

### 7. Failure Rate Verification
- **Command**: Verify `stock_price_refresh_logs` shows < 5% failure rate
- **Result**: SKIPPED
- **Reason**: Cannot be verified without running the actual pipeline against Stooq in a staging environment.

### 8. Stale Price Suppression Verification
- **Command**: Confirm `evaluate_notification_rules` still skips stale prices correctly
- **Result**: MANUALLY VERIFIED (code review)
- **Details**: The `evaluate_notification_rules` function (from `20260507003000_phase_03_price_refresh_and_alert_reliability.sql`) checks `price_updated_at` against a 48-hour stale threshold. Phase 02 does not modify this function or its behavior. The `stock_price_refresh_logs` table is also unchanged.

### 9. GitHub Actions Workflow Timeout Verification
- **Command**: Run GitHub Actions workflow manually and verify it completes within the job timeout
- **Result**: SKIPPED
- **Reason**: Cannot run GitHub Actions workflows from local development. The workflow was reviewed for structure and safety limits.

## Summary

All Phase 02 implementation items are complete. Lint and typecheck pass. Operational verification (dry-run, failure rate, workflow timeout) is deferred to staging due to environment constraints.
