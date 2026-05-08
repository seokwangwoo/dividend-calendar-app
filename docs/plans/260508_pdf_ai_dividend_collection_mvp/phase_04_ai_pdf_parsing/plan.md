# Phase 04: AI PDF Parsing

## Goal

Parse downloaded TDnet PDFs into validated admin-only dividend review candidates using AI while controlling cost, preserving evidence, and routing uncertain results to manual review.

## Prerequisites

- Phase 03 Completion Criteria are met, including dependent `parse_disclosure_pdf_ai` job creation after successful PDF storage.
- `OPENAI_API_KEY` and the configured Responses API model name are available only to Supabase Edge Functions.
- A deterministic PDF text extraction library or helper is selected for the Edge Function runtime before implementing the OpenAI call.
- Direct OpenAI PDF input is reserved for fallback cases where text extraction is empty or clearly unusable; it is not the default MVP path.

## Implementation Scope

- Add the `parse_disclosure_pdf_ai` handler to the central `process-jobs` runner using stored PDFs; normal parse jobs must originate from successful PDF download, not from disclosure collection.
- Extract PDF text first, trim to dividend-relevant sections, and send that text to the OpenAI Responses API as the default MVP path.
- Use direct OpenAI PDF input only as a controlled fallback when extracted text is empty or unusable, and record the fallback reason.
- Add disclosure-type-specific prompt templates for dividend disclosures and earnings releases.
- Require OpenAI Structured Outputs/JSON schema matching the MVP schema, then validate the response server-side.
- Create one `dividend_reviews` row per extracted AI event, including `annual_total` rows as validation/reference candidates, or a single manual-check review for strong dividend disclosures with no extracted events.
- Adjust confidence deterministically and set review priority.
- Keep parsed candidates hidden from user-facing `dividend_events` until approval.

## Core Tasks

1. **PDF content preparation**
   - Load PDF bytes from private Storage by `disclosures.storage_path`; if a parse job exists without storage path, mark it as an invalid dependency state rather than treating it as a normal retryable AI failure.
   - Extract Japanese text locally/server-side before calling OpenAI.
   - Limit AI input to relevant dividend sections when possible, especially `配当の状況`, `1株当たり配当金`, and `年間配当金` for earnings releases.
   - Use direct OpenAI PDF input only when extracted text is empty or fails a documented minimum-quality check.
   - Record in `raw_payload` whether extracted text or direct PDF fallback was used, including section-trimming metadata and fallback reason.

2. **OpenAI request and prompt templates**
   - Use the OpenAI Responses API from the Edge Function with a configurable model environment variable.
   - Add a dividend-disclosure prompt focused on dividend revisions, dividend decisions, record date, payment date, special/commemorative/no-dividend cases, and evidence text; instruct the model to include special/commemorative components in a breakdown for the payable interim/year-end event when they are part of the same declared dividend.
   - Add an earnings-release prompt focused only on dividend tables and ignoring unrelated financial metrics.
   - Use Structured Outputs/JSON schema where supported and still require explicit `null` for unknown values.

3. **AI output schema validation**
   - Validate top-level fields: ticker, company name, disclosure title, disclosure type, fiscal year, currency, events, warnings, and needs manual check.
   - Accept only `JPY` currency for MVP.
   - Validate event fields: event type, status, dividend per share, previous dividend per share, change type, record date, ex-dividend date, expected payment date, expected payment month, evidence text, confidence score, and optional ordinary/special/commemorative breakdown amounts.
   - Reject invalid JSON, invalid enum values, invalid date formats, negative dividends, and confidence outside 0-1.
   - Add warnings instead of hard failure when AI ticker differs from the matched disclosure stock.
   - Do not ask AI to guess app-level `payment_year`; derive it later from `expected_payment_date` or require admin confirmation when only month-level timing is available.
   - Do not ask AI or server code to calculate `ex_dividend_date` from `record_date`; accept `ex_dividend_date` only when the disclosure text explicitly states it, otherwise return/store `null`.

4. **Confidence and priority routing**
   - Implement server-side confidence adjustment based on amount, evidence, event type, change type, payment date, warnings, and suspicious large dividend amounts.
   - Set `review_priority = 'high'` for confidence below 0.6, corrections, large existing-event differences, decreases, and special/commemorative breakdowns.
   - Set `review_priority = 'urgent'` for no-dividend changes.
   - Store warnings and adjusted confidence in `dividend_reviews`.

5. **Review creation and parse status**
   - Create exactly one `dividend_reviews` row for each valid AI `events[]` item, including `annual_total`; do not store multiple approvable events inside a single review row.
   - Store `event_index`, the per-event payload, disclosure-level warnings, whether the event is payable or reference-only, any ordinary/special/commemorative breakdown, and enough full AI response summary in each review `raw_payload` for audit without requiring admins to inspect sibling rows.
   - Keep all rows from the same AI response linked through the same `disclosure_id`; the admin UI may group them by disclosure, but approval remains per review row.
   - Use `status = 'needs_manual_check'` when AI says manual check is needed or a strong dividend disclosure has no events.
   - If no dividend info is found in a non-strong disclosure, create no review and store `raw_payload.no_dividend_info_found = true`.
   - Update `disclosures.parse_status` to `parsed` on successful parse handling.

6. **Failure handling**
   - Reuse the Phase 03 `process-jobs` retry/backoff/final-failure contract for parse jobs, except invalid dependency state such as missing `storage_path` should produce an operator-visible job error and high-priority disclosure review rather than repeated AI retries.
   - Increment `ai_parse_attempts` and job attempts for parse failures.
   - Retry parse failures up to `max_attempts`.
   - On final failure, set `disclosures.parse_status = 'failed'`, `review_priority = 'high'`, and `last_parse_error`.

7. **Tests to add or update**
   - Unit tests for AI schema validation, enum rejection, date validation, non-negative dividend validation, and JPY-only currency enforcement.
   - Unit tests for confidence adjustment and priority routing.
   - Edge Function tests with mocked OpenAI Responses API responses for single-event and multi-event results, special/commemorative breakdowns, explicit ex-dividend date, missing ex-dividend date, invalid JSON, no events, low confidence, ticker mismatch, and suspicious large amount.
   - Tests for extracted-text-first behavior and direct-PDF fallback only when text extraction quality checks fail.
   - Regression tests proving parsed reviews do not appear in user-facing queries before approval and that one disclosure with multiple AI events creates multiple review rows, not one multi-event review.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:unit`.
- Run `npm run test:integration` with mocked OpenAI boundaries when available.
- Manual verification:
  - Parse a fixture dividend revision PDF/text with a special or commemorative component and confirm a pending payable review with breakdown evidence is created without an extra separately counted payable event candidate.
  - Parse a fixture earnings release with interim, year-end, and annual-total rows and confirm separate review rows are created for each extracted event, with `annual_total` marked as reference-only for user-facing aggregation.
  - Submit an invalid AI response fixture and confirm retry/failure behavior; submit a missing-storage-path parse job and confirm it is treated as invalid dependency state.

## Completion Criteria

- Downloaded disclosures can be parsed into validated `dividend_reviews` without creating user-facing events, with one review row per extracted AI event.
- AI output is rejected or warned according to deterministic server-side validation rules.
- Confidence is adjusted server-side and high-risk items receive high or urgent priority.
- Strong dividend disclosures with no extracted events still become manual-check work.
- Parse jobs run through `process-jobs`, are idempotent, and retry/final-failure states are visible in `jobs` and `disclosures`.

## Excluded From This Phase

- Admin approval into `dividend_events`.
- Custom admin review UI.
- User notifications.
- Full XBRL validation.
- Large historical backfill.
