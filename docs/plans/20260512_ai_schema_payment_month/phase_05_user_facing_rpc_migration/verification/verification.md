# Phase 05 Verification Evidence

## Phase Info
- Phase file: `docs/plans/20260512_ai_schema_payment_month/phase_05_user_facing_rpc_migration/plan.md`
- Verification date: 2026-05-12
- Environment: Local development, Node v20.15.1

## Changes Made
- **New migration**: `supabase/migrations/20260513040000_ai_schema_payment_month_phase_05.sql`
  - Recreated `get_home_summary` using `expected_payment_year` instead of `payment_year`
  - Removed `expected_payment_date` references; next dividend logic uses year/month comparison
  - Display text now uses `expected_payment_year || '年' || expected_payment_month || '月'` or `expected_payment_month || '月予定'`
  - Recreated `get_dividend_calendar` using `expected_payment_year` and `expected_payment_month`
  - Recreated `get_dividend_month_detail` with same schema changes
  - Recreated `get_stock_detail` returning `expectedPaymentYear` instead of `expectedPaymentDate`
  - Recreated `get_portfolio_summary` filtering by `expected_payment_year`
- `src/features/holdings/queries.ts`:
  - `HoldingWithStock.dividend_events` type: `payment_year` → `expected_payment_year`
  - Select queries updated to fetch `expected_payment_year`
- `src/features/holdings/components/portfolio-client.tsx`:
  - `getApprovedAnnualDividendPerShare` filter: `event.payment_year` → `event.expected_payment_year`
- `src/features/holdings/queries.test.ts`:
  - Updated select string expectations
  - Updated test description
- `src/features/dividends/types.ts`:
  - `StockDetailScheduleEvent.expectedPaymentDate` → `expectedPaymentYear`
- `src/app/app/stocks/[stockId]/page.tsx`:
  - Dividend schedule display now uses `expectedPaymentYear` and `expectedPaymentMonth`
- `src/features/dividends/user-safety.test.ts`:
  - Updated mock data and assertions to use `expectedPaymentYear`

## Verification Results

### Automated Checks
| Command | Status |
|---|---|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS after rerun |
| `npm run build` | PASS |
| `npx vitest run --reporter=verbose src/features/dividends/queries.test.ts src/features/holdings/queries.test.ts src/features/dividends/user-safety.test.ts` | PASS (49 passed) |
| `npm run test:unit` | FAIL (624 passed, 8 pre-existing failures unrelated to this phase) |

Notes:
- A concurrent `npm run typecheck` + `npm run build` attempt produced transient `TS6053` errors for missing `.next/types/...` files while Next was regenerating build artifacts. Running `npm run typecheck` again after build completed passed.
- `npm run test:unit` includes unrelated existing mock/localization failures in `src/features/holdings/actions.test.ts`, `src/features/notifications/actions.test.ts`, and `src/features/stocks/queries.test.ts`. The phase-relevant dividend and holdings query tests pass in the targeted Vitest command above.

### Relevant Tests Passing
- `src/features/dividends/queries.test.ts` — 17 passed
- `src/features/holdings/queries.test.ts` — 16 passed
- `src/features/dividends/user-safety.test.ts` — 16 passed

### Manual/Static Verification
- `rg -n "expectedPaymentDate|paymentYear|payment_year|expected_payment_date" src/features/dividends src/features/holdings src/features/stocks src/features/notifications src/app/app supabase/functions/evaluate-notification-rules supabase/migrations/20260513040000_ai_schema_payment_month_phase_05.sql` returns no stale user-facing code references. Only explanatory comments in the phase migration mention deprecated names.
- `rg -n "payment_year|expected_payment_date" supabase/migrations/20260513040000_ai_schema_payment_month_phase_05.sql` confirms the new phase migration uses `expected_payment_year/month`; deprecated names appear only in header comments.
- `evaluate_notification_rules` does not use payment date/year fields; no payload migration was needed for that function.

### Skipped Checks
- `npx supabase db push` — not run. The repository is linked for Supabase use, and the phase-executor rules prohibit remote Supabase changes without explicit user approval. Local Supabase is not running in this worktree.
- Supabase Studio에서 RPC 직접 호출 — skipped because local Supabase is not running.
- 로컬 dev 서버 수동 검증 — skipped. `npm run build`, targeted query tests, and static reference checks verified the server-side data-fetching contract for this phase.

### Pre-existing Failures (not caused by this phase)
- `src/features/holdings/actions.test.ts` — 2 failures (mock setup issues)
- `src/features/notifications/actions.test.ts` — 3 failures (`.single is not a function` mock issue)
- `src/features/stocks/queries.test.ts` — 3 failures (`.in is not a function` mock issue)

## Conclusion
Phase 05 User-Facing RPC Migration implementation is complete. All lint, typecheck, and build checks pass. Relevant unit tests pass. Pre-existing test failures are unrelated to schema migration.
