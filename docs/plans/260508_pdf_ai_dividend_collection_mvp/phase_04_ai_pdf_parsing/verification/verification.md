# Phase 04 Verification

Phase file: `docs/plans/260508_pdf_ai_dividend_collection_mvp/phase_04_ai_pdf_parsing/plan.md`

Verification date: 2026-05-10

Environment:

- Workspace: `/home/seo/OneDrive/linux/projects/dividend-calendar-app`
- Node/npm project with installed dependencies in `node_modules`
- Phase 04 adds the `parse_disclosure_pdf_ai` handler to `process-jobs` and a shared `_shared/pdf-ai-parser.ts` module.
- No live OPENAI_API_KEY available in the sandbox; all OpenAI calls are tested via mocked `callOpenAI` dependencies in unit tests. Live OpenAI boundary tests are out of scope for this verification run.
- Remote Supabase integration tests require network escalation not available in this run.

## Test Plan Status

| Test-plan item | Status | Evidence |
|---|---:|---|
| `npm run lint` | PASS | ESLint completed with `--max-warnings=0`. |
| `npm run typecheck` | PASS | `tsc --noEmit` completed successfully. |
| `npm run build` | PASS | Next.js production build completed successfully (18 static pages). |
| `npm run test:unit` | PASS | 39 test files, 440 tests passed. Includes 78 new Phase 04 tests. |
| `npm run test:integration` with mocked OpenAI boundaries | SKIPPED | Network not available for Supabase remote access. Same skip rationale as Phase 03. |
| Manual: parse fixture dividend revision PDF/text with special/commemorative component | PASS (unit test proxy) | `buildReviewRows` test "stores components breakdown in raw_payload" confirms one payable `year_end` review row is created with `components: { ordinary: 120, special: 30, commemorative: null }`, not as a separate event row. |
| Manual: parse fixture earnings release with interim/year-end/annual-total | PASS (unit test proxy) | `executeParseDisclosurePdfAi` test "creates multiple review rows for multi-event AI response" confirms 3 separate rows (interim, year_end, annual_total) are created, linked by `disclosure_id`. |
| Manual: submit invalid AI response and confirm retry/failure behavior | PASS (unit test proxy) | `executeParseDisclosurePdfAi` tests confirm: invalid JSON → non-retryable `ai_output_invalid_json` error; invalid schema (non-JPY currency) → non-retryable `ai_output_validation_failed` error. |
| Manual: submit missing-storage-path parse job and confirm invalid dependency state | PASS (unit test proxy) | `executeParseDisclosurePdfAi` test "throws non-retryable error for missing storage_path" verifies `invalid_dependency_state:missing_storage_path` with `retryable: false`. |

## Commands

```bash
npm run lint
```

Result: PASS. ESLint 0 problems, 0 warnings.

```bash
npm run typecheck
```

Result: PASS. `tsc --noEmit` completed successfully.

```bash
npm run build
```

Result: PASS. Next.js production build completed. 18 static/dynamic pages, no errors.

```bash
npm run test:unit
```

Result: PASS. Summary: 39 test files, 440 tests passed.

New Phase 04 unit test coverage in `src/features/disclosures/pdf-ai-parser.test.ts` (78 tests):

**`validateAiOutput` - schema validation (21 tests):**
- Rejects non-JPY currency (including missing)
- Rejects invalid `event_type` enum
- Rejects invalid `change_type` enum
- Rejects invalid `status` enum
- Rejects negative `dividend_per_share` and `previous_dividend_per_share`
- Accepts null dividend amounts
- Rejects confidence score outside [0, 1]; accepts exactly 0 and 1
- Rejects invalid date formats (record_date, ex_dividend_date, expected_payment_date)
- Accepts null `ex_dividend_date` (not calculated from record_date)
- Accepts explicit `ex_dividend_date` when present in disclosure
- Rejects invalid `expected_payment_month` outside 1–12
- Adds ticker_mismatch warning without failing validation
- Rejects non-object, non-array input
- Rejects missing evidence_text

**`adjustEventConfidenceAndPriority` - confidence and priority routing (10 tests):**
- Keeps normal priority for clean events
- Sets `urgent` for no_dividend, `high` for decrease
- Reduces confidence and flags suspicious large dividends (>10000)
- Sets high priority when adjusted confidence < 0.6
- Reduces confidence for missing amount, missing payment date/month
- Reduces confidence and sets high priority for ticker_mismatch warning
- Sets high priority for special/commemorative components breakdown
- Clamps adjusted confidence to [0, 1]

**`buildReviewRows` - review row creation (13 tests):**
- Creates one review row per AI event
- Includes `event_index` in each review `raw_payload`
- Marks `annual_total` as `is_payable: false`, `year_end`/`interim` as `is_payable: true`
- Stores `components` breakdown in `raw_payload`
- Sets `needs_manual_check` status when AI says so or urgent priority
- Stores warning_message from adjusted warnings
- Stores `text_extraction_method` and `section_trimmed` in `raw_payload` AI summary
- Stores `direct_pdf_fallback` method and `fallback_reason`
- Links all rows through `disclosure_id`
- Includes validation warnings (e.g. ticker_mismatch) in review payload

