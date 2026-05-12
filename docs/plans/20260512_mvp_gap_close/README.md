# MVP Gap Close

## Purpose

This plan resolves four open active issues, implements the missing `/app/stocks/search` screen, adds CSV holding import, and validates all new features with E2E tests. The result is an app where the MVP user interface matches the documented product policy: payment-month-only calendar, before-tax-yield-only alert basis, a discoverable stock search entry point, and a bulk CSV import path for portfolio setup.

## Source Specifications

- `docs/dividend_app_wireframe.md` — stocks/search wireframe, CTA placement policy, alert rule UX
- `docs/dividend_calendar_mvp_plan.md` — calendar MVP basis policy, notification rule MVP policy, CSV import scope
- `docs/dividend_app_mvp_backend_spec.md` — notification_rules schema, basis enum
- `docs/issue/active/20260510-calendar-basis-switch-mvp-scope-mismatch.md`
- `docs/issue/active/20260510-missing-stock-search-route-for-alert-entry.md`
- `docs/issue/active/20260510-notification-rule-basis-mvp-scope-mismatch.md`
- `docs/issue/active/20260510-notification-evaluation-yield-mismatch.md`
- `docs/plans/260506_mvp_2nd_dev/phase_06_csv_import_and_calendar_expansion/plan.md` (partially superseded)

## Fixed Stack

| Area | Decision |
|---|---|
| Frontend | Next.js App Router |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Auth | Supabase Auth |
| Database | Supabase PostgreSQL |
| Authorization | Supabase RLS |
| API | Supabase Client, PostgREST, RPC |
| E2E | Playwright |

## Scope

Must include:

- Remove calendar basis-switch buttons from `/app/calendar` UI; keep `payment_month` as the sole user-visible basis.
- Fix notification rule form to expose `before_tax_yield` only; remove `after_tax_yield` from UI and server-action validation.
- Fix the `evaluate_notification_rules` integration test by explicitly seeding `current_price` and `expected_annual_dividend_per_share`.
- Add `/app/stocks/search` page reusing the existing stock search action.
- Add `[종목 검색]` CTA on the portfolio screen header linking to `/app/stocks/search`.
- Add `[알림을 설정할 종목 찾기]` CTA on the notifications empty state linking to `/app/stocks/search`.
- Add `/app/portfolio/import` page with upload → preview → confirm CSV import flow.
- CSV format: `ticker`, `quantity`, `average_purchase_price`, `account_type`, optional `memo`. Duplicates are skipped with explicit user feedback.
- E2E tests covering: stock search flow, calendar basis-button absence, single alert basis, CSV import golden path.
- Archive the four active issues after each corresponding fix is verified.
- Update `docs/plans/260506_mvp_2nd_dev/phase_06_csv_import_and_calendar_expansion/plan.md` to mark calendar expansion as out-of-scope.

Excluded from this plan:

- Calendar record-date / ex-dividend-date basis UI (Phase 2+ feature).
- `after_tax_yield` alert basis in the user UI (Phase 2+ feature).
- Merge/overwrite mode for CSV import; duplicates are always skipped.
- CSV import from brokerage-specific formats (SBI, Rakuten).
- Full regression E2E suite; only new features are covered here.
- Native mobile apps, Web Push, paid data APIs.

## Phase Order

1. [Phase 01: MVP Policy Alignment](./phase_01_mvp_policy_alignment/plan.md)
2. [Phase 02: Stock Search Screen](./phase_02_stock_search_screen/plan.md)
3. [Phase 03: CSV Holdings Import](./phase_03_csv_holdings_import/plan.md)
4. [Phase 04: E2E Acceptance Tests](./phase_04_e2e_acceptance_tests/plan.md)

## Development Rules

- Implement phases in order unless a blocker requires a narrow prerequisite task.
- Keep all user-owned data behind Supabase RLS.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- Internal RPC/type definitions for `record_date` and `ex_dividend_date` calendar bases may remain in the codebase; only remove the user-visible UI.
- `NOTIFICATION_RULE_BASES` constant may retain `after_tax_yield` for future use; remove it only from the UI options array and server-action schema validation.
- Treat `未定` as unknown, not zero.
- Use investment-neutral wording in all copy.
- Do not silently implement excluded scope from any phase.

## Common Domain Terms

| Term | Meaning |
|---|---|
| Payment month | Month in `payment_year` + `estimated_payment_month` used as the sole MVP calendar aggregation key |
| Before-tax yield | `expected_annual_dividend_per_share / current_price × 100`; the only MVP alert basis |
| Supported stock | Stock with `support_status = 'supported'`; has approved dividend data |
| Unsupported stock | Stock with `support_status = 'unsupported'`; searchable but shows "배당 데이터 확보 중" |
| Duplicate holding | A CSV row whose `ticker + account_type` matches an existing non-deleted holding for the same user |

## Plan Completion Definition

The plan is complete when:

- `/app/calendar` shows no basis-switch buttons; only payment-month aggregation is rendered.
- `/app/stocks/:stockId/notification-rule` exposes only the before-tax yield basis; `after_tax_yield` cannot be saved via the UI.
- `npm run test:integration` passes all notification evaluation tests.
- `/app/stocks/search` is accessible and returns search results; `[종목 검색]` CTA on portfolio and `[알림을 설정할 종목 찾기]` on notifications empty state both navigate to it.
- `/app/portfolio/import` accepts a valid CSV, shows a preview with row-level validation, and commits valid rows as holdings.
- Playwright E2E tests for all four feature areas pass on `npm run test:e2e`.
- All four active issues are archived.

## Document Maintenance

- If the implementation diverges from these files, update the affected phase document before continuing.
- Keep each phase document below 500 lines.
- Add follow-up work to a later plan rather than expanding current plan scope.
