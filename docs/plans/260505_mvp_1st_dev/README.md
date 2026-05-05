# MVP 1st Development Plan

## Purpose

This plan breaks the first MVP development cycle for the dividend calendar app into small, implementation-ready phases.

The MVP focuses on one user promise:

> A Japanese dividend investor can register holdings, see expected after-tax dividend cash flow by month, and receive condition-based dividend notifications with reviewed source data.

## Source Specifications

- `docs/dividend_app_wireframe.md`
- `docs/dividend_calendar_mvp_plan.md`
- `docs/dividend_app_mvp_backend_spec.md`

Coverage summary:

- [MVP 1st Spec Coverage](./spec_coverage.md)

## Fixed MVP Stack

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
| Email | Resend, after in-app notification is stable |
| Admin v1 | Supabase Studio |
| Monitoring | Sentry |

## MVP 1st Scope

Must include:

- Email/password signup, login, logout, and password reset.
- Authenticated app shell with bottom navigation.
- Supported Japanese stock search.
- Holding create, edit, soft delete, and list.
- Account types: `nisa`, `tokutei`, `general`.
- Before-tax and after-tax dividend calculation.
- Home summary for annual and current-month expected dividends.
- Monthly dividend calendar with amount basis and account filters.
- Stock detail with source and review status.
- Target dividend yield notification rules.
- In-app notifications.
- Settings for notification and display preferences.
- Admin review data model and Supabase Studio operating flow.
- Minimal disclosure/review/job foundation for TDnet and parser work.

Excluded from MVP 1st:

- Native iOS or Android apps.
- Brokerage account API integration.
- Buy/sell recommendations.
- Automatic tax filing.
- Full Japanese market coverage.
- US stocks, US ETFs, and foreign tax handling.
- Redis, queues, NestJS, FastAPI, or a separately hosted backend server.
- Web Push notifications.
- CSV import.

## Phase Order

1. [Phase 01: Project Foundation](./phase_01_project_foundation.md)
2. [Phase 02: Database, Auth, and RLS](./phase_02_database_auth_rls.md)
3. [Phase 03: Portfolio and Dividend Calculation](./phase_03_portfolio_dividend_calculation.md)
4. [Phase 04: Home and Calendar Core UI](./phase_04_home_calendar_core_ui.md)
5. [Phase 05: Notifications and Settings](./phase_05_notifications_and_settings.md)
6. [Phase 06: Admin Review and Data Pipeline](./phase_06_admin_review_and_data_pipeline.md)
7. [Phase 07: MVP Acceptance Testing](./phase_07_mvp_acceptance_testing.md)

## Development Rules

- Implement phases in order unless a blocker requires a narrow prerequisite task.
- Keep all user-owned data behind Supabase RLS.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- Use approved `dividend_events` only for user-facing dividend calculations and dividend change notifications.
- Treat `未定` as unknown, not as zero.
- Use investment-neutral wording. Never present notifications as buy or sell signals.
- Keep the UI focused on after-tax cash flow, not trading analysis.

## Common Domain Terms

| Term | Meaning |
|---|---|
| Before-tax dividend | Dividend before estimated tax deduction |
| After-tax dividend | Estimated cash received after account tax rules |
| Payment month | Month in which dividend is expected to be paid |
| Review status | Admin validation state for collected or parsed dividend data |
| Supported stock | Stock that can be added to a portfolio in MVP |
| Unsupported stock | Search-visible stock that cannot yet be added |

## MVP Completion Definition

The MVP 1st cycle is complete when:

- A new user can sign up, log in, add a supported Japanese stock, and save quantity, average purchase price, and account type.
- The app calculates expected before-tax dividend, estimated tax, after-tax dividend, and after-tax yield.
- Home shows annual after-tax dividend, annual before-tax dividend, estimated tax, current-month dividend, next dividend, and monthly goal progress.
- Calendar shows monthly dividend totals and month detail by selected year, amount basis, and account type.
- A user can create a target yield notification rule and receive an in-app notification when evaluation logic is triggered.
- Admin-reviewed dividend data can be approved or rejected through the initial operating flow.
- User-facing screens never use rejected or pending dividend review data as confirmed information.
- Acceptance scenarios in Phase 07 pass.

## Document Maintenance

- If the implementation diverges from these files, update the affected phase document before continuing.
- Keep each phase document below 500 lines.
- Add follow-up work to a later plan rather than expanding MVP 1st scope.
