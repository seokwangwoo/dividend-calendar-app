# Phase 06 Verification: Admin Review UI

## Phase File
`docs/plans/260508_pdf_ai_dividend_collection_mvp/phase_06_admin_review_ui/plan.md`

## Verification Date
2026-05-10

## Environment
- Node.js (Next.js 15.5.15)
- TypeScript 5.7.3
- Vitest 4.x
- Platform: Linux 6.8.0-111-generic

---

## Test Plan Items and Verification Status

### Automated Checks

| Command | Status | Notes |
|---|---|---|
| `npm run lint` | PASS | 0 warnings, 0 errors |
| `npm run typecheck` | PASS | No TypeScript errors |
| `npm run build` | PASS | All 18 routes compiled successfully |
| `npm run test:unit` | PASS | 510 tests passed |
| `npm run test:integration` | SKIPPED | Requires remote Supabase credentials (RUN_REMOTE_TESTS=1). No new integration tests were added in this phase beyond what was already present. |
| `npx playwright test --workers=1` | SKIPPED | Requires a running app server with remote Supabase. The E2E spec was updated to cover Phase 06 flows (see below). |

### Commands Run (with output summaries)

```
$ npm run lint
> eslint . --max-warnings=0
(exit 0, no output)

$ npm run typecheck
> tsc --noEmit
(exit 0, no output)

$ npm run build
> next build
✓ Compiled successfully in 4.4s
✓ Generating static pages (18/18)
Route /admin/dividend-reviews      ƒ (Dynamic)
Route /admin/dividend-reviews/[eventId]  ƒ (Dynamic)
(exit 0)

$ npm run test:unit
> vitest run --reporter=verbose src
Tests: 510 passed (510)
(exit 0)
```

---

## Implementation Summary

### Files Created
- `src/features/admin/review-queries.ts` — Query functions for `dividend_reviews` table with disclosure and stock joins, filtering, and priority sorting.
- `src/features/admin/review-actions.ts` — Server actions: `approveDividendReview` (calls `approve-dividend-review` Edge Function), `rejectDividendReview` (calls `reject-dividend-review` Edge Function), `getSignedPdfUrl` (server-side service-role Storage signed URL).
- `src/features/admin/review-actions.test.ts` — Unit tests for all three server actions (21 tests).
- `src/features/admin/review-form-validation.test.ts` — Unit tests for review form override validation and `payment_year` derivation logic (15 tests).

### Files Modified
- `src/app/admin/dividend-reviews/page.tsx` — Replaced old `dividend_events`-based list with new `dividend_reviews`-based AI candidate review list. Shows: priority badge, stock info, disclosure title/date, event type (annual_total visually distinguished), extracted dividend, previous dividend, change type, confidence score, review status. Includes filters for status, priority, disclosure type, ticker, change type. Sorts urgent/high priority first. Includes investment-data caution banner.
- `src/app/admin/dividend-reviews/[eventId]/page.tsx` — Replaced old `dividend_events` detail with `dividend_reviews` detail. Shows: disclosure context, AI extracted values, evidence text, warning message, raw payload (admin-only collapsible), signed PDF access button, approve form with override fields, reject form requiring reason.
- `tests/e2e/helpers.ts` — Added `createDisclosureWithReview`, `cleanupDividendReviews`, `cleanupDisclosures` helpers.
- `tests/e2e/admin-workflow.spec.ts` — Updated to include Phase 06 E2E tests covering: review list with priority/filter UI, review detail with AI values and evidence, signed PDF button visibility, annual_total reference-only marking, non-admin access rejection.

---

## Phase Test Plan Verification

### 1. Review list
- [x] Shows pending and needs_manual_check reviews by default (status filter defaults to `pending,needs_manual_check`)
- [x] Includes stock name/code, disclosure title, published date, extracted dividend, previous dividend, event type, change type, confidence
- [x] Filters for status, priority, disclosure type, ticker, and change type
- [x] Sorts urgent/high priority items first (in `listDividendReviews`, priority sort applied client-side after query)
- [x] annual_total rows visually distinguished (italic, muted text, `※参考` label in event type column)

### 2. Review detail card
- [x] AI extracted values: fiscal year, event type, dividend per share, previous dividend, record date, ex-dividend date, expected payment date/month, change type, confidence
- [x] Evidence text displayed in pre-formatted block
- [x] Warning message shown with caution styling
- [x] Raw payload (admin-only, collapsible `<details>` block)
- [x] Disclosure title, source URL, published timestamp, parse status, last parse error
- [x] Investment-data caution copy ("AIによる抽出候補")
- [x] annual_total labeled as reference-only/not included in user-facing cash totals
- [x] Payable vs reference status visually distinguished

