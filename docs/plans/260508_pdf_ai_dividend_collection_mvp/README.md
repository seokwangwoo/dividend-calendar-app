# PDF AI Dividend Collection MVP Plan

## Purpose

This plan upgrades the existing dividend calendar app from manually seeded/admin-entered dividend data to a PDF + AI parsing based semi-automated operation: TDnet/Yanoshin disclosures are collected, relevant PDFs are stored, AI extracts structured dividend candidates into `dividend_reviews`, admins approve or reject candidates, and only approved `dividend_events` reach user-facing home, calendar, and notification surfaces.

## Source Specifications

- User-provided specification in this planning request: `# 배당앱 MVP 사양서 ## PDF + AI 파싱 기반 배당 데이터 수집`
- `docs/dividend_calendar_mvp_plan.md`
- `docs/dividend_app_mvp_backend_spec.md`
- `docs/dividend_app_wireframe.md`
- `docs/issue/decision-admin-review-ui.md`
- `docs/issue/decision-data-pipeline-spof.md`
- `docs/issue/decision-notification-deduplication.md`
- `docs/issue/decision-notification-target-scope.md`
- `docs/issue/decision-dividend-status-badge.md`

Coverage summary:

- [PDF AI Dividend Collection Spec Coverage](./spec_coverage.md)

## Fixed PDF AI Collection Stack

| Area | Decision |
|---|---|
| Frontend | Next.js App Router |
| Language | TypeScript for app code, Deno TypeScript for Supabase Edge Functions |
| Styling | Tailwind CSS and existing UI primitives |
| Auth | Supabase Auth |
| Database | Supabase PostgreSQL |
| Authorization | Supabase RLS plus Edge Function service-role operations |
| Backend runtime | Supabase Edge Functions |
| Storage | Private Supabase Storage bucket named `disclosures` |
| Scheduler | GitHub Actions Cron invoking Edge Functions |
| Disclosure source | Yanoshin TDnet list API over HTTPS, using `json2`/`json` list responses and TDnet PDF URLs as source documents |
| AI parsing | OpenAI Responses API from Edge Functions, using extracted text first and structured JSON output |
| Async work | Existing `jobs` table extended with `max_attempts` and a central `process-jobs` Edge Function for claim/retry/dispatch |
| Admin operations | Supabase Studio for MVP 1 fallback, custom `/admin/dividend-reviews` for MVP 2 |
| User data contract | User surfaces read only approved `dividend_events`, never raw AI results |

## Scope

Must include:

- Extend existing `disclosures`, `dividend_reviews`, `dividend_events`, and `jobs` contracts for PDF + AI parsing metadata while preserving existing user-facing approved-event behavior.
- Keep `payment_year` from the existing app as the user-facing calendar-year aggregation key, derive it from disclosed payment timing when possible, and add/maintain `fiscal_year` for disclosure and review context.
- Create and secure the private `disclosures` Storage bucket for original PDFs.
- Implement title-based TDnet/Yanoshin filtering for strong dividend keywords, earnings-release keywords, and correction keywords after fetching `https://webapi.yanoshin.jp/webapi/tdnet/list/{condition}.json2` or `.json`.
- Classify disclosures into `dividend_forecast_revision`, `dividend_decision`, `earnings_release`, `earnings_revision`, `correction`, and `other`.
- Download TDnet PDFs into Storage paths shaped as `disclosures/{ticker}/{published_date}/{external_id}.pdf`.
- Create asynchronous jobs for disclosure collection, PDF download, AI parsing, review approval, and notification-rule evaluation; process them through a central `process-jobs` Edge Function that starts with the download handler in Phase 03 and gains later handlers phase-by-phase. `parse_disclosure_pdf_ai` jobs are created only after a PDF has been successfully stored and `disclosures.storage_path` is available.
- Parse disclosure PDFs with AI into validated JSON and persist only candidate records in `dividend_reviews`, using one review row per extracted AI event.
- Apply server-side validation and confidence adjustment before saving review candidates.
- Let admins approve, override, or reject review candidates, then upsert approved `dividend_events`.
- Generate idempotent dividend-change notifications only after admin approval.
- Add a custom `/admin/dividend-reviews` workflow with pending list, evidence, source PDF access through signed URLs, edit, approve, and reject actions.
- Ensure user-facing home, calendar, and notifications expose only approved dividend data and include investment-advice disclaimer copy where relevant.
- Add focused tests for classification, validation, job retry behavior, AI response handling, approval side effects, admin authorization, and user-surface safety.

Excluded from this plan:

- Full XBRL parser implementation.
- Parsing every TDnet disclosure with AI.
- Brokerage account transaction or cash-deposit integration.
- Automatic user notification delivery before admin approval.
- Fully automatic AI-to-user dividend data confirmation.
- A separate backend server outside Supabase Edge Functions.
- Native mobile apps.
- Production-grade observability beyond structured job errors and admin-visible failure state.

## Phase Order

1. [Phase 01: Data Contracts and Storage](./phase_01_data_contracts_and_storage/plan.md)
2. [Phase 02: Disclosure Collection](./phase_02_disclosure_collection/plan.md)
3. [Phase 03: PDF Download and Job Runner](./phase_03_pdf_download_and_job_runner/plan.md)
4. [Phase 04: AI PDF Parsing](./phase_04_ai_pdf_parsing/plan.md)
5. [Phase 05: Review Approval Pipeline](./phase_05_review_approval_pipeline/plan.md)
6. [Phase 06: Admin Review UI](./phase_06_admin_review_ui/plan.md)
7. [Phase 07: Notifications and User Surfaces](./phase_07_notifications_and_user_surfaces/plan.md)
8. [Phase 08: Accuracy Hardening](./phase_08_accuracy_hardening/plan.md)
9. [Phase 09: E2E Testing](./phase_09_e2e_testing/plan.md)

