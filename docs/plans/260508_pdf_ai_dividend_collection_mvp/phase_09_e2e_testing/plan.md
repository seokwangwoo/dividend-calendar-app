# Phase 09: E2E Testing

## Goal

Add end-to-end Playwright tests that verify the complete PDF + AI dividend collection MVP pipeline—from disclosed source document to admin review to user-facing home, calendar, and notification surfaces—while proving that unapproved AI results remain invisible to regular users.

## Prerequisites

- Phases 01–08 Completion Criteria are met.
- Existing Playwright E2E suite (`tests/e2e/`) passes on `main`.
- `tests/e2e/helpers.ts` already provides `createDisclosureWithReview`, `cleanupDividendReviews`, `cleanupDisclosures`, `createApprovedDividendEvent`, `deleteDividendEvents`, and admin/user auth helpers.
- `dividend_events` queries used by user pages filter by `review_status = 'approved'` and payable event types.

## Implementation Scope

- Extend E2E helpers to create disclosures with/without `storage_path` and reviews in any `status`/`priority`/`change_type`.
- Add focused E2E spec files for:
  1. **User isolation safety** — pending/rejected/needs-manual-check reviews and `annual_total` events must not leak to user pages.
  2. **Admin review list & detail** — filters, priority sorting, signed PDF access, raw payload visibility, and correction/high-priority badges.
  3. **Approval pipeline** — approve with/without overrides, reject with reason, idempotency, `payment_year` enforcement, and sibling review independence.
  4. **Notification integration** — eligible change types create deduplicated notifications after approval, and notification copy appears in the user’s notification list.
  5. **End-to-end pipeline flow** — a single fixture disclosure progresses from collection evidence through review to approved event and user reflection.
- Keep E2E tests deterministic by seeding review/disclosure/event rows directly via service-role helpers rather than invoking live Yanoshin/OpenAI from tests.
- Preserve existing E2E specs (mvp-critical-flows, calendar, portfolio, notifications, admin-workflow) as regression guards.

## Core Tasks

### 1. E2E helpers extension (`tests/e2e/helpers.ts`)

Add or extend helpers so specs can seed the full MVP state without live external calls:

- `createDisclosure(opts)` — insert a `disclosures` row with configurable `disclosure_type`, `parse_status`, `review_priority`, `storage_path`, and `document_url`.
- `createReview(opts)` — insert a `dividend_reviews` row linked to a disclosure and stock, with configurable `status`, `change_type`, `event_type`, `confidence_score`, `extracted_payment_date`, `extracted_payment_month`, `fiscal_year`, `payment_year`, `evidence_text`, `warning_message`, and `raw_payload`.
- `approveReviewViaApi(reviewId, overrides?)` — **helper for integration tests or setup scripts only**. In E2E specs, exercise the real approval path by having the admin user click the "承認する" button in the browser, then assert on UI state and DB side effects.
- `rejectReviewViaApi(reviewId, reason)` — **helper for integration tests or setup scripts only**. In E2E specs, use the browser reject form and button instead.
- `cleanupJobs(jobIds)` — delete created `jobs` rows after tests.
- `getNotificationsForUser(userId)` — list user notifications for assertions.

### 2. User isolation safety spec (`tests/e2e/user-safety-isolation.spec.ts`)

Verify that only approved payable events reach user surfaces, and that `annual_total` / special / commemorative / missing-ex-dividend semantics are respected.

- **Test: pending review is invisible to users**
  - Seed a `pending` review for a stock the user holds.
  - Log in as the user, visit `/app/home`, `/app/calendar`, and `/app/portfolio`.
  - Assert the review values do not appear anywhere on the page.
- **Test: rejected review is invisible to users**
  - Seed a `rejected` review.
  - Assert it does not appear on user pages.
- **Test: approved payable event appears on user surfaces**
  - Approve a review with `event_type = 'year_end'` and a confirmed `payment_year`.
  - Assert the event appears in home expected dividends, calendar, and portfolio detail.
- **Test: annual_total is excluded from cash total and payment calendar**
  - Approve a review with `event_type = 'annual_total'`.
  - Assert the event is not counted in home “올해 예상 세후 배당금” or monthly payment totals.
  - Assert it may appear in stock detail as reference-only if the UI chooses to show it.