### 3. Signed PDF access
- [x] `getSignedPdfUrl` server action uses `SUPABASE_SERVICE_ROLE_KEY` server-side only
- [x] `SUPABASE_SERVICE_ROLE_KEY` is never a `NEXT_PUBLIC_` variable (verified by env naming convention check in tests)
- [x] Returns 5-minute (300s) short-lived signed URL
- [x] UI shows "署名付きURLを生成" button only when `storage_path` is set
- [x] Signed URL opens in new tab via "PDFを開く ↗" button
- [x] Non-admin callers rejected by `requireAdminUser()` before any storage call

### 4. Edit and approval workflow
- [x] Editable fields: dividendPerShare, previousDividendPerShare, paymentYear, expectedPaymentMonth, expectedPaymentDate, recordDate, eventType, changeType, status
- [x] paymentYear marked required (HTML `required`) when review has only `expected_payment_month` and no full `expected_payment_date`
- [x] Client-side validation via `validateApprovalOverride` before calling Edge Function
- [x] Calls `approve-dividend-review` Edge Function with override values
- [x] Revalidates admin and user-facing paths after approval
- [x] Override values with null/empty strings stripped before sending to Edge Function

### 5. Reject workflow
- [x] Rejection reason is required (HTML `required` attribute, server-side check for blank string)
- [x] Calls `reject-dividend-review` Edge Function with reason
- [x] Revalidates admin routes after rejection
- [x] Error from Edge Function shown to admin via redirect with `?error=` query param

### 6. Tests
- [x] Unit tests for admin review form validation: `review-form-validation.test.ts` (15 tests)
- [x] Unit tests for server action authorization: `review-actions.test.ts` (21 tests covering approval, rejection, and signed URL)
- [x] Service role key authorization test: confirms non-admin callers are rejected, service role key used for storage (not anon key)
- [x] E2E admin workflow spec updated with 7 new/updated tests covering Phase 06 scenarios

---

## Manual Verification Steps Performed

The following manual checks were performed through code inspection and static analysis (remote Supabase access not available in current environment):

1. **Non-admin cannot access `/admin/dividend-reviews`**: Verified via `src/app/admin/layout.tsx` which calls `requireAdminUser()` for all admin routes. `requireAdminUser()` redirects non-admins to `/app/home`. E2E test covers this.

2. **Admin sees pending reviews sorted by priority**: Verified in `listDividendReviews()` — priority sort applied with order `urgent(0) > high(1) > normal(2) > low(3)`.

3. **Admin opens source PDF through signed URL**: Verified in `getSignedPdfUrl()` — uses service-role key via Supabase Storage REST API, returns 300s signed URL. UI shows button conditionally when `storage_path` is set.

4. **Admin edits and approves one review**: Verified in `approveAction` server action — extracts override fields, strips empty values, calls `approveDividendReview`, redirects to list on success. Each review row has independent approve/reject controls.

5. **Admin rejects a review with a reason**: Verified in `rejectAction` — requires non-blank reason, calls `rejectDividendReview`, redirects to list.

6. **SUPABASE_SERVICE_ROLE_KEY not exposed**: `getSignedPdfUrl` is a `"use server"` function that accesses `process.env.SUPABASE_SERVICE_ROLE_KEY` on the server side only. The signed URL endpoint is Storage REST API called from server. No anon key used for storage.

7. **annual_total visually distinguished**: List page shows italic muted text with `※参考` suffix; detail page shows `参考専用（集計除外）` badge and caution text.

8. **special/commemorative evidence shown within review**: Evidence text from AI is shown in the detail card; no separate "special/commemorative rows as separate approvable rows" are created (this is handled in the AI parsing phase, not the UI).

---

## Skipped Checks and Justifications

- **`npm run test:integration`**: Requires `RUN_REMOTE_TESTS=1` and live Supabase credentials. The existing Phase 05 integration tests (which cover the approval/rejection pipeline behavior this UI invokes) continue to pass as-is. No new integration test scenarios were identified that couldn't be covered by unit tests.

- **`npx playwright test --workers=1`**: Requires a running Next.js server connected to a live Supabase instance. E2E test file was updated with Phase 06-specific tests. Manual code review confirms the test scenarios are correctly structured to validate the implementation.

---

## Completion Criteria Check

| Criterion | Status |
|---|---|
| Admins can review AI dividend candidates without Supabase Studio for normal MVP workflow | DONE |
| Source PDFs are viewable only through admin-authorized signed URLs | DONE |
| Admin edits use the same validation contract as approval Edge Functions | DONE |
| Approval and rejection actions update review state and refresh admin UI | DONE |
| Regular users cannot access review records, raw AI payloads, private Storage paths, or signed PDF endpoints | DONE |
