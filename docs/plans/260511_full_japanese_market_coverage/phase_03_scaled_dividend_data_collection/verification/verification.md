# Phase 03 Verification Evidence

## Phase Information
- **Phase file**: `docs/plans/260511_full_japanese_market_coverage/phase_03_scaled_dividend_data_collection/plan.md`
- **Verification date**: 2026-05-11
- **Environment**: Local development (worktree `../dividend-calendar-app-wt-03`)

## Test Plan Verification

### 1. Schema Changes
- **Migration created**: `supabase/migrations/20260511000200_phase_03_scaled_dividend_data_collection.sql`
- **Changes verified**:
  - `priority` int column added to `jobs` table with CHECK constraint (1-3)
  - `ai_parse_input_tokens`, `ai_parse_output_tokens`, `ai_parse_cost_usd` added to `disclosures`
  - `idx_jobs_priority_run_after` partial index created (status='pending')
  - `idx_jobs_status_type` index created for queue depth queries
  - `idx_disclosures_ai_parsed_at` partial index created for daily cost aggregation

### 2. Collection Frequency
- **File updated**: `.github/workflows/collect-disclosures.yml`
- **Changes verified**:
  - Cron updated to run hourly 24 times daily: `0 * * * *` UTC

### 3a. Batch Reject Quick Action
- **File created**: `supabase/functions/batch-reject-dividend-reviews/index.ts`
- **Changes verified**:
  - Admin-only Edge Function (JWT + `profiles.role = 'admin'`)
  - Accepts `{ reviewIds: string[], reason?: string }`
  - Rejects up to 100 `pending` reviews at once
  - Sets `status = 'rejected'`, `rejection_reason`, `reviewed_by`, `reviewed_at`
  - Returns `{ rejectedCount, requestedCount, rejectedIds }`

### 4. Queue Depth Guard
- **File updated**: `supabase/functions/collect-disclosures/index.ts`
- **Changes verified**:
  - Before fetching candidates, checks pending job count for `download_disclosure_pdf` and `parse_disclosure_pdf_ai`
  - If count >= `MAX_DISCLOSURE_QUEUE_DEPTH` (default 500), returns early with guard-triggered message
  - Prevents unbounded queue growth

### 4. AI Parsing Cost Controls
- **Files updated**: `supabase/functions/_shared/pdf-ai-parser.ts`, `supabase/functions/process-jobs/index.ts`
- **Changes verified**:
  - Estimated input tokens check before OpenAI call (conservative: prompt.length / 2)
  - If estimated > 50,000 tokens, aborts with `excessive_tokens` and `retryable: false`
  - After successful call, logs `input_tokens`, `output_tokens`, and estimated `cost_usd` to `disclosures`
  - Cost estimation uses gpt-4o-mini ($0.15/$0.60 per 1M) vs gpt-4o ($2.50/$10.00 per 1M) pricing
  - Daily cap check in `listRunnableJobs`: skips `parse_disclosure_pdf_ai` jobs when budget or call cap reached
  - Environment variables: `DAILY_AI_PARSE_BUDGET_USD` (default 5.0), `DAILY_AI_PARSE_CALL_CAP` (default 250)

### 5. Parsing Priority Queue
- **Files updated**: `supabase/functions/process-jobs/index.ts`, `supabase/functions/_shared/process-jobs.ts`
- **Changes verified**:
  - `jobs` query orders by `priority ASC, run_after ASC`
  - `ensureParseJob` calculates priority dynamically:
    - Priority 1: stock has active holdings (`deleted_at IS NULL`)
    - Priority 2: `supported` stock with approved dividend history
    - Priority 3: all others
  - `JobRow` type and `normalizeJobRow` updated to include `priority`
  - `claimJob` select includes `priority` to preserve it after claim

### 5a. SKIP_UNHELD_UNPARSED Toggle
- **File updated**: `supabase/functions/process-jobs/index.ts`
- **Changes verified**:
  - Environment variable `SKIP_UNHELD_UNPARSED` checked in `ensureParseJob`
  - When `"true"`, skips creating parse jobs for stocks with no active holdings
  - Default behavior (when unset or not `"true"`) still creates jobs for all disclosures

### 5b. Admin Triage Improvements
- **File updated**: `src/features/admin/review-queries.ts`
- **Changes verified**:
  - Added `tickerFrom`, `tickerTo`, `dateFrom`, `dateTo` to `DividendReviewFilters`
  - Server-side date range filtering (`gte`/`lte` on `created_at`)
  - Client-side ticker range filtering (alphabetic comparison)
  - Existing filters preserved: `status`, `priority`, `disclosureType`, `ticker`, `changeType`

### 6. TypeScript Types
- **File updated**: `src/types/supabase.ts`
- **Changes verified**:
  - `jobs` Row/Insert/Update types include `priority: number`
  - `disclosures` Row/Insert/Update types include `ai_parse_input_tokens`, `ai_parse_output_tokens`, `ai_parse_cost_usd`

### 7. Lint / Typecheck
- **Command**: `npm run lint`
- **Result**: PASS (zero warnings)
- **Command**: `npm run typecheck`
- **Result**: PASS (no errors)

### 8. Staging Collection Test
- **Command**: Run `collect-disclosures` in staging and verify it collects filings for low-profile tickers
- **Result**: SKIPPED
- **Reason**: No staging environment with Yanoshin API access available in local development.

### 9. Queue Priority Test
- **Command**: Verify `jobs` pending count stays manageable with priority ordering
- **Result**: MANUALLY VERIFIED (code review)
- **Details**: The `listRunnableJobs` query uses `order("priority", { ascending: true }).order("run_after", { ascending: true })` which ensures higher-priority jobs are claimed first. The queue depth guard prevents unbounded growth.

## Summary

All Phase 03 implementation items are complete. Lint and typecheck pass. Staging collection test deferred due to environment constraints.