## Development Rules

- Implement phases in order unless a blocker requires a narrow prerequisite task.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, or OpenAI model configuration secrets to browser code.
- AI extraction results must remain in `dividend_reviews` until admin approval; user-facing reads must continue to filter by approved `dividend_events`.
- Use OpenAI Responses API for MVP AI parsing, with PDF text extraction and dividend-section trimming before the model call whenever feasible; direct PDF input, page images, and OCR are fallback/hardening paths, not the default Phase 04 path.
- Prefer deterministic parsing, validation, and test fixtures around AI boundaries; mock OpenAI calls in unit and integration tests.
- Do not send user notifications from collection or parsing phases.
- Keep Edge Function request bodies backward-compatible where existing admin screens call them, or update the callers and tests in the same phase.
- For uncertain payment dates, persist `expected_payment_month`/existing month fields instead of fabricating a full date; if no full `expected_payment_date` exists, admin approval must explicitly confirm `payment_year` before creating a user-facing event. Do not calculate `ex_dividend_date` from `record_date` in MVP; store it only when explicitly present in the disclosure/AI evidence, otherwise keep it `null`.
- Add migrations as additive changes where possible; when a contract changes, update `src/types/supabase.ts` and relevant tests in the same phase.
- Every `process-jobs` handler must be idempotent for repeated attempts of the same payload, and job claim/retry/backoff/final-failure behavior must stay centralized in the runner.
- Keep Yanoshin `hasXBRL=0` for MVP PDF collection because `hasXBRL=1` changes `document_url` to an XBRL file link; XBRL-only collection belongs to a later validation plan.

## Common Domain Terms

| Term | Meaning |
|---|---|
| disclosure | A TDnet/Yanoshin public company announcement stored in `disclosures`. |
| disclosure pdf | The original PDF document downloaded from TDnet and stored privately in Supabase Storage. |
| dividend review | An admin-only candidate dividend extraction stored in `dividend_reviews`; each extracted AI event becomes one review row so approval remains one review to one dividend event. |
| dividend event | Approved app data stored in `dividend_events` and used by home, calendar, portfolio, and notifications. |
| fiscal year | Company accounting year represented on disclosures; it is not a safe substitute for `payment_year` unless an admin explicitly confirms it. |
| payment year | App-internal calendar year for user-facing expected payment calculations; derive from `expected_payment_date` when present, otherwise require admin confirmation when only a payment month is known. |
| event type | Dividend period/category: `interim`, `year_end`, `annual_total`, `special`, `commemorative`, or `other`; `annual_total` is review/reference data, and MVP treats special/commemorative dividends as breakdowns on payable `interim`/`year_end` events unless Phase 08 fixtures prove a separate payable event is required. |
| change type | Dividend change classification: `increase`, `decrease`, `no_dividend`, `resumed`, `special`, `commemorative`, `unchanged`, or `unknown`; `special`/`commemorative` can drive notifications without creating separate payable event rows. |
| review priority | Admin triage priority: `low`, `normal`, `high`, or `urgent`. |
| strong dividend keyword | A title keyword that requires parsing when a PDF exists, such as `配当予想の修正`, `剰余金の配当`, `増配`, `減配`, `無配`, or `復配`. |
| earnings release | A `決算短信` disclosure parsed only for dividend tables. |
| correction disclosure | A title containing `訂正`, `一部訂正`, or correction semantics and treated as high-priority review when dividend-related. |

## Plan Completion Definition

The plan is complete when:

- TDnet/Yanoshin disclosure collection stores only dividend-related and earnings-release candidates needed by the MVP.
- Original PDFs are downloaded to private Supabase Storage and linked from `disclosures.storage_path`.
- Jobs can retry PDF download and AI parsing failures up to the configured maximum and preserve visible error details.
- AI parsing creates validated `dividend_reviews` with confidence, evidence text, warnings, event type, change type, dates, and raw payload; multi-event AI responses create multiple review rows linked to the same disclosure.
- Low-confidence, correction, decrease, no-dividend, special, and inconsistent results are prioritized for admin review.
- Admins can inspect the PDF, edit candidate values, approve candidates into `dividend_events`, and reject bad candidates.
- Approved payable events update home, calendar, and notification views while pending/rejected AI results remain hidden from users; approved `annual_total` events are retained for validation/reference and excluded from user-facing cash total/payment-calendar aggregation, and special/commemorative components are included through payable event breakdown metadata rather than separately counted event rows.
- Dividend-change notifications are created only after approval and deduplicated per disclosure/event rule.
- Automated tests and manual verification cover the main collection, parsing, review, approval, and user-safety paths.

## Document Maintenance

- Update the existing source specifications before implementation when a planned change alters product behavior, data contracts, admin workflow, security boundaries, or user-facing terminology; do not wait until after code is merged for these decisions.
- Treat implementation as conforming to the updated specifications and this plan. If code reveals a better approach, pause, update the affected source specification and phase document first, then continue implementation.
- After each phase, perform a short documentation audit and update specifications only for implementation-proven details, commands, or operational notes; this post-implementation pass must not introduce unreviewed behavior changes.
- If the implementation diverges from these files, update the affected phase document before continuing.
- Keep each phase document below 500 lines.
- Add follow-up work to a later plan rather than expanding current plan scope.
