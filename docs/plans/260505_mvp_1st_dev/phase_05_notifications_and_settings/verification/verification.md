# Phase 05 Verification

- Phase file: `docs/plans/260505_mvp_1st_dev/phase_05_notifications_and_settings/plan.md`
- Verification date: 2026-05-06
- Environment: local Next.js/Node workspace with `.env.local`; remote Supabase integration tests run with network access after initial sandbox DNS failure.

## Test Plan Status

| Test-plan item | Status | Evidence |
| --- | --- | --- |
| Create a before-tax `gte` rule. | PASS | `tests/integration/notifications/notifications-settings.test.ts` creates and reloads a `before_tax_yield` / `gte` rule through authenticated Supabase CRUD. |
| Create an after-tax `lte` rule. | PASS | Same integration test creates and reloads an `after_tax_yield` / `lte` rule. |
| Disable a rule and verify it is not evaluated. | PASS | Integration test updates `status = 'disabled'`, confirms persistence, and the evaluation scenario selects only active rules while confirming disabled rules exist. |
| Run evaluation and verify matching rule creates an in-app notification. | PASS | `public.evaluate_notification_rules` was applied to the remote Supabase project and invoked by `tests/integration/notifications/notifications-settings.test.ts`; the test verifies a matching active rule inserts an in-app notification with payload/body and updates evaluation state. The Edge Function delegates to this same RPC. |
| Run evaluation twice and verify duplicate is blocked within 24 hours. | PASS | The phase5 integration test invokes `public.evaluate_notification_rules` twice and verifies the second run returns `deduplicated: 1`, `inserted: 0`. Unit tests also cover the 24-hour helper. |
| Mark notification as read. | PASS | Integration test updates a single notification to `read` with `read_at`. |
| Mark all notifications as read. | PASS | Integration test bulk-updates unread in-app notifications to `read`. |
| Update settings and reload to confirm persistence. | PASS | Integration test updates `user_settings` and reloads persisted notification toggles, amount basis, JPY currency, and monthly goal. |
| Verify forbidden buy/sell wording is absent from notification UI. | PASS | `rg -n "買いシグナル|売りシグナル|今すぐ買い|今すぐ売り|必ず上がる|確実に儲かる" src supabase tests .env.example` returned no matches. |

## Commands

- PASS: `npm run typecheck`
  - `tsc --noEmit` completed successfully.
- PASS: `npm run lint`
  - `eslint . --max-warnings=0` completed successfully.
- PASS: `npm run test:unit`
  - 2 files, 19 tests passed, including notification yield/operator/deduplication unit tests.
- PASS: `npm run build`
  - Next.js production build completed successfully and generated 17 routes including `/app/notifications`, `/app/settings`, and `/app/stocks/[stockId]/notification-rule`.
- PASS: `zsh -c 'set -a; . ./.env.local; set +a; npx supabase@latest db push --password "$SUPABASE_DB_PASSWORD"'`
  - Applied `20260505004000_phase_05_notification_evaluation.sql` to the linked Supabase project.
- PASS: `npx supabase@latest db lint --linked`
  - No schema errors found after adding `public.evaluate_notification_rules`.
- PASS: `npm run test:integration`
  - After network escalation, 9 files and 54 tests passed against the configured Supabase project.
- PASS: `RUN_REMOTE_TESTS=1 npx vitest run --reporter=verbose tests/integration/notifications/notifications-settings.test.ts`
  - 1 file and 5 phase5 notification/settings tests passed. The evaluation test invokes `public.evaluate_notification_rules` and asserts notification creation, disabled-rule exclusion, and duplicate suppression.
- PASS: `rg -n "買いシグナル|売りシグナル|今すぐ買い|今すぐ売り|必ず上がる|確実に儲かる" src supabase tests .env.example`
  - No forbidden wording in implementation or tests.
- BLOCKED: `timeout 12s ./node_modules/.bin/supabase functions serve evaluate-notification-rules --no-verify-jwt --env-file .env.local`
  - Sandboxed run could not access Docker. Escalated Docker-socket verification was rejected as too broad because it would start a local function with `.env.local` secrets and JWT verification disabled. The function remains a thin wrapper around the remotely verified `public.evaluate_notification_rules` RPC.

## Failures And Fixes

- Initial `npm run typecheck` exposed existing test/config issues and new Deno Edge Function type inclusion. Fixed Vitest config, excluded `supabase/functions` from app TypeScript/ESLint checks, and corrected stale integration-test static errors.
- Initial `npm run test:unit` failed because the CommonJS Vitest config loaded an ESM dependency. Replaced `vitest.config.ts` with `vitest.config.mts`.
- Initial `npm run lint` failed on pre-existing integration-test lint errors. Fixed only the minimal static issues needed for the repository checks.
- Initial sandboxed `npm run test:integration` failed with DNS `EAI_AGAIN` for the Supabase host. Re-ran with network escalation and the suite passed.
- First phase5 notification integration run failed because a test fixture omitted the NOT NULL `payload`. Fixed the fixture to match the schema.
- First audit failed because evaluation side effects were manually simulated in tests. Moved the real evaluator into `public.evaluate_notification_rules`, made the Edge Function delegate to it, pushed the migration, and updated integration tests to invoke the actual evaluator.

## Manual Review

- Confirmed rule configuration screen shows stock name/ticker, basis selector, operator selector, target yield input, in-app/email checkboxes, save action, active/disabled rule list, disable action, and the required neutral disclaimer.
- Confirmed notification screen includes filter tabs, today/this week/older grouping, notification cards with title/body summary/stock/time/read state, single read action, all-read action, and neutral disclaimer.
- Confirmed settings screen shows account email, notification toggles, default amount basis, fixed JPY display, monthly dividend goal, tax notice, logout, and disabled account deletion with `近日公開予定`.
- Confirmed `public.evaluate_notification_rules` supports optional `stockId`, optional `userId`, `dryRun`, active-rule loading, stock yield calculation, highest-quantity holding account type selection, `tokutei` fallback, 24-hour deduplication, in-app notification insertion, email-channel notification job creation, and `last_triggered_at` update. Confirmed Edge Function `evaluate-notification-rules` validates caller context and delegates to that RPC.