- **Test: special/commemorative breakdown does not double-count**
  - Approve a payable review with `ordinary + special + commemorative` breakdown metadata.
  - Assert the cash total counts the parent payable event once, not once per breakdown component.
- **Test: ex-dividend calendar excludes null ex_dividend_date**
  - Approve an event with `ex_dividend_date = null`.
  - If the app has an ex-dividend calendar view, assert the event is absent from that view.

### 3. Admin review list & detail spec (`tests/e2e/admin-review-ui.spec.ts`)

Build on the existing `admin-workflow.spec.ts` with Phase 05–06 coverage.

- **Test: list shows pending and needs-manual-check by default**
  - Seed reviews in `pending`, `needs_manual_check`, `approved`, and `rejected`.
  - Log in as admin, open `/admin/dividend-reviews`.
  - Assert `pending` and `needs_manual_check` rows are visible by default.
  - Assert status filters can surface `approved`/`rejected` rows when selected.
- **Test: priority sorting and filters**
  - Seed `urgent`, `high`, `normal`, and `low` reviews.
  - Assert `urgent`/`high` items appear above `normal`/`low` in default sort.
  - Assert priority filter dropdown narrows the list correctly.
- **Test: disclosure type and ticker filters**
  - Seed reviews with `disclosure_type = 'dividend_forecast_revision'` and `'earnings_release'`.
  - Assert disclosure type filter works.
  - Assert ticker text input filters to the matching stock code.
- **Test: signed PDF button appears only when storage_path exists**
  - Already partially covered in `admin-workflow.spec.ts`; keep as regression.
  - Add a positive case: seed a disclosure with `storage_path`, open the review detail, click signed URL button, and assert a new tab/url request succeeds (or assert button opens a valid-looking URL).
- **Test: raw payload is visible to admins only**
  - Open review detail, toggle RAW payload section.
  - Assert raw JSON is rendered.
  - Log in as normal user and attempt to open the same review detail URL; assert redirect away from admin.
- **Test: correction disclosure is marked high priority**
  - Seed a disclosure with `disclosure_type = 'correction'` and a linked review.
  - Assert the list shows a correction/high-priority indicator.

### 4. Approval pipeline spec (`tests/e2e/admin-approval-pipeline.spec.ts`)

Exercise the real approval/rejection path through the **browser UI**, then verify side effects via DB helpers and user pages.

> Edge Functions are HTTP endpoints; they can technically be called directly with `fetch` from Node.js or `page.request.fetch()` in Playwright. However, E2E specs should prefer **browser-driven interaction** (button clicks and form submits) to validate the full user journey. Use direct Edge Function calls only for test-setup helpers or integration-test layers, not for E2E flow assertions.

- **Test: approve creates an approved dividend_event**
  - Seed a `pending` review with full `expected_payment_date`.
  - Admin opens detail in browser, clicks “承認する” without overrides.
  - Assert the page reflects the review as approved.
  - Query DB (via helper) and assert a matching `dividend_events` row exists with `review_status = 'approved'` and `payment_year` derived from the payment date.
- **Test: month-only review requires payment_year override before approval**
  - Seed a review with `expected_payment_month` but no `expected_payment_date`.
  - Admin attempts to submit the approval form without filling `payment_year`.
  - Assert client-side or server-side validation blocks submission and the review remains pending.
  - Admin fills `payment_year` override and submits via the browser form.
  - Assert the created event has the override `payment_year`.
- **Test: approval with override values persists correctly**
  - Seed a review, then admin edits dividend amount, record date, and status in the browser form before clicking approve.
  - Assert the created event reflects overrides, not original AI values.
- **Test: duplicate approval is idempotent**
  - Approve a review via the browser once, then attempt to approve the same review again (e.g., by refreshing and resubmitting).
  - Assert no second `dividend_event` is created for the same review.
  - Assert notification side effects do not duplicate (assert via DB helper or user notification page).
- **Test: reject prevents event creation and stores reason**
  - Admin opens a pending review in browser, fills rejection reason, and clicks “却下する”.
  - Assert the review status becomes `rejected`.
  - Assert no `dividend_event` is created for the review.
