# Phase 03: Scaled Dividend Data Collection

## Goal

Expand the TDnet/Yanoshin disclosure collection pipeline from a curated subset to the full market without unbounded cost or admin overload.

## Prerequisites

- Phase 02 Completion Criteria are met.
- `collect-disclosures` and `process-jobs` Edge Functions exist.
- `jobs` table has indexes on `status` and `run_after`.

## Implementation Scope

- Adjust disclosure collection filters for full-market coverage.
- Add cost/budget guards on AI parsing.
- Improve admin-review triage for high volume.

## Core Tasks

1. **Collection scope expansion**
   - Update `collect-disclosures` to scan disclosures for all tickers via Yanoshin list API.
   - Increase collection frequency: 1-hour intervals (currently 3 times daily → 24 times daily).
   - Keep limit at 300 per call; full market coverage is achieved by frequency, not per-call volume.
   - Preserve title/keyword filters to avoid collecting irrelevant filings.
   - Ensure `disclosures.external_id` unique constraint prevents duplicates across expanded volume.

2. **AI parsing cost controls**
   - Implement daily call cap instead of exact token budget prediction:
     - Phase 1 (first 1–2 weeks): log every `parse_disclosure_pdf_ai` call’s `input_tokens`/`output_tokens` into `disclosures` table columns `ai_parse_input_tokens`, `ai_parse_output_tokens`, `ai_parse_cost_usd`.
     - Phase 2 (after measurement): calculate average cost per call per model (gpt-4o-mini vs gpt-4o).
     - Phase 3 (ongoing): enforce `DAILY_AI_PARSE_CALL_CAP` based on target budget (e.g., $5/day ÷ $0.02 avg = 250 calls/day).
   - Single-call guard: if `input_tokens` exceeds 50,000, abort parsing and mark `parse_status = "failed"` with reason `excessive_tokens`.
   - Environment variable `DAILY_AI_PARSE_BUDGET_USD` (default: 5.0) and `DAILY_AI_PARSE_CALL_CAP` (default: 250).

3. **Parsing priority queue**
   - Priority 1 (highest): tickers with active holdings (`deleted_at IS NULL`).
   - Priority 2: `supported` stocks with approved dividend history.
   - Priority 3: all other tickers.
   - `jobs` table `type = "parse_disclosure_pdf_ai"` rows are ordered by priority before `run_after`.
   - When daily call cap is reached, remaining pending parse jobs stay in queue for the next day.
   - Configurable toggle `SKIP_UNHELD_UNPARSED` (default: false for first 2 weeks, then true if needed).

4. **Job queue scaling**
   - Ensure `jobs` table indexes support high-volume `pending` queues.
   - Add a maximum pending queue depth guard (e.g., 500); pause new `collect_disclosures` runs if queue exceeds threshold.

5. **Admin triage improvements**
   - Enhance `dividend_reviews` list query with bulk filters (ticker range, priority, date).
   - Add quick actions (batch reject obvious mismatches) in the admin UI or via Edge Function.

## Test Plan

- Run `collect-disclosures` in staging and verify it collects filings for low-profile tickers.
- Verify `jobs` pending count stays manageable with priority ordering.
- Run `npm run lint` and `npm run typecheck`.

## Completion Criteria

- Disclosure collection discovers filings for any TSE-listed ticker.
- AI parsing budget is capped per run.
- Job queue processes high-priority items first.
- Admin can filter reviews by ticker and priority.

## Excluded From This Phase

- Automatic approval of any AI result.
- XBRL parsing.
- Separate backend server for parsing.
- Real-time disclosure streaming.
