# Phase 06 Verification

- Phase file: `docs/plans/260505_mvp_1st_dev/phase_06_admin_review_and_data_pipeline/plan.md`
- Verification date: 2026-05-06
- Environment: local Next.js/Node workspace with `.env.local`; remote Supabase integration tests and DB lint run with network access.

## Test Plan Status

| Test-plan item | Status | Evidence |
| --- | --- | --- |
| Non-admin cannot approve review. | PASS | `tests/integration/admin/admin-review-pipeline.test.ts` signs in a normal user and verifies `approve_dividend_review` is rejected. |
| Admin can approve pending review. | PASS | Same test promotes a test profile to admin and invokes `approve_dividend_review` successfully. |
| Approving review creates approved dividend event. | PASS | Integration test verifies the created `dividend_events` row has `review_status = approved`, expected amount, and derived `change_type`. |
| Approving review updates review metadata. | PASS | Integration test verifies `dividend_reviews.status`, `reviewed_by`, `reviewed_at`, and `created_dividend_event_id`. |
| Rejecting review does not create dividend event. | PASS | Integration test invokes `reject_dividend_review`, confirms rejected metadata, and confirms no user-facing stock detail entry for the rejected amount. |
| Pending and rejected reviews are not visible as user-facing approved dividend data. | PASS | Existing stock detail/home/calendar tests continue to use approved events only; phase6 rejection test verifies rejected review data is absent from stock detail. |
| Approved increase creates dividend increase notifications for users holding the stock. | PASS | Phase6 integration test approves an increased dividend and verifies a `dividend_increase` notification for the holding user. |
| Approved decrease creates dividend decrease notifications. | PASS | Phase6 integration test approves a decreased dividend and verifies a `dividend_decrease` notification. |
| `未定` is not stored as zero. | PASS | Phase6 integration test verifies unknown dividend amounts are rejected unless explicitly marked `undecided`; a separately approved undecided review stores `dividend_events.dividend_per_share is null` and `status = 'undecided'`. |
| Duplicate disclosure collection does not create duplicate records. | PASS | Phase6 integration test calls `collect_disclosure_candidate` twice with the same `externalId` and verifies one `disclosures` row and one parser job. |

## Commands

- PASS: `npm run typecheck`
  - `tsc --noEmit` completed successfully.
- PASS: `npm run lint`
  - `eslint . --max-warnings=0` completed successfully.
- PASS: `npm run test:unit`
  - 2 files, 19 tests passed.
- PASS: `zsh -c 'set -a; . ./.env.local; set +a; npx supabase@latest db push --password "$SUPABASE_DB_PASSWORD"'`
  - Applied `20260505005000_phase_06_admin_review_pipeline.sql` to the linked Supabase project.
- PASS after fix: `npx supabase@latest db lint --linked`
  - First run found an enum cast error in `approve_dividend_review` and unused PL/pgSQL variables in collection/parser functions.
  - Applied `20260505005100_phase_06_review_function_lint_fix.sql`.
  - First audit then found the Edge Function service-role flow and explicit-undecided invariant needed tightening.
  - Applied `20260505005200_phase_06_edge_service_role_review_flow.sql`.
  - Final run returned `No schema errors found`.
- PASS: `RUN_REMOTE_TESTS=1 npx vitest run --reporter=verbose tests/integration/admin/admin-review-pipeline.test.ts`
  - 1 file, 8 phase6 tests passed, including explicit-undecided rejection and service-role review helper execution.
- PASS: `npm run build`
  - Next.js production build completed successfully.
- PASS: `npm run test:integration`
  - 10 files, 62 tests passed against the linked Supabase project.
- PASS: `rg -n "買いシグナル|売りシグナル|今すぐ買い|今すぐ売り|必ず上がる|確実に儲かる" src supabase tests .env.example`
  - No forbidden wording in implementation or tests.
- BLOCKED: `deno --version`
  - `deno` is not installed in this workspace, so Edge Function TypeScript was not typechecked with Deno tooling.
  - Edge Functions are thin wrappers around remote-verified RPCs. Local `supabase functions serve` was previously blocked by Docker socket requirements and was not retried with broader privileges in this phase.

## Failures And Fixes

- `npx supabase@latest db lint --linked` initially reported a PL/pgSQL enum type mismatch for notification `status`/`channel`. Fixed by explicitly casting to `public.notification_status` and `public.notification_channel`.
- DB lint also reported unused variables in collection/parser functions. Fixed by replacing assigned variables with `perform public.assert_admin()`.
- Because `20260505005000_phase_06_admin_review_pipeline.sql` had already been pushed before lint feedback, `20260505005100_phase_06_review_function_lint_fix.sql` was added and pushed to replace the affected functions on the linked project.
- First phase audit failed because null dividend amounts were implicitly treated as `undecided`, and approve/reject Edge Functions did not use the service-role mutation flow described in the phase. Fixed by requiring explicit `raw_payload.eventStatus = 'undecided'` for null dividends and adding service-role-only reviewer helpers used by the Edge Function wrappers.

## Manual Review

- Confirmed `disclosures`, `dividend_reviews`, and `jobs` tables, indexes, RLS, grants, and a private `disclosures` storage bucket are defined.
- Confirmed admin-only RPCs back the approve/reject/collect/parse workflows and reject non-admin callers through `public.assert_admin()`.
- Confirmed Edge Function files exist for `approve-dividend-review`, `reject-dividend-review`, `collect-disclosures`, and `parse-disclosure`; approve/reject verify JWT/admin status and then invoke service-role reviewer helpers, while collect/parse delegate to admin-guarded RPCs.
- Confirmed admin placeholder pages now document the Supabase Studio operating flow without adding a full custom admin dashboard.
- Confirmed no Web Push, paid TDnet API integration, high-accuracy production parser, LLM parsing, or custom admin dashboard was added.
