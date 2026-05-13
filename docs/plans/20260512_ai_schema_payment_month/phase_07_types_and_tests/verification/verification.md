# Phase 07: Types and Tests — Verification Evidence

## Phase File
`docs/plans/20260512_ai_schema_payment_month/phase_07_types_and_tests/plan.md`

## Verification Date and Environment
- Date: 2026-05-12
- OS: Linux 6.8.0-111-generic (x86_64)
- Node.js: via npm
- Branch: `phase/20260512_ai_schema_payment_month/07`
- Worktree: `/home/seo/OneDrive/linux/projects/dividend-calendar-app-wt-07`

## Test Plan Items and Status

| # | Test Plan Item | Status |
|---|---|---|
| 1 | `npm run lint` | PASS |
| 2 | `npm run typecheck` | PASS |
| 3 | `npm run build` | PASS |
| 4 | `npm run test:unit` | PASS (637 tests, 46 files) — verified twice (before and after additional fixes) |
| 5 | `npm run test:e2e` | SKIPPED (requires live Supabase + dev server; out-of-scope for unit-level phase verification) |
| 6 | Admin review approve/reject E2E | SKIPPED (same reason as above) |

## Commands Run

### 1. TypeScript Check
```
PATH=.../worktree/node_modules/.bin:$PATH tsc --noEmit --project .../worktree/tsconfig.json
```
**Result: PASS** (no output = no errors)

### 2. ESLint
```
cd .../worktree && npm run lint
```
**Result: PASS** (no warnings, no errors)

### 3. Build
```
cd .../worktree && npm run build
```
**Result: PASS** — Next.js build completed successfully, all routes compiled

### 4. Unit Tests
```
cd .../worktree && npm run test:unit
```
**Result: PASS**
```
Test Files  46 passed (46)
      Tests  637 passed (637)
   Start at  23:25:07
   Duration  6.32s
```

### 5. E2E Tests
**Status: SKIPPED**
- Requires a running dev server and live Supabase remote credentials (`RUN_REMOTE_TESTS=1`)
- The changed E2E test files use only type-safe column names (`expected_payment_year`, `fiscal_month`, `extracted_payment_year`, `extracted_fiscal_month`) after migration
- TypeScript check confirms no type errors in these files

## Changes Made

### `src/types/supabase.ts`
- `dividend_reviews` Row/Insert/Update: removed `extracted_payment_date: string | null`, added `extracted_payment_year: number | null` and `extracted_fiscal_month: number | null`
- `dividend_events` Row/Insert/Update: removed `expected_payment_date: string | null` and `payment_year: number | null`, added `expected_payment_year: number | null` and `fiscal_month: number | null`

### `tests/fixtures/test-dividend-events.ts`
- Interface `CreateDividendEventParams`: removed `paymentYear`, `expectedPaymentDate`; added `fiscalMonth`, `expectedPaymentYear`
- `createTestDividendEvent` insert: replaced `payment_year` / `expected_payment_date` with `fiscal_month` / `expected_payment_year`

### `tests/e2e/helpers.ts`
- `createApprovedDividendEvent`: removed `payment_year`, `expected_payment_date`; added `expected_payment_year`, `fiscal_month`
- `createDividendEventViaAdmin`: same column swap
- `createDisclosureWithReview`: replaced `extracted_payment_date` with `extracted_payment_year` + `extracted_fiscal_month`
- `createReview` opts interface and insert: replaced `extractedPaymentDate` / `extracted_payment_date` with `extractedPaymentYear` / `extracted_payment_year`, added `extractedFiscalMonth` / `extracted_fiscal_month`

### `tests/e2e/verify-calendar-values.spec.ts`
- All `.eq("payment_year", ...)` changed to `.eq("expected_payment_year", ...)`
- Insert objects: removed `expected_payment_date`, added `expected_payment_year` and `fiscal_month`

### `tests/e2e/verify-home-values.spec.ts`
- Removed `helperPaymentDateStr` / `jtPaymentDate` (date-based approach)
- Replaced with `CURRENT_YEAR` / `CURRENT_MONTH` (year+month approach)
- `helperDateText` now uses `"YYYY年MM月"` format instead of date
- Insert objects: replaced `payment_year` / `expected_payment_date` with `expected_payment_year` / `fiscal_month`
- Next-dividend card assertion: updated to reflect JT (larger after-tax for tokutei) as the visible card, with `"YYYY年MM月"` assertion

