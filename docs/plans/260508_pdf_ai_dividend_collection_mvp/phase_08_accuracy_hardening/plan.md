# Phase 08: Accuracy Hardening

## Goal

Improve parser reliability, operator confidence, and regression coverage after the end-to-end MVP works, without expanding into a full XBRL parser or all-disclosure automation.

## Prerequisites

- Phase 07 Completion Criteria are met.
- At least several representative dividend revision, dividend decision, earnings release, correction, and no-dividend fixtures are available from real or sanitized TDnet PDFs/text.
- Admin review feedback from earlier phases identifies common false positives or extraction failures.

## Implementation Scope

- Build a small fixture-based parsing test set for known TDnet disclosure patterns.
- Improve earnings-release dividend table extraction, section trimming, and OpenAI prompt selection.
- Compare AI results against existing approved `dividend_events` to detect large differences.
- Improve correction disclosure handling and priority routing.
- Evaluate direct OpenAI PDF input, page-image input, or OCR only for fixture-proven cases where extracted-text-first parsing fails.
- Add optional XBRL URL metadata capture only as future validation context, not a full parser.
- Add admin-visible parser diagnostics for repeated failure modes.

## Core Tasks

1. **Parser fixture test set**
   - Add sanitized text/PDF fixtures for `配当予想の修正`, `剰余金の配当`, `決算短信`, `訂正`, `無配`, `復配`, `特別配当`, and `記念配当` cases, including cases where special/commemorative amounts are included in an interim/year-end total and rare cases where ex-dividend date is explicitly disclosed.
   - Store expected normalized JSON outputs without relying on live AI calls.
   - Add tests around validation and one-review-per-event review creation using mocked AI responses for each fixture.

2. **Earnings-release extraction refinement**
   - Improve deterministic text sectioning for `配当の状況`, `1株当たり配当金`, and `年間配当金` before OpenAI calls.
   - Reduce AI input to relevant sections when those headings are found.
   - Ensure `第2四半期末`, `期末`, `合計`, `年間`, `当期実績`, `前期実績`, and `次期予想` are represented correctly in event type/status mapping, with `合計`/`年間` mapped to reference-only `annual_total`.

3. **Existing-event comparison**
   - Compare candidate values with existing approved events for the same stock/fiscal year/event type, and compare `annual_total` against summed payable interim/year-end candidates when both are present.
   - Add warnings and high priority when differences exceed a documented threshold.
   - Keep comparison as admin triage metadata; do not auto-reject or auto-approve based on difference.

4. **Correction handling**
   - Ensure correction disclosures link to the original disclosure when source metadata makes that possible.
   - Route corrections to high priority by default.
   - Preserve raw correction context in review payload for admins.

5. **Fallback evaluation**
   - Compare extracted-text-first results with direct OpenAI PDF fallback only on curated failure fixtures.
   - Promote any direct PDF/page-image/OCR fallback to normal workflow only after documenting cost and accuracy tradeoffs.

6. **Confidence tuning**
   - Adjust deterministic confidence scoring based on real false-positive/false-negative examples, especially special/commemorative breakdown extraction and duplicate-count prevention.
   - Add tests for suspicious values above 1000 JPY per share, missing evidence, missing event type, warnings, and payment-date presence.

7. **Operational diagnostics**
   - Add admin-visible counts or filters for repeated parse errors, low-confidence reviews, and disclosures with no dividend info found.
   - Keep diagnostics lightweight and based on existing tables.

## Test Plan

- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `npm run test:unit`.
- Run `npm run test:integration`.
- Run `npx playwright test --workers=1` for affected admin diagnostics if UI is changed.
- Manual verification:
  - Run parser fixtures through the mocked parse workflow and compare expected review outcomes.
  - Review a correction disclosure and confirm high-priority routing.
  - Confirm large differences from existing events are visible to admins as warnings.

## Completion Criteria

- Representative parser fixtures cover the major disclosure categories in the MVP specification.
- Earnings-release parsing focuses on dividend tables and avoids unrelated financial metrics.
- Large differences from existing approved events create admin warnings and high-priority review routing.
- Correction disclosures are clearly identified and prioritized.
- Direct PDF/page-image/OCR fallback remains evidence-driven, special/commemorative separate payable-event handling remains fixture-driven, any future ex-dividend-date calculation requires a separate Japanese market calendar decision, and confidence scoring is covered by tests that reflect observed MVP failure modes.

## Excluded From This Phase

- Full XBRL parser implementation.
- Automated approval based on confidence alone.
- Parsing all TDnet disclosure categories.
- Historical backfill beyond fixture-driven verification.
- New backend infrastructure outside Supabase Edge Functions.