- **Test: approving one review from a multi-event disclosure leaves siblings untouched**
  - Seed a disclosure with two `pending` reviews (e.g., `interim` and `year_end`).
  - Admin approves the `interim` review via browser.
  - Assert the `year_end` review remains `pending`.
  - Assert only one `dividend_event` was created.
- **Test: annual_total approval creates reference-only event**
  - Admin approves an `annual_total` review via browser.
  - Assert the event row exists but user-facing cash totals do not include it.

### 5. Notification integration spec (`tests/e2e/notification-approval.spec.ts`)

Link approval actions to user notification surfaces.

- **Test: increase approval creates dividend_increase notification**
  - Create a user holding the stock.
  - Seed and approve a review with `change_type = 'increase'`.
  - Log in as the user, visit `/app/notifications`.
  - Assert a `dividend_increase` notification is visible with previous/new amounts and disclaimer copy.
- **Test: decrease approval creates dividend_decrease notification**
  - Similar to above for `change_type = 'decrease'`.
- **Test: no_dividend approval creates no_dividend notification**
  - Similar for `change_type = 'no_dividend'`.
- **Test: special/commemorative approval creates special_dividend notification**
  - Approve a payable review with `change_type = 'special'` or `'commemorative'` and breakdown metadata.
  - Assert notification uses the breakdown amount and references the parent event.
- **Test: unchanged approval does not create notification**
  - Approve a review with `change_type = 'unchanged'`.
  - Assert the user’s notification list does not gain a new dividend-change notification.
- **Test: duplicate approval does not duplicate notifications**
  - Approve a review once, then trigger approval again.
  - Assert the notification count for the user did not increase.
- **Test: rejected review does not create notification**
  - Reject a review with `change_type = 'increase'`.
  - Assert no notification is created.

### 6. End-to-end pipeline flow spec (`tests/e2e/pdf-ai-pipeline.spec.ts`)

A narrative E2E test that simulates the full MVP lifecycle using seeded fixtures.

- **Test: full pipeline from disclosure to user reflection**
  1. Seed a disclosure with `storage_path` (simulating Phase 02–03 completion).
  2. Seed two sibling reviews: `year_end` (payable) and `annual_total` (reference).
  3. Admin opens `/admin/dividend-reviews`, sees both pending.
  4. Admin opens the `year_end` review, verifies evidence, PDF button, and breakdown fields.
  5. Admin approves the `year_end` review.
  6. Normal user (holding the stock) logs in.
  7. User sees the approved dividend in home, calendar, and portfolio.
  8. User sees a dividend-change notification.
  9. Admin opens the `annual_total` review and approves it.
  10. Assert the `annual_total` event exists in DB but does not affect user cash totals.
  11. Admin rejects a low-confidence correction review.
  12. Assert the rejected review never appears to the user.

### 7. System pipeline spec (`tests/e2e/system-pipeline.spec.ts`)

Use Playwright `request.post()` to invoke Edge Functions directly and assert that resulting DB state is reflected in the Admin UI.

> Rationale: `collect-disclosures` and `process-jobs` are system-level Edge Functions with no user-facing trigger UI in MVP. E2E still needs to verify the full HTTP contract → DB → UI reflection path. Playwright's `request.post()` lets us call the real endpoints without building a test-only UI.

**Required helpers**
- `invokeCollectDisclosures(candidate: object)` — `request.post()` to `${baseUrl}/functions/v1/collect-disclosures` with the service-role header (or `anon` key if the function is public). Returns response JSON.
- `invokeProcessJobs()` — `request.post()` to `${baseUrl}/functions/v1/process-jobs`.
- `getJobById(jobId)` — service-role DB helper to inspect `jobs` row.

**Test: fixture candidate via collect-disclosures creates disclosure + download job**
- POST `collect-disclosures` with a normalized fixture candidate containing a dividend keyword title and a valid `document_url`.
- Assert response indicates success (`inserted: true`).
- Visit `/admin/disclosures` as admin.
- Assert the diagnostics card reflects the new state (e.g., `parse_status` counts changed, or disclosure appears in the implied collection flow).
- Query DB via helper: assert exactly one `disclosures` row exists for the `external_id`.
- Assert exactly one `download_disclosure_pdf` `jobs` row exists linked to that disclosure.

