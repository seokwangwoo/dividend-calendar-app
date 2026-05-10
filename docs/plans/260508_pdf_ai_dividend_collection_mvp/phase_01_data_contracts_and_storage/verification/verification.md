# Phase 01 Verification

- Phase file: `docs/plans/260508_pdf_ai_dividend_collection_mvp/phase_01_data_contracts_and_storage/plan.md`
- Plan root: `docs/plans/260508_pdf_ai_dividend_collection_mvp`
- Verification date: 2026-05-10
- Environment: local workspace `/home/seo/OneDrive/linux/projects/dividend-calendar-app`, linked Supabase project from `.env.local`

## Test Plan Status

| Test-plan item | Status | Evidence |
|---|---:|---|
| `npm run lint` | PASS | ESLint exited 0. |
| `npm run typecheck` | PASS | `tsc --noEmit` exited 0 after updating review/change/event type consumers. |
| `npm run build` | PASS | Next.js production build completed successfully; 18 app routes generated/analyzed. |
| `npm run test:unit` | PASS | 36 test files, 331 tests passed. Added/updated enum/formatter coverage. |
| `npm run test:integration` | PASS | Required network escalation for Supabase. Final run: 11 test files, 71 tests passed. |
| Database contract integration fixtures | PASS | `tests/integration/admin/pdf-ai-contracts.test.ts` verifies new disclosure/review/job/event fields, private bucket, admin-only RLS, and non-payable event exclusion. |
| Manual: disclosures bucket private | PASS | `storage.getBucket("disclosures")` returned `public = false` in integration test. |
| Manual: admin can inspect rows | PASS | Integration test inserted and selected `disclosures`, `dividend_reviews`, and `jobs` through the service/admin client. Supabase Studio uses the same admin/service-role visibility model for this MVP fallback. |
| Manual: regular user cannot read admin-only rows | PASS | Integration test inserted disclosure/review/job rows and confirmed a regular authenticated client receives empty result sets. |

## Commands Run

```bash
npm run lint
```

Result: PASS.

```bash
npm run typecheck
```

Initial result: FAIL because `formatReviewStatus` did not handle `needs_manual_check`.
Final result: PASS.

```bash
npm run test:unit
```

Result: PASS. Summary: 36 passed, 331 tests passed.

```bash
npm run build
```

Result: PASS. Summary: Next.js compiled successfully and generated/analyzed 18 routes.

```bash
zsh -c 'set -a; . ./.env.local; set +a; npx supabase@latest db push --password "$SUPABASE_DB_PASSWORD"'
```

Result: PASS. Applied `20260508001000_pdf_ai_phase_01_data_contracts.sql` to the linked Supabase project. Supabase reported the disclosure storage-object deny policy did not previously exist, then completed the push.

```bash
npx supabase@latest db lint --linked
```

Result: FAIL, not caused by this phase. Supabase lint reported pre-existing function issue in `public.mark_notification_email_delivered`: it updates `notifications.updated_at`, but the `notifications` table has no `updated_at` column. This is outside phase 01 data-contract scope and was not changed here.

```bash
npm run test:integration
```

Initial sandboxed result: FAIL due DNS/network access (`getaddrinfo EAI_AGAIN` for the Supabase host). Rerun with network escalation.

```bash
npm run test:integration
```

Initial network-enabled result: FAIL, 70/71 tests passed. One existing home-summary test used the shared current year and picked up a concurrent approved global dividend event for the same stock. Fixed the test to use an isolated future payment year.

Final network-enabled result: PASS. Summary: 11 test files passed, 71 tests passed.

## Manual Verification Notes

- Confirmed the `disclosures` bucket is private via Supabase Storage API.
- Confirmed service/admin client can write and inspect phase fields on `disclosures`, `dividend_reviews`, `jobs`, and `dividend_events`.
- Confirmed regular authenticated clients cannot read `disclosures`, `dividend_reviews`, or `jobs` rows.
- Confirmed user-facing calendar aggregation excludes approved `annual_total` and `special` event rows while counting the payable `interim` row.
- Confirmed `ex_dividend_date` remains nullable/explicit-only; no migration or application logic derives it from `record_date`.

## Failures Fixed

- Updated review status formatting for `needs_manual_check`.
- Updated integration test isolation for the existing pending/rejected home-summary regression.

## Remaining Non-Blocking Issue

- `npx supabase@latest db lint --linked` still reports the pre-existing `mark_notification_email_delivered` / `notifications.updated_at` mismatch. It is unrelated to the phase 01 migration and did not block required lint/type/build/unit/integration checks.
