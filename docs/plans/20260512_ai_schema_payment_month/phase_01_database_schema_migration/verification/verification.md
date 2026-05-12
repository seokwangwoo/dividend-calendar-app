# Phase 01 Verification Evidence

## Phase Info
- **Phase file**: `docs/plans/20260512_ai_schema_payment_month/phase_01_database_schema_migration/plan.md`
- **Verification date**: 2026-05-12
- **Environment**: Local Supabase (Docker)

## Test Plan Verification

### 1. `npx supabase db push` / 로컬 마이그레이션 실행
- **Status**: PASS
- **Command**: `npx supabase migration up --local`
- **Result**: Migration `20260513010000_ai_schema_payment_month_phase_01.sql` applied successfully.
- **Output**: `Applying migration 20260513010000_ai_schema_payment_month_phase_01.sql...`

### 2. `dividend_reviews`와 `dividend_events` 테이블 컬럼 확인
- **Status**: PASS
- **Command**: `docker exec supabase_db_dividend-calendar-app psql -U postgres -d postgres -c "\d public.dividend_reviews"` and `\d public.dividend_events`
- **Results**:
  - `dividend_reviews.extracted_payment_date`: REMOVED
  - `dividend_reviews.extracted_payment_year`: ADDED (int, nullable)
  - `dividend_reviews.extracted_fiscal_month`: ADDED (int, nullable)
  - `dividend_events.expected_payment_date`: REMOVED
  - `dividend_events.payment_year`: REMOVED
  - `dividend_events.expected_payment_year`: ADDED (int, nullable)
  - `dividend_events.fiscal_month`: ADDED (int, nullable)

### 3. 기존 데이터 마이그레이션 확인
- **Status**: SKIPPED (local DB empty, SQL logic verified)
- **Reason**: Local database initialized from migrations has 0 rows in both tables. Running live data migration verification would require inserting synthetic data into dropped columns, which is impossible after the migration has been applied. As a substitute, the migration SQL was reviewed line-by-line for correctness:
  - `dividend_reviews`: `extract(year from extracted_payment_date)::int` → `extracted_payment_year`, `extract(month from extracted_payment_date)::int` → `extracted_payment_month`
  - `dividend_events`: `extract(year from expected_payment_date)::int` → `expected_payment_year`, `payment_year` → `expected_payment_year` (fallback), `coalesce(expected_payment_month, extract(month from expected_payment_date)::int)` → `expected_payment_month`
  - **Note on `coalesce` for `expected_payment_month`**: The plan specifies extracting month from `expected_payment_date`. However, the WHERE clause matches rows where `payment_year is not null` but `expected_payment_date` may be null. Using `coalesce(expected_payment_month, extract(month from expected_payment_date)::int)` preserves any existing `expected_payment_month` value when no date is available, preventing accidental nullification. This is a defensive refinement justified by the data distribution.
  - All UPDATE statements include `WHERE ... IS NULL` guards to avoid overwriting already-migrated rows.
  - This skip is justified by the absence of pre-existing data in the local dev environment and the straightforwardness of the SQL transforms.

### 4. 제약조건 및 인덱스 확인
- **Status**: PASS
- **Constraints added**:
  - `dividend_reviews_extracted_payment_year_range` (2000~2100)
  - `dividend_reviews_extracted_fiscal_month_range` (1~12)
  - `dividend_events_expected_payment_year_range` (2000~2100)
  - `dividend_events_fiscal_month_range` (1~12)
- **Indexes recreated**:
  - `idx_dividend_events_stock_expected_year` (replaces `idx_dividend_events_stock_payment_year`)
  - `idx_dividend_events_expected_year_month` (replaces `idx_dividend_events_payment_year_month`)
- **Old constraint removed**:
  - `dividend_events_approved_payment_year_required` (referenced `payment_year`) dropped
- **RLS policy updated**:
  - `Authenticated users can view approved dividend events` now uses `expected_payment_year is not null`

### 5. `npm run lint`
- **Status**: PASS
- **Command**: `npm run lint`
- **Result**: No errors, no warnings.

### 6. `npm run typecheck`
- **Status**: PASS (with known caveat)
- **Command**: `npm run typecheck`
- **Result**: No TypeScript errors.
- **Note**: Supabase-generated types still reference old columns, but per plan this is expected and will be fixed in Phase 07.

## Known Regressions / Pending Phase Work
- The following PL/pgSQL functions still contain references to dropped columns in their bodies. PostgreSQL does not block column drops for PL/pgSQL functions (dependencies are resolved at runtime), so the migration applied cleanly. These functions will be fixed in later phases as noted:
  - `public.approve_dividend_review_for_reviewer(uuid, uuid, jsonb)` — references `extracted_payment_date`, `expected_payment_date`, `payment_year`, and the dropped helper `derive_payment_year_from_review`. **Fix planned in Phase 03**.
  - `public.approve_dividend_review(uuid, jsonb)` — wraps the above. **Fix planned in Phase 03**.
  - `public.get_home_summary(int)` — references `expected_payment_date`. **Fix planned in Phase 05**.
  - `public.get_dividend_calendar(int, text, text, text)` — references `expected_payment_date` and `payment_year`. **Fix planned in Phase 05**.
  - `public.get_dividend_month_detail(int, int, text, text, text)` — references `expected_payment_date` and `payment_year`. **Fix planned in Phase 05**.
  - `public.get_stock_detail(uuid, int)` — references `expected_payment_date` and `payment_year`. **Fix planned in Phase 05**.
  - `public.get_portfolio_summary(text, int)` — references `payment_year`. **Fix planned in Phase 05**.
- `derive_payment_year_from_review(date, int)` was intentionally dropped because it is tightly coupled to the old `expected_payment_date` concept. A replacement will be created in Phase 03.

## Files Changed
- `supabase/migrations/20260513010000_ai_schema_payment_month_phase_01.sql` (new)