**Test: collect-disclosures is idempotent for duplicate candidates**
- POST the same fixture candidate a second time.
- Assert response indicates no new insert (`inserted: false`).
- Query DB: assert still exactly one disclosure and one job for that `external_id`.

**Test: process-jobs completes a download job and enqueues a parse job**
- Seed a `disclosures` row with a real/fake `document_url` (pointing to a fixture PDF or a mock server endpoint).
- Insert a `download_disclosure_pdf` job for that disclosure.
- POST `process-jobs`.
- Query DB via helper: assert the job status is `completed`, `attempts = 1`, `last_error = null`.
- Assert `disclosures.parse_status = 'downloaded'` and `storage_path` is populated.
- Assert exactly one `parse_disclosure_pdf_ai` job exists for the same disclosure.
- Visit `/admin/dividend-reviews` and assert the disclosure's parse status is reflected (if shown in list columns).

**Test: process-jobs retries transient failures with backoff**
- Seed a `download_disclosure_pdf` job with `attempts = 1` and `max_attempts = 3`.
- Configure the fixture so the `document_url` returns HTTP 503 (use a mock server URL or intercept at the edge function level if possible; otherwise seed `last_error` and simulate via a failing mock injected at the unit-test boundary, and skip this test if no mock infrastructure is available in E2E).
- POST `process-jobs`.
- Query DB: assert job status is `pending`, `attempts = 2`, `run_after` is in the future.
- Assert `disclosures.parse_status` remains `pending` (not `failed` yet).

**Test: process-jobs final-failure marks job and disclosure as failed**
- Seed a `download_disclosure_pdf` job with `attempts = 2` and `max_attempts = 3`.
- Use a `document_url` that returns HTTP 404 (non-retryable) or let the final attempt exhaust.
- POST `process-jobs`.
- Query DB: assert job status is `failed`, `attempts = 3`, `last_error` contains failure code.
- Assert `disclosures.parse_status = 'failed'` and `last_parse_error` is populated.
- Visit `/admin/disclosures` and assert the parse-error diagnostic count reflects the failure.

**Test: missing-document-url disclosure is skipped, no job created**
- POST `collect-disclosures` with a candidate that has no `document_url`.
- Assert the disclosure is stored with `parse_status = 'skipped'` and `review_priority = 'high'`.
- Assert no `download_disclosure_pdf` job was created.

### 8. Regression protection

- Run the full existing E2E suite and confirm no regressions:
  - `mvp-critical-flows.spec.ts`
  - `admin-workflow.spec.ts`
  - `calendar.spec.ts`
  - `notifications.spec.ts`
  - `portfolio.spec.ts`
  - `verify-*.spec.ts` files
- If any existing admin or calendar selectors changed during Phase 06, update selectors in existing specs rather than weakening assertions.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:e2e` or `npx playwright test --workers=1`.
- Manual verification:
  - Run the full E2E suite locally against a fresh Supabase project seed.
  - Confirm non-admin users cannot access `/admin/dividend-reviews` or review detail URLs.
  - Confirm approved events appear on user pages within the same browser session (no caching regressions).

## Completion Criteria

- New E2E specs cover:
  - User isolation of pending/rejected/needs-manual-check reviews.
  - `annual_total` exclusion from cash total/payment-calendar aggregation.
  - Special/commemorative non-double-counting behavior.
  - Admin review list filters, priority sorting, and detail rendering.
  - Signed PDF access availability tied to `storage_path`.
  - Approval with/without overrides, required `payment_year` validation, and idempotency.
  - Rejection with reason and absence of user-facing side effects.
  - Multi-event disclosure sibling independence.
  - Notification creation for eligible change types and deduplication.
  - Rejection does not create notifications.
- Existing E2E specs continue to pass without loosening assertions.
- E2E helpers support seeding disclosures, reviews, and cleanup of related jobs/rows.

## Excluded From This Phase

- Live Yanoshin API calls from E2E tests.
- Live OpenAI API calls from E2E tests.
- Direct PDF download or Storage upload tests (covered in Phase 03 unit/integration tests).
- Load/performance tests.
- Cross-browser matrix beyond the project’s existing Playwright config.
