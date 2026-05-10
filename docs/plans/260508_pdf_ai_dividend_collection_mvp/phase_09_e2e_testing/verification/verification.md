# Phase 09 E2E Testing Verification

## Summary
All new E2E specs for the PDF + AI dividend collection MVP were created and are passing. Baseline regression tests were also run with only pre-existing failures (Supabase Auth signup rate limit) skipped.

## Test Results

### New Phase 09 Specs
| Spec | Tests | Status |
|------|-------|--------|
| `admin-review-ui.spec.ts` | 6 | ✅ 6 passed |
| `admin-approval-pipeline.spec.ts` | 7 | ✅ 7 passed |
| `notification-approval.spec.ts` | 7 | ✅ 7 passed |
| `pdf-ai-pipeline.spec.ts` | 1 | ✅ 1 passed |
| `user-safety-isolation.spec.ts` | 6 | ✅ 6 passed |
| `system-pipeline.spec.ts` | 6 | ✅ 6 passed |

**Total new tests: 33 — all passing**

### Baseline Regression Suite
| Spec | Tests | Status |
|------|-------|--------|
| `admin-workflow.spec.ts` | 9 | ✅ 9 passed |
| `mvp-critical-flows.spec.ts` | 3 | ✅ 2 passed, 1 skipped (pre-existing Supabase Auth signup rate limit) |
| `calendar.spec.ts` | 4 | ✅ 4 passed |
| `portfolio.spec.ts` | 3 | ✅ 3 passed |
| `notifications.spec.ts` | 3 | ✅ 3 passed |
| `verify-dividend-events.spec.ts` | — | ✅ part of above suite |

## Key Fixes Applied During Phase 09

1. **DB Function Drop/Recreate**
   - `20260510131911_fix_approve_overload.sql` accidentally dropped `reject_dividend_review_for_reviewer(uuid, text, uuid)`.
   - Created `20260510140000_recreate_reject_function.sql` to restore it.
   - Migration pushed to remote successfully.

2. **Edge Function Auth**
   - Discovered that `SUPABASE_SERVICE_ROLE_KEY` inside Edge Functions is a platform-managed internal key (`sb_secret_...`), different from the project's external service role key.
   - Modified `collect-disclosures` and `process-jobs` Edge Functions to accept **both** the internal key and a custom `API_SECRET`.
   - Set `API_SECRET` via `npx supabase secrets set` to match the external service role key.
   - Deployed missing `process-jobs` Edge Function to remote.

3. **Test Locator Fixes**
   - Fixed strict-mode violations (`getByText` resolving to multiple elements) in `pdf-ai-pipeline.spec.ts` and `admin-workflow.spec.ts`.
   - Fixed calendar year navigation in `pdf-ai-pipeline.spec.ts` (clicks "›" to advance to next year).
   - Updated home page assertions in `user-safety-isolation.spec.ts` to check dividend-per-share values instead of aggregate totals, avoiding interference from pre-existing seed data.

4. **Email Domain Fix**
   - Changed `uniqueEmail` helper from `@test.example.com` to `@example.com` to avoid Supabase Auth validation rejection.

5. **UI Title Update**
   - Updated `mvp-critical-flows.spec.ts` admin page assertion from "配当イベント管理" to "AI配当候補レビュー" to match Phase 05 UI changes.

## Build Verification
```
npm run lint     ✅ 0 errors, 0 warnings
npm run typecheck ✅ 0 errors
npm run build    ✅ success
```

## Migrations Added
- `20260510131911_fix_approve_overload.sql`
- `20260510140000_recreate_reject_function.sql`

## Files Changed
- `src/features/admin/review-actions.ts`
- `src/lib/supabase/server.ts`
- `tests/e2e/helpers.ts`
- `tests/e2e/admin-review-ui.spec.ts` (new)
- `tests/e2e/admin-approval-pipeline.spec.ts` (new)
- `tests/e2e/notification-approval.spec.ts` (new)
- `tests/e2e/pdf-ai-pipeline.spec.ts` (new)
- `tests/e2e/user-safety-isolation.spec.ts` (new)
- `tests/e2e/system-pipeline.spec.ts` (new)
- `tests/e2e/admin-workflow.spec.ts`
- `tests/e2e/mvp-critical-flows.spec.ts`
- `supabase/functions/collect-disclosures/index.ts`
- `supabase/functions/process-jobs/index.ts`
- `supabase/migrations/20260510131911_fix_approve_overload.sql`
- `supabase/migrations/20260510140000_recreate_reject_function.sql`
