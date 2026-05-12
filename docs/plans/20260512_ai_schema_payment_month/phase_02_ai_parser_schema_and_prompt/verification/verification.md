# Phase 02 Verification Evidence

## Phase Info
- **Phase file**: `docs/plans/20260512_ai_schema_payment_month/phase_02_ai_parser_schema_and_prompt/plan.md`
- **Verification date**: 2026-05-12
- **Environment**: Local development (worktree)

## Test Plan Verification

### 1. `npm run lint`
- **Status**: PASS
- **Command**: `npm run lint`
- **Result**: No errors, no warnings.

### 2. `npm run typecheck`
- **Status**: PASS
- **Command**: `npm run typecheck`
- **Result**: No TypeScript errors.
- **Note**: Supabase-generated types still reference old columns, but per plan this is expected and will be fixed in Phase 07.

### 3. AI parser schema changes
- **Status**: PASS
- **File**: `supabase/functions/_shared/pdf-ai-parser.ts`
- **Changes verified**:
  - `AiDividendEvent.expected_payment_date` removed
  - `AiDividendEvent.expected_payment_year` added (number | null)
  - `AiDividendEvent.fiscal_month` added (number | null)
  - `DividendReviewInsert.extracted_payment_date` removed
  - `DividendReviewInsert.extracted_payment_year` added (number | null)
  - `DividendReviewInsert.extracted_fiscal_month` added (number | null)
  - Prompt updated: `expected_payment_date` removed from JSON schema example, date extraction rules updated to use `expected_payment_year` and `fiscal_month`
  - `deriveExpectedPaymentYearMonth` function added with inference logic for year_end/interim events based on fiscal_month

### 4. `deriveExpectedPaymentYearMonth` unit tests
- **Status**: PASS
- **Command**: `npx vitest run src/features/disclosures/pdf-ai-parser.test.ts`
- **Result**: 92 tests passed
- **New tests added**: 11 test cases covering:
  - Null inputs (null fiscal_year/fiscal_month)
  - Non-inferable event types (special, commemorative, annual_total)
  - year_end inference for fiscal_month=3, 9, 12, 6, 11
  - interim inference for fiscal_month=3, 9, 12, 6, 1
  - fiscal_period fallback when event_type is missing

### 5. Existing unit tests
- **Status**: PASS
- **Command**: `npx vitest run src/features/disclosures/pdf-ai-parser.test.ts src/features/disclosures/parser-fixtures.test.ts`
- **Result**: 133 tests passed
- **Note**: Also fixed pre-existing test failures in `parser-fixtures.test.ts` by updating `makeAiEvent`/`makeAiOutput` helpers to match the new schema and adding missing `source` field.

### 6. Manual verification: `parse_disclosure` Edge Function wrapper
- **Status**: PASS (code review)
- **File**: `supabase/functions/parse-disclosure/index.ts`
- **Result**: This file is a thin RPC wrapper and does not reference the old columns directly. No changes needed.

### 7. Manual verification: `process-jobs` handler
- **Status**: PASS (code review)
- **File**: `supabase/functions/process-jobs/index.ts`
- **Result**: The `parse_disclosure_pdf_ai` handler calls `executeParseDisclosurePdfAi` from `pdf-ai-parser.ts`, so it inherits the schema changes automatically. No direct column references.

### 8. SQL `parse_disclosure` function update
- **Status**: PASS (migration applied + code review)
- **File**: `supabase/migrations/20260513020000_ai_schema_payment_month_phase_02.sql`
- **Migration applied**: `npx supabase migration up --local` succeeded
- **Function body verified**: `\df public.parse_disclosure` confirmed function exists; body grep confirmed `extracted_payment_year`, `extracted_fiscal_month` present
- **Direct invocation test**: SKIPPED — function requires `assert_admin()` which raises 'Not authenticated' when called via psql without a valid JWT. This is expected security behavior. Skip justified by code review and migration syntax verification.

### 9. Prompt JSON schema fix (post-audit)
- **Status**: PASS
- **Fix**: Added `"fiscal_month": number | null` to the `events[]` JSON schema example in `buildDividendExtractionPrompt`
- **Verification**: `npm run lint` and `npm run typecheck` both pass after fix

## Issues Noted
- `npm run test` (full suite) shows pre-existing failures in E2E tests (Playwright version mismatch), integration tests (require `RUN_REMOTE_TESTS=1`), and some unrelated unit tests. These are not caused by Phase 02 changes.

## Files Changed
- `supabase/functions/_shared/pdf-ai-parser.ts`
- `src/features/disclosures/pdf-ai-parser.test.ts`
- `src/features/disclosures/parser-fixtures.test.ts`
- `supabase/migrations/20260513020000_ai_schema_payment_month_phase_02.sql`
