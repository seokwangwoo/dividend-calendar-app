# Phase 03 Verification

Phase file: `docs/plans/260508_pdf_ai_dividend_collection_mvp/phase_03_pdf_download_and_job_runner/plan.md`

Verification date: 2026-05-10

Environment:

- Workspace: `/home/seo/OneDrive/linux/projects/dividend-calendar-app`
- Node/npm project with installed dependencies in `node_modules`
- Local Supabase stack was started for manual Edge Function verification and stopped afterward.
- Remote Supabase integration tests were run with network escalation after sandbox DNS failed.

## Test Plan Status

| Test-plan item | Status | Evidence |
|---|---:|---|
| `npm run lint` | PASS | ESLint completed with `--max-warnings=0`. |
| `npm run typecheck` | PASS | `tsc --noEmit` completed successfully. |
| `npm run build` | PASS | Next.js production build completed successfully. |
| `npm run test:unit` | PASS | 38 files, 362 tests passed. Includes new runner/download tests. |
| `npm run test:integration` when Supabase and Storage credentials are available | FAIL, unrelated existing integration | Sandboxed run failed DNS to Supabase. Escalated remote run reached Supabase: 10 files / 70 tests passed, 1 existing notification integration test failed (`tests/integration/notifications/notifications-settings.test.ts`, expected notification rule `matched: 1`, received `matched: 0`). Rerun reproduced the same failure. This test is outside phase 03 and does not exercise `process-jobs` or PDF download. |
| Manual: create fixture disclosure with test PDF URL and run `process-jobs` | PASS | Local Supabase + Edge runtime invocation processed one `download_disclosure_pdf` job. Job completed with `attempts = 1`. |
| Manual: confirm `storage_path`, private Storage object, exactly one dependent parse job | PASS | Local disclosure updated to `storage_path = disclosures/9433/2026-05-10/<external_id>.pdf`, `parse_status = downloaded`, `last_parse_error = null`; Storage bucket `disclosures` returned `public = false`; exactly one `parse_disclosure_pdf_ai` job existed for the disclosure. A second `process-jobs` invocation claimed 0 jobs and left the parse job pending for Phase 04. |
| Manual: simulate non-PDF response and confirm retry/failure state | PASS | Local non-PDF fixture with `max_attempts = 1` produced failed download job with `last_error = download_failed:non_pdf_response`; disclosure updated to `parse_status = failed`, `storage_path = null`, and same `last_parse_error`. |

## Commands

```bash
npm run lint
```

Result: PASS.

```bash
npm run typecheck
```

Result: PASS.

```bash
npm run build
```

Result: PASS. Next.js compiled, generated static pages, and completed production build.

```bash
npm run test:unit
```

Result: PASS. Summary: 38 test files, 362 tests passed.

New focused coverage:

- Runner claim/complete/retry/final-failure transitions.
- Idempotent skipped claim when another runner already claimed a job.
- Unsupported type rejection in shared runner.
- PDF storage path sanitization.
- PDF content type/signature validation.
- Successful `download_disclosure_pdf` flow with mocked PDF upload, disclosure update, and one parse-job enqueue.
- Duplicate upload using existing storage path.
- Missing document URL invalid enqueue state.
- Non-PDF response final failure.
- 404 final failure and 503 retryable failure.

```bash
npm run test:integration
```

Result: FAIL in sandbox due network DNS:

- `getaddrinfo EAI_AGAIN zmsakrezapoxbugnphix.supabase.co`

Rerun with network escalation:

```bash
npm run test:integration
```

Result: FAIL, existing non-phase notification test:

- 10 integration files passed.
- 70 tests passed.
- 1 test failed: `tests/integration/notifications/notifications-settings.test.ts > notification rules, notifications, and settings > runs evaluation, creates an in-app notification, excludes disabled rules, and blocks duplicates`.
- Failure summary: expected `{ evaluated: 1, matched: 1, inserted: 1, deduplicated: 0 }`, received `{ evaluated: 1, matched: 0, inserted: 0, deduplicated: 0 }`.

Rerun attempt with the notification path argument still executed the integration suite because the package script already includes `tests/integration`; the same notification failure reproduced.

```bash
./node_modules/.bin/supabase start
./node_modules/.bin/supabase functions serve process-jobs --no-verify-jwt
node -e "<create local fixture disclosures/jobs, invoke process-jobs, inspect jobs/disclosures/storage>"
./node_modules/.bin/supabase stop
```

Result: PASS for manual phase verification.

Important local output summary:

- `bucketPublic: false`
- Successful PDF invoke: HTTP 200, `claimed = 1`, `completed = 1`, `failed = 0`
- Successful disclosure: `parse_status = downloaded`, `storage_path = disclosures/9433/2026-05-10/phase03-manual-...-ok.pdf`, `last_parse_error = null`
- Successful jobs: one completed `download_disclosure_pdf`; one pending `parse_disclosure_pdf_ai`
- Second invoke after success: HTTP 200, `claimed = 0`; parse job remained pending and was not failed before Phase 04
- Non-PDF invoke: HTTP 200, `claimed = 1`, `failed = 1`, error `download_failed:non_pdf_response`
- Non-PDF disclosure: `parse_status = failed`, `storage_path = null`, `last_parse_error = download_failed:non_pdf_response`

## Notes

- The real Edge Function claims only Phase 03 supported job type `download_disclosure_pdf`. This preserves newly enqueued `parse_disclosure_pdf_ai` jobs as pending until Phase 04 adds the parse handler.
- The shared runner still has unsupported-type behavior covered by unit tests, but the Phase 03 Edge adapter does not claim future job types prematurely.
- No browser code receives service-role credentials, raw PDF bytes, or private Storage paths.
