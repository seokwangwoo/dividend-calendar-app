# Phase 01: Data Contracts and Storage

## Goal

Establish the database, enum, type, and private Storage contracts needed for PDF-backed disclosure collection and AI review candidates without changing user-facing dividend behavior.

## Prerequisites

- Existing MVP database migrations and admin review pipeline are applied.
- Existing user-facing dividend queries continue to read approved `dividend_events`.
- Supabase project has Storage enabled.

## Implementation Scope

- Add or extend database fields for PDF + AI parsing on `disclosures`, `dividend_reviews`, `dividend_events`, and `jobs`.
- Preserve existing `payment_year` behavior while adding stronger `fiscal_year` and source metadata for disclosure-derived events; document that `payment_year` is derived from payment timing, not from fiscal year by default.
- Define domain enums in application validation/types for disclosure type, parse status, review priority, event type, review status, change type, and job type.
- Ensure the private `disclosures` Storage bucket exists and is not public.
- Add RLS and grants so admins can inspect review data while service-role Edge Functions perform system writes.
- Update `src/types/supabase.ts` or the repository's Supabase type workflow to reflect the new contract.

## Core Tasks

1. **Disclosure table contract**
   - Extend `disclosures` with `disclosure_type`, `parse_status`, `review_priority`, `ai_parse_attempts`, `last_parse_error`, and `raw_payload` if missing.
   - Keep `external_id` unique and use it for idempotent collection.
   - Document allowed `disclosure_type` values: `dividend_forecast_revision`, `dividend_decision`, `earnings_release`, `earnings_revision`, `correction`, and `other`.
   - Document allowed `parse_status` values: `pending`, `downloaded`, `parsing`, `parsed`, `failed`, and `skipped`.
   - Document allowed `review_priority` values: `low`, `normal`, `high`, and `urgent`.

2. **Dividend review table contract**
   - Extend `dividend_reviews` with `fiscal_year`, `event_type`, `extracted_record_date`, `extracted_ex_dividend_date`, `change_type`, `evidence_text`, and `warning_message` if missing.
   - Preserve existing approval/rejection columns and the single `created_dividend_event_id` linkage; this confirms the contract is one review row approving into at most one dividend event.
   - Document allowed `event_type` values: `interim`, `year_end`, `annual_total`, `special`, `commemorative`, and `other`; document `annual_total` as non-payable validation/reference data, and document `special`/`commemorative` as breakdown metadata on payable `interim`/`year_end` events for MVP user-facing aggregation purposes.
   - Document allowed `status` values: `pending`, `approved`, `rejected`, and `needs_manual_check`.
   - Document allowed `change_type` values: `increase`, `decrease`, `no_dividend`, `resumed`, `special`, `commemorative`, `unchanged`, and `unknown`; `special`/`commemorative` change types trigger review/notification behavior without requiring a separately counted payable event row.

3. **Dividend event compatibility**
   - Ensure `dividend_events` can store `fiscal_year`, `event_type`, `dividend_per_share`, `previous_dividend_per_share`, expected payment date/month, record date, ex-dividend date, status, change type, source type, source URL, source published timestamp, disclosure ID, review status, and raw payload breakdown metadata for ordinary/special/commemorative components.
   - Document that `ex_dividend_date` is explicit-only in MVP: no Japanese business-day or calendar-day derivation from `record_date`.
   - Preserve existing `payment_year` for user-facing yearly aggregations even if the spec names only `fiscal_year`.
   - Add indexes needed for approval matching by `stock_id`, `fiscal_year`, `event_type`, and source publication context.
   - Add validation helpers or documented constraints so approved user-facing events must have `payment_year`; reviews may omit it until admin approval.

4. **Jobs contract**
   - Add `max_attempts` defaulting to `3` if missing.
   - Document job types: `collect_disclosures`, `download_disclosure_pdf`, `parse_disclosure_pdf_ai`, `approve_dividend_review`, and `evaluate_notification_rules`.
   - Add indexes for status, run-after, type, and attempts where helpful for worker queries.

5. **Storage and security policy**
   - Ensure Storage bucket `disclosures` exists with `public = false`.
   - Keep direct PDF access unavailable to regular users.
   - Plan signed URL access for admins only in a later phase.

6. **Tests to add or update**
   - Migration/schema smoke tests or integration fixtures verifying new columns exist where repository tooling supports it.
   - Unit tests for local enum validators and status/priority constants.
   - Regression tests proving user-facing dividend queries still exclude non-approved events, never read `dividend_reviews`, require approved events to have confirmed `payment_year`, exclude `annual_total` from cash total/payment-calendar aggregation, avoid double-counting special/commemorative breakdowns as separate payable rows, keep missing `ex_dividend_date` as `null`, and handle multiple reviews from one disclosure without duplicate user exposure.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:unit`.
- Run `npm run test:integration` for database contract and user-facing query regressions when Supabase test credentials are available.
- Manual verification:
  - Confirm the `disclosures` Storage bucket is private.
  - Confirm an admin can inspect `disclosures`, `dividend_reviews`, and `jobs` through Supabase Studio.
  - Confirm a regular authenticated user cannot read admin-only disclosure/review/job rows.

## Completion Criteria

- Database migrations define all MVP PDF + AI parsing columns without dropping existing user data.
- Application types and validators know all disclosure, review, change, event, parse, priority, and job enums.
- Private `disclosures` Storage bucket exists and is not publicly readable.
- Existing home, calendar, portfolio, and notification tests still pass with approved-event filtering and `payment_year` behavior intact.
- Future phases can depend on `disclosures.storage_path`, `disclosures.parse_status`, `dividend_reviews.raw_payload`, and `jobs.max_attempts`.

## Excluded From This Phase

- Calling Yanoshin or TDnet.
- Downloading PDFs.
- Calling AI providers.
- Building the custom admin review UI.
- Generating user notifications from reviews.
