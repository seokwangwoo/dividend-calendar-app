# Phase 03: PDF Download and Job Runner

## Goal

Add reliable asynchronous job processing and PDF download/storage so accepted disclosures have private source documents ready for AI parsing.

## Prerequisites

- Phase 02 Completion Criteria are met.
- The private `disclosures` Storage bucket exists.
- Accepted disclosures contain `document_url`, `external_id`, `published_at`, and a matched stock/ticker when available.

## Implementation Scope

- Implement a central `process-jobs` Edge Function that claims runnable jobs and dispatches supported job handlers.
- Add only the `download_disclosure_pdf` handler in this phase; later phases add parse, approval, and notification handlers to the same runner.
- Download PDFs, validate response and file type, store files in Supabase Storage, update disclosure status, and enqueue the dependent `parse_disclosure_pdf_ai` job only after successful storage.
- Implement retry and final-failure behavior for download jobs.
- Keep PDF access private and avoid exposing raw Storage paths to regular users.

## Core Tasks

1. **Central `process-jobs` runner contract**
   - Implement `supabase/functions/process-jobs` as the only MVP job dispatcher.
   - Implement a safe job claim pattern for `status = 'pending'` and `run_after <= now()`.
   - Mark claimed jobs as `processing` before work starts, then transition to `completed`, `pending`, or `failed`.
   - Increment attempts on each execution attempt and stop after `max_attempts`.
   - Record `last_error` on job failure and compute `run_after` backoff for retryable failures.
   - Ensure repeated runner invocations do not process the same job concurrently where database primitives allow.
   - Keep `batch_size` configurable from request body or environment to fit Edge Function time limits.

2. **`download_disclosure_pdf` handler**
   - Read `disclosure_id` and `document_url` from the claimed job payload; direct request-body execution is only for local/manual debugging if implemented. Jobs with missing `document_url` should be treated as invalid enqueue state because Phase 02 should have marked those disclosures skipped/high without a job.
   - Fetch the PDF from TDnet using a server-side Edge Function.
   - Verify HTTP success, non-empty body, and PDF content type or PDF file signature.
   - Reject non-PDF responses with structured errors.

3. **Storage path and upload**
   - Store files under `disclosures/{ticker}/{published_date}/{external_id}.pdf`.
   - Use `unknown` or an explicit unmatched-stock segment only when a relevant disclosure has no stock match and the plan allows retaining it.
   - Make upload idempotent for the same disclosure and external ID.
   - Update `disclosures.storage_path` and set `parse_status = 'downloaded'` after successful upload.
   - Idempotently enqueue one `parse_disclosure_pdf_ai` job after successful upload for disclosures whose type/priority requires AI parsing.

4. **Error handling**
   - On transient download failure, reschedule the job with backoff until `max_attempts`.
   - On final failure, set job status to `failed`, set `disclosures.parse_status = 'failed'`, and store the error in both job and disclosure fields.
   - Ensure PDF download failure never creates a `dividend_review` or dependent parse job.

5. **Scheduling integration**
   - Add or extend GitHub Actions/manual operation to invoke `process-jobs` after collection.
   - Allow repeated scheduled invocations so download retries can run after backoff.
   - Keep job-runner batch sizes configurable to control Edge Function execution time.

6. **Tests to add or update**
   - Unit tests for `process-jobs` status transitions, retry limits, backoff, dispatch of known job types, rejection of unsupported job types, and idempotent claim behavior where possible.
   - Edge Function tests with mocked PDF success, dependent parse-job enqueue, invalid missing-document-url job payload, non-PDF response, 404, timeout, and duplicate upload cases.
   - Storage path construction tests for ticker/date/external ID sanitization.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:unit`.
- Run `npm run test:integration` when Supabase and Storage test credentials are available.
- Manual verification:
  - Create a fixture disclosure with a test PDF URL and run `process-jobs` against a `download_disclosure_pdf` job.
  - Confirm `storage_path` is populated, the Storage object is private, and exactly one dependent `parse_disclosure_pdf_ai` job is created.
  - Simulate a non-PDF response and confirm retry/failure state is recorded.

## Completion Criteria

- Pending download jobs can be claimed and processed safely through `process-jobs`.
- Valid PDFs are stored in the private `disclosures` bucket at the specified path shape.
- Successful downloads update `disclosures.parse_status` to `downloaded` and enqueue the dependent parse job idempotently.
- Failed downloads retry up to `max_attempts` and then mark both job and disclosure as failed with useful errors.
- `process-jobs` centralizes claim/retry/failure behavior and no browser code receives service-role credentials or raw PDF bytes.

## Excluded From This Phase

- AI parsing.
- Admin signed URL viewing.
- Approval into `dividend_events`.
- Notification creation.