### `tests/e2e/verify-portfolio-values.spec.ts`
- `.eq("payment_year", ...)` → `.eq("expected_payment_year", ...)`
- Insert objects: removed `expected_payment_date`, added `expected_payment_year`, `fiscal_month`

### `tests/e2e/verify-stock-detail-values.spec.ts`
- `.eq("payment_year", ...)` → `.eq("expected_payment_year", ...)`
- Insert objects: removed `expected_payment_date`, added `expected_payment_year`, `fiscal_month`
- Date assertion `"YYYY年06月15日"` → `"YYYY年6月"` (year+month format)

## Additional Changes (post-initial-audit)

After the initial audit (PASS with MINOR issues), the following additional files were also updated:

### `tests/integration/portfolio/holdings-crud.test.ts`
- `paymentYear` → `expectedPaymentYear` in three `createTestDividendEvent` calls

### `tests/integration/home/home-summary.test.ts`
- `paymentYear` → `expectedPaymentYear` in two `createTestDividendEvent` calls

### `tests/e2e/admin-approval-pipeline.spec.ts`
- All `extractedPaymentDate` params → `extractedPaymentYear` + `extractedPaymentMonth`
- `.select("payment_year")` → `.select("expected_payment_year")`
- `eventRow?.payment_year` → `eventRow?.expected_payment_year`
- `input[name='paymentYear']` → `input[name='expectedPaymentYear']`
- Test description updated from `payment_year` → `expectedPaymentYear`

### `tests/e2e/pdf-ai-pipeline.spec.ts`
- `extractedPaymentDate` → `extractedPaymentYear` + `extractedPaymentMonth`

### `tests/e2e/notification-approval.spec.ts`
- Three `extractedPaymentDate` references → `extractedPaymentYear` + `extractedPaymentMonth`

### `tests/integration/admin/review-edge-functions.test.ts`
- `override: { paymentYear: YEAR }` → `override: { expectedPaymentYear: YEAR }` (two occurrences)
- Expected response key `paymentYear` → `expectedPaymentYear`
- `.select("review_status, payment_year, ...")` → `.select("review_status, expected_payment_year, ...")`

### `tests/integration/admin/phase-05-approval-pipeline.test.ts`
- Updated file header comments
- All `extracted_payment_date: '...'` insert overrides → `extracted_payment_year: YEAR`
- All `paymentYear` override keys → `expectedPaymentYear`
- All `payment_year` column references in `.select()` and assertions → `expected_payment_year`
- Test descriptions updated to remove references to old `payment_year`/`expected_payment_date` concepts
- `expectedPaymentDate` in override → `expectedPaymentYear` + `expectedPaymentMonth`

## Additional Follow-Up on 2026-05-13

After resuming the work, another stale-reference scan found a few remaining old helper/override names in integration and E2E tests. The following files were updated:

- `tests/e2e/user-safety-isolation.spec.ts`
  - `extractedPaymentDate` → `extractedPaymentYear` + `extractedPaymentMonth`
- `tests/integration/stocks/stock-detail.test.ts`
  - `expectedPaymentDate` helper arg removed; added `expectedPaymentYear`
  - removed unused `isoDate` import
- `tests/integration/calendar/month-detail.test.ts`
  - `expectedPaymentDate` helper arg removed; added `expectedPaymentYear`
  - updated comment from exact payment date to year/month timing
  - removed unused `isoDate` import
- `tests/integration/admin/admin-review-pipeline.test.ts`
  - `p_override.paymentYear` → `p_override.expectedPaymentYear`
- `tests/integration/admin/pdf-ai-contracts.test.ts`
  - `paymentYear` fixture fields → `expectedPaymentYear`
- `tests/integration/portfolio/holdings-crud.test.ts`
  - test descriptions now refer to `expected_payment_year`

Follow-up verification:

| Command | Status |
|---|---|
| `rg -n --pcre2 "\\bpaymentYear\\b|\\bexpectedPaymentDate\\b|\\bextractedPaymentDate\\b|(?<!expected_)\\bpayment_year\\b|\\bexpected_payment_date\\b|\\bextracted_payment_date\\b" tests src/types --glob '!node_modules'` | PASS (no matches) |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run test:unit` | PASS (46 files, 637 tests) |

## Notes

- `npm run test:unit` covers all `src/**/*.test.ts` files. No unit test references old columns.
- Integration tests (`tests/integration/`) and E2E tests require `RUN_REMOTE_TESTS=1` + live Supabase. TypeScript does not enforce Supabase `.select()` string literals, so these files don't surface TS errors. All have been updated to use new schema field names.