**`buildNoEventsManualCheckRow` (1 test):**
- Creates a `needs_manual_check` row with no event fields, confidence 0, and `no_events_found: true`

**`isTextUsable` (4 tests):**
- Returns true for Japanese text >= 50 chars with Japanese characters
- Returns false for empty, too-short text, and ASCII-only text

**`trimToDividendSections` (2 tests):**
- Returns full text unchanged when no dividend keywords found
- Trims to dividend section starting from first keyword match

**`prepareTextForAI` (3 tests):**
- ASCII-only text → direct_pdf_fallback (no Japanese chars)
- PDF with no text objects → direct_pdf_fallback
- Empty PDF → fallback reason `empty_text_extraction`

**`isStrongDividendDisclosure` (6 tests):**
- Returns true for `dividend_forecast_revision`, `dividend_decision`, `correction` types
- Returns true for titles containing strong keywords (増配, 無配, 剰余金の配当)
- Returns false for `earnings_release` without strong keywords
- Returns false for `other` type without strong keywords

**`executeParseDisclosurePdfAi` - integration with mocked deps (15 tests):**
- Successful parse: increments attempts, creates reviews, marks disclosure parsed
- Multiple review rows for multi-event AI response (3 events → 3 rows)
- Non-retryable error for missing disclosure_id in job payload
- Non-retryable error for missing storage_path (invalid dependency state)
- Non-retryable error for invalid AI JSON response
- Non-retryable error for invalid AI output schema (non-JPY currency)
- Manual-check row for strong disclosure with no AI events
- No review rows for non-strong disclosure with no AI events
- Low confidence → high priority in raw_payload
- Ticker mismatch warning propagated to review
- Explicit `ex_dividend_date` stored correctly
- Null `ex_dividend_date` stored as null (not calculated)
- Suspicious large amount → warning + reduced confidence + high priority
- Direct PDF fallback when text extraction fails (reflected in raw_payload summary)
- Disclosure marked as parsed on success

**Regression tests (5 tests):**
- Review rows from `buildReviewRows` have status `pending` or `needs_manual_check`, never `approved`
- `buildNoEventsManualCheckRow` has status `needs_manual_check`, not `approved`
- 3 AI events create exactly 3 review rows with distinct event types
- All review rows linked to same `disclosure_id`
- Event indices are unique across rows from same response

## Manual Verification Notes

### Special/Commemorative Breakdown (from plan requirement)

Verified via unit test: a single `year_end` event with `components: { ordinary: 120, special: 30 }` creates exactly one review row, with the breakdown stored in `raw_payload.components`. There is no separate event created for the special component. This matches the plan requirement: "include special/commemorative components in a breakdown for the payable interim/year-end event when they are part of the same declared dividend."

### earnings_release Multi-Event Rows (from plan requirement)

Verified via unit test: a 3-event AI output (interim, year_end, annual_total) creates 3 separate review rows linked by `disclosure_id`. The `annual_total` row is marked `is_payable: false` in `raw_payload`. This matches the plan requirement: "create exactly one `dividend_reviews` row for each valid AI `events[]` item, including `annual_total`."

### Missing storage_path = Invalid Dependency State (from plan requirement)

Verified via unit test: a parse job for a disclosure with `storage_path: null` throws `invalid_dependency_state:missing_storage_path` with `retryable: false`, not a retryable AI failure. This matches the plan requirement: "if a parse job exists without storage path, mark it as an invalid dependency state rather than treating it as a normal retryable AI failure."

### ex_dividend_date Never Calculated (from plan requirement)

Verified via unit tests:
- `ex_dividend_date: null` is stored as `null` (not calculated from record_date)
- `ex_dividend_date: "2026-03-27"` (explicit from disclosure) is stored correctly
- Validation rejects non-YYYY-MM-DD date formats

### User-Facing Safety (regression test)

Verified via regression tests: all review rows produced by Phase 04 have status `pending` or `needs_manual_check`. No review row enters with status `approved`. User-facing `dividend_events` reads only approved events per the existing RLS, so no Phase 04 data leaks to users before admin approval.

## Skipped Checks

- `npm run test:integration`: Network access to Supabase not available. Same rationale as Phase 03. The Phase 04 logic is exercised by 78 unit tests with mocked OpenAI boundaries.
- Live OpenAI Responses API call: `OPENAI_API_KEY` not available in sandbox. The API integration is isolated behind the `callOpenAI` dependency, which is mocked in all unit tests.

## Architecture Notes

- `supabase/functions/_shared/pdf-ai-parser.ts`: New shared module with all AI parsing logic (text extraction, prompt building, validation, confidence adjustment, review row construction).
- `supabase/functions/process-jobs/index.ts`: Updated to register `parse_disclosure_pdf_ai` handler alongside the existing `download_disclosure_pdf` handler. The `callOpenAIResponsesApi` function in `index.ts` uses `Deno.env.get` for `OPENAI_API_KEY` and `OPENAI_MODEL`, keeping secrets in Edge Function scope only.
- The `openaiModel` field is passed from the Edge Function via `AiParseDependencies` so the shared module never calls `Deno.env.get` (which would break Node.js tests).
- No browser code is involved; all AI calls are Edge Function server-side only.
