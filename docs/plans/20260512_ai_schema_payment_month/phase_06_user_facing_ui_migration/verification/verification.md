# Phase 06 Verification Evidence

## Phase Info
- Phase file: `docs/plans/20260512_ai_schema_payment_month/phase_06_user_facing_ui_migration/plan.md`
- Verification date: 2026-05-12
- Environment: Local development, Node v20.15.1

## Changes Made
- Added `formatPaymentYearMonth(year, month)` in `src/lib/formatting/date.ts`.
  - `year + month` renders as `YYYY年M月`.
  - `month` only renders as `M月予定`.
  - missing values render as `未定`.
- Updated stock detail schedule UI to use the shared formatter.
- Updated dividend query test wording/mock data so user-facing next-dividend examples no longer use day-level payment dates.
- Added formatter unit tests for full year/month, month-only, and unknown payment timing.

## Verification Results

### Automated Checks
| Command | Status |
|---|---|
| `npm install` | PASS; installed worktree dependencies. Engine warnings are from the existing Node v20.15.1 vs package peer ranges. |
| `npm install --no-save @rolldown/binding-linux-x64-gnu@1.0.0-rc.17` | PASS; installed missing optional Vitest/Rolldown native binding without changing package files. |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npx vitest run --reporter=verbose src/lib/formatting/date.test.ts src/features/dividends/queries.test.ts src/features/dividends/user-safety.test.ts` | PASS (39 passed) |
| `npm run build` | PASS |
| `npm run test:unit` | PASS (46 files, 637 tests) |

### Manual/Static Verification
- `rg -n "expected_payment_date|expectedPaymentDate|payment_year|paymentYear|YYYY年MM月DD日" src/app/app src/components src/features/dividends src/features/holdings src/features/stocks src/features/notifications src/lib/formatting` was reviewed.
- Remaining matches are `expected_payment_year` strings, which are the new schema field and expected.
- Home and calendar UI consume `displayDateText` / month summaries from the Phase 05 RPC contract; no direct day-level payment-date UI logic remains there.
- Portfolio UI computes annual amounts from `expected_payment_year`.
- Stock detail UI now formats schedule timing through `formatPaymentYearMonth`.

### Skipped Checks
- Browser manual verification of `/app/home`, `/app/calendar`, `/app/portfolio`, and `/app/stocks/[id]` was skipped because a seeded local Supabase instance is not running. `npm run build`, the query/UI contract tests, and static stale-reference checks passed.

## Conclusion
Phase 06 User-Facing UI Migration is complete. User-facing UI code no longer uses `expected_payment_date` or day-level payment date display logic, and build/test verification passed.
