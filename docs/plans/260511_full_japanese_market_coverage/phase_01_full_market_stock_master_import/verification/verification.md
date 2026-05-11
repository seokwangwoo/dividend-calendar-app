# Phase 01 Verification Evidence

## Phase Information
- **Phase file**: `docs/plans/260511_full_japanese_market_coverage/phase_01_full_market_stock_master_import/plan.md`
- **Verification date**: 2026-05-11
- **Environment**: Local development (worktree `../dividend-calendar-app-wt-01`)

## Test Plan Verification

### 1. Schema Changes
- **Migration created**: `supabase/migrations/20260511000000_phase_01_full_market_stock_master_import.sql`
- **Changes verified**:
  - `stock_support_status` enum extended with `'delisted'` via `ALTER TYPE ... ADD VALUE IF NOT EXISTS`
  - `market_segment` text column added to `stocks` via `ADD COLUMN IF NOT EXISTS`
  - `idx_stocks_market_segment` index created
  - `stock_import_logs` table created with all required columns
  - RLS enabled on `stock_import_logs` with admin-only SELECT policy
  - Authenticated users granted only SELECT on `stock_import_logs`

### 2. Edge Function
- **File created**: `supabase/functions/parse-stock-master-csv/index.ts`
- **Features verified**:
  - Admin authentication using JWT + `profiles.role = 'admin'` check
  - Downloads CSV from Supabase Storage (bucket/path parsing)
  - Validates CSV header (`ticker,name,market_segment`)
  - Rejects duplicate tickers within the file
  - Supports `dryRun` mode (returns preview without writing)
  - Upserts by `ticker` preserving existing rows and `id`
  - Sets new rows to `support_status = 'unsupported'`
  - Updates delisted tickers (DB present, CSV absent) to `support_status = 'delisted'`
  - Always overwrites `name` and `market_segment` on upsert
  - Logs execution to `stock_import_logs`

### 3. TypeScript Types
- **File updated**: `src/types/supabase.ts`
- **Changes verified**:
  - `stocks.Row.support_status` updated to include `"delisted"`
  - `stocks.Row.market_segment` added as `string | null`
  - `stock_import_logs` table added with full row type

### 4. Operating Manual
- **File created**: `docs/ops/stock-master-import-manual.md`
- **Coverage verified**:
  - JPX XLS → CSV conversion steps
  - Supabase Storage upload instructions (bucket `imports`, path convention)
  - Dry-run workflow documented
  - Edge Function invocation URL and body format
  - Rollback procedures
  - Troubleshooting table
  - Security notes

### 5. Lint / Typecheck
- **Command**: `npm run lint`
- **Result**: PASS (zero warnings)
- **Command**: `npm run typecheck`
- **Result**: PASS (no errors)

### 6. Import Row Count Verification
- **Command**: Run import locally/staging and verify `stocks` row count >= 3,800
- **Result**: SKIPPED
- **Reason**: Local Supabase instance is not running in this environment, and no `imports` Storage bucket is configured. The actual import requires uploading a JPX CSV to Supabase Storage and invoking the Edge Function against a live database. The Edge Function logic was manually reviewed to confirm it processes all parsed rows and performs batched upserts. This verification must be performed in a staging environment with a real JPX CSV before production use.

### 7. Foreign Key Integrity Verification
- **Command**: Confirm existing holdings and `dividend_events` foreign keys still resolve
- **Result**: MANUALLY VERIFIED (code review)
- **Details**: The Edge Function upserts by `ticker` using `onConflict: "ticker"`, which preserves existing `id` values. This was verified by inspecting the Supabase `upsert` behavior: when `onConflict` matches, the existing row is updated and the primary key is retained. Therefore, foreign key references from `holdings.stock_id`, `dividend_events.stock_id`, and `notification_rules.stock_id` remain valid. No `DELETE` operations are performed on `stocks`.

### 8. RLS Verification — `stocks` SELECT
- **Command**: Verify RLS `select` on `stocks` still returns data for authenticated users
- **Result**: MANUALLY VERIFIED (policy review)
- **Details**: The existing RLS policy `"Authenticated users can view stocks"` on `public.stocks` (from `20260505000000_phase_02_database_auth_rls.sql`) uses `using (true)` for SELECT, which is unchanged by this phase. No migration modifies `stocks` RLS policies. The policy continues to allow all authenticated users to select from `stocks`.

### 9. RLS Verification — `stock_import_logs`
- **Result**: MANUALLY VERIFIED
- **Details**:
  - `stock_import_logs` has `enable row level security`
  - SELECT policy restricts to `public.is_admin()`
  - No INSERT/UPDATE/DELETE grants for authenticated users
  - Edge Function uses service role client for inserts

### 10. Frontend Impact Review
- **Result**: MANUALLY VERIFIED
- **Details**: Searched `src/` for `support_status` usage. Existing checks (`=== 'supported'`, `!== 'supported'`) correctly handle new `'delisted'` value. No changes required to holdings/actions or new-holding-form.

### 11. Unit Tests
- **Command**: `npm run test:unit`
- **Result**: SKIPPED
- **Reason**: Pre-existing environment issue with `rolldown` native binding (`@rolldown/binding-linux-x64-gnu` not found). This is unrelated to Phase 01 changes.

## Summary

All Phase 01 implementation items are complete. Lint and typecheck pass. The import row count verification is deferred to staging due to environment constraints. All other test plan items were verified via code review or manual policy inspection. Unit tests cannot run due to a pre-existing native dependency issue in the sandbox environment.
