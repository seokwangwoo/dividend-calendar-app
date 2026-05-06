# MVP 2nd Development Plan

## Purpose

This plan turns the first MVP into a more reliable beta-ready dividend calendar app by fixing MVP 1st data consistency issues, adding the minimum custom admin workflow, making price-based alerts safer, enabling production email notification delivery, improving installability and empty states, and adding CSV/calendar follow-up features that were deferred from the first cycle.

## Source Specifications

- `docs/dividend_app_wireframe.md`
- `docs/dividend_calendar_mvp_plan.md`
- `docs/dividend_app_mvp_backend_spec.md`
- `docs/issue/home-portfolio-dividend-mismatch.md`
- `docs/issue/decision-dividend-year-basis.md`
- `docs/issue/decision-calendar-aggregation.md`
- `docs/issue/decision-annual-dividend-goal.md`
- `docs/issue/decision-settings-scope.md`
- `docs/issue/decision-admin-review-ui.md`
- `docs/issue/decision-stock-price-source.md`
- `docs/issue/decision-stale-price-alert-policy.md`
- `docs/issue/decision-notification-deduplication.md`
- `docs/issue/decision-notification-target-scope.md`
- `docs/issue/decision-onboarding-empty-state.md`
- `docs/issue/decision-portfolio-yield-calculation.md`
- `docs/issue/decision-next-dividend-logic.md`
- `docs/issue/decision-dividend-status-badge.md`
- `docs/issue/decision-data-pipeline-spof.md`

Coverage summary:

- [MVP 2nd Spec Coverage](./spec_coverage.md)

## Fixed MVP 2nd Stack

| Area | Decision |
|---|---|
| Frontend | Next.js App Router |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Auth | Supabase Auth |
| Database | Supabase PostgreSQL |
| Authorization | Supabase RLS |
| API | Supabase Client, PostgREST, RPC |
| Custom backend | Supabase Edge Functions |
| Storage | Supabase Storage |
| Scheduler | GitHub Actions Cron |
| Stock price source | Stooq free CSV endpoint, daily close cache |
| Email | Resend |
| Admin v2 | Minimal custom `/admin` review UI plus Supabase Studio fallback |
| Monitoring | Sentry |
| PWA | Next.js manifest and service worker with conservative static caching |

## Scope

Must include:

- Fix MVP 1st annual dividend inconsistencies between home, portfolio, calendar, stock detail, and tests.
- Use `payment_year` as the user-facing calendar-year aggregation key while keeping `fiscal_year` for disclosure/admin context.
- Replace monthly dividend goal UX with annual after-tax dividend goal where user-facing copy requires it.
- Keep `user_settings` and `notification_rules` as canonical table names; map older issue wording such as `users` and `alert_rules` to the current schema.
- Add a minimal authenticated admin review UI for dividend event entry, review status changes, and source URL management.
- Add Stooq daily price refresh, stale-price handling, and admin failure visibility.
- Change yield alert deduplication to state-transition logic using `last_condition_met`.
- Deliver opt-in email notifications through Resend with idempotent delivery state.
- Add installable PWA basics and robust empty-state/onboarding-by-home behavior.
- Add CSV holding import and calendar basis expansion for record-date/ex-dividend-date views.

Excluded from this plan:

- Native iOS or Android apps.
- Brokerage account API integration.
- Buy/sell recommendations.
- Automatic tax filing.
- Full Japanese market coverage.
- US stocks, US ETFs, and foreign tax handling.
- Paid TDnet API integration.
- Fully automated high-accuracy XBRL/PDF parser.
- Web Push notifications.
- Account deletion automation and legal deletion workflow.
- Multi-currency support beyond JPY.
- Public watchlist alerts for unowned stocks.

## Phase Order

1. [Phase 01: MVP 1st Consistency Fixes](./phase_01_mvp_1st_consistency_fixes/plan.md)
2. [Phase 02: Minimal Admin Review UI](./phase_02_admin_review_ui/plan.md)
3. [Phase 03: Price Refresh and Alert Reliability](./phase_03_price_refresh_and_alert_reliability/plan.md)
4. [Phase 04: Email Notification Delivery](./phase_04_email_notification_delivery/plan.md)
5. [Phase 05: PWA and Empty State UX](./phase_05_pwa_and_empty_state_ux/plan.md)
6. [Phase 06: CSV Import and Calendar Expansion](./phase_06_csv_import_and_calendar_expansion/plan.md)
7. [Phase 07: E2E Acceptance Testing](./phase_07_e2e_acceptance_testing/plan.md)

## Development Rules

- Implement phases in order unless a blocker requires a narrow prerequisite task.
- Keep all user-owned data behind Supabase RLS.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, or scheduler secrets to the browser.
- User-facing dividend totals must derive from one approved event source of truth for the selected `payment_year`.
- Use `fiscal_year` only for admin/disclosure context, never for "this year cash received" user-facing totals.
- Treat `未定` as unknown, not as zero.
- Use investment-neutral wording. Never present notifications as buy or sell signals.
- Keep app copy and tests aligned with Japanese yen and Japanese domestic stock MVP scope.
- Do not silently implement excluded scope from any phase.

## Common Domain Terms

| Term | Meaning |
|---|---|
| Before-tax dividend | Dividend before estimated tax deduction |
| After-tax dividend | Estimated cash received after account tax rules |
| Payment year | Calendar year in which dividend is expected to be paid |
| Payment month | Month in which dividend is expected to be paid |
| Fiscal year | Company accounting year used for admin and disclosure traceability |
| Review status | Admin validation state for collected or manually entered dividend data |
| Supported stock | Stock that can be added to a portfolio in MVP |
| Unsupported stock | Search-visible stock that cannot yet be added |
| Stale price | Cached stock price older than the configured alert safety threshold |
| State-transition alert | Alert emitted only when a rule changes from unmet to met |

## Plan Completion Definition

The plan is complete when:

- Home, portfolio, calendar, and stock detail show consistent annual dividend totals for the same user, holdings, year, and approved dividend events.
- Aggregations use `payment_year` and month filters use `estimated_payment_month`, with uncertain dates displayed as estimated text.
- Users can set an annual after-tax dividend goal and see correct goal progress or goal-empty state.
- Admins can use `/admin` to create or review dividend data without direct SQL for normal MVP operations.
- Daily stock price refresh updates supported stock prices, records failures, and prevents stale-price yield alerts.
- Yield alerts are deduplicated by rule state transition, and dividend change alerts target only holders.
- Opt-in email notifications are sent through Resend exactly once per notification delivery.
- The app has basic PWA install metadata and stable empty states for new users.
- Users can import holdings from CSV with validation and preview before commit.
- Calendar supports payment-month, record-date, and ex-dividend-date views without changing the default payment-month UX.

## Document Maintenance

- If the implementation diverges from these files, update the affected phase document before continuing.
- Keep each phase document below 500 lines.
- Add follow-up work to a later plan rather than expanding MVP 2nd scope.
