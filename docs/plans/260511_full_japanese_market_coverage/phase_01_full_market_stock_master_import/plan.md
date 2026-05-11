# Phase 01: Full Market Stock Master Import

## Goal

Replace the current curated seed (~35 stocks) with a complete JPX/TSE stock master so every listed equity is searchable and can hold price data.

## Prerequisites

- MVP database and RLS are in place.
- Admin edge functions and `is_admin()` helper exist.
- Foreign keys from `holdings`, `dividend_events`, and `notification_rules` to `stocks(id)` are active.

## Implementation Scope

- Identify and automate a JPX/TSE stock list source.
- Extend `stocks` schema if needed (market segment).
- Upsert full catalog without deleting existing user-linked rows.
- Backfill basic metadata for all new rows.

## Core Tasks

1. **Source and cadence**
   - Use JPX "List of TSE-listed Issues" XLS as the canonical master source.
   - Update cadence: once per month (admin-initiated).
   - Required columns from the XLS: ticker (code), name (company name), market segment (e.g., TSE Prime, TSE Standard, TSE Growth), exchange.
   - Target scope: TSE Prime / Standard / Growth + JASDAQ common stocks (~3,800+). Exclude ETF/ETN/REIT/優先株/foreign-listed stocks.

2. **Schema extension**
   - Add `market_segment` text column to `stocks` (e.g., 'TSE Prime', 'TSE Standard', 'TSE Growth').
   - Extend `stock_support_status` enum with `'delisted'`: `('supported', 'unsupported', 'delisted')`.
   - Ensure `ticker` unique constraint and existing indexes remain valid.
   - Add an index on `market_segment` if filtering by segment is planned in Phase 04.

3. **Upload and parse flow**
   - Admin converts JPX XLS to CSV (UTF-8, English headers: `ticker,name,market_segment`) and uploads to a private Supabase Storage bucket (e.g., `imports/stock-master/YYYYMM_list_of_tse_listed_issues.csv`).
   - Invoke an Edge Function `parse-stock-master-csv` via Supabase Studio that reads the uploaded file from Storage, parses rows, normalizes ticker/name/exchange/market_segment, and upserts into `stocks`.
   - Preserve existing `id` values to avoid breaking foreign keys (upsert by `ticker`).
   - Set default `support_status` for new rows to `unsupported`.
   - Delisted tickers (not present in the latest CSV but present in DB) are updated to `support_status = 'delisted'`.
   - Name and `market_segment` changes are always overwritten on upsert.
   - Log import summary to a new `stock_import_logs` table:
     ```sql
     create table stock_import_logs (
       id uuid primary key default gen_random_uuid(),
       file_path text not null,
       dry_run boolean not null default false,
       processed_count int not null default 0,
       inserted_count int not null default 0,
       updated_count int not null default 0,
       delisted_count int not null default 0,
       failed_count int not null default 0,
       status text not null check (status in ('running', 'success', 'failed')),
       error_message text,
       started_at timestamptz not null default now(),
       completed_at timestamptz,
       created_at timestamptz not null default now()
     );
     ```
   - RLS: `is_admin()`만 SELECT 가능. INSERT는 Edge Function의 service role로 처리.

4. **Operational safeguards**
   - Validate CSV header before processing (`ticker,name,market_segment`).
   - Reject upload if `ticker` duplicates exist within the file.
   - Provide a dry-run mode that returns a preview diff without writing to `stocks`.
   - Admin workflow: upload CSV → call Edge Function with `dryRun=true` → review diff → call with `dryRun=false`.
   - Document rollback plan (restore previous snapshot by ticker re-insertion from a prior uploaded file).
   - Write operating manual: `docs/ops/stock-master-import-manual.md` covering bucket path convention, file naming, CSV encoding, Excel→CSV conversion steps, Edge Function invocation URL, dry-run workflow, and rollback procedures.

## Test Plan

- Run import locally/staging and verify `stocks` row count >= 3,800.
- Confirm existing holdings and `dividend_events` foreign keys still resolve.
- Run `npm run lint` and `npm run typecheck`.
- Verify RLS `select` on `stocks` still returns data for authenticated users.

## Completion Criteria

- `stocks` contains all TSE/JPX listed equities.
- Existing 35 curated rows retain their `id`, `support_status`, and linked data.
- `market_segment` is populated for all rows.
- `stock_support_status` enum is extended to `('supported', 'unsupported', 'delisted')`.
- `stock_import_logs` table is created and records every import execution.
- Delisted tickers (not present in latest CSV but present in DB) are updated to `support_status = 'delisted'`.
- Import job is repeatable (idempotent upsert by `ticker`).
- Operating manual exists at `docs/ops/stock-master-import-manual.md`.

## Excluded From This Phase

- Price refresh for 4,000 tickers.
- Dividend disclosure scanning expansion.
- Frontend search changes.
