# Phase 06: Performance Monitoring and Validation

## Goal

Validate that the full-market system performs acceptably under real load and document operational runbooks.

## Prerequisites

- Phase 05 Completion Criteria are met.
- Staging environment has the full stock catalog and at least one test user with 20+ holdings.

## Implementation Scope

- Load/performance testing of search and RPCs.
- Monitoring dashboards and alerts.
- Operational runbooks for price refresh and disclosure collection.

## Core Tasks

1. **Performance baseline**
   - Measure search latency (p50, p95) with 4,000+ stocks.
   - Measure home/calendar RPC latency with a test user holding 20+ stocks across mixed data-availability tickers.
   - Document baseline in `docs/plans/260511_full_japanese_market_coverage/phase_06_performance_monitoring_and_validation/verification/` after testing.

2. **Admin monitoring**
   - Add an admin RPC or view for daily disclosure counts, parse costs, and review queue depth.
   - Add an admin view for price refresh failure summary by batch.

3. **Runbooks**
   - Document how to re-run stock master import (CSV upload path, dry-run, actual run).
   - Document how to handle Stooq rate-limit blocks (reduce chunk size, increase `STOOQ_REQUEST_DELAY_MS`, check consecutive failure logs).
   - Document OpenAI budget alert response (pause parsing, prioritize holdings-only, adjust `DAILY_AI_PARSE_CALL_CAP`).
   - Document `process-price-refresh` workflow manual invocation and loop behavior.

4. **Acceptance testing**
   - Run full E2E flow: search full-market ticker -> add holding -> view calendar -> verify no crash.
   - Verify daily Cron completes without timeout for 3 consecutive business days.
   - Verify disclosure collection does not create unbounded `jobs` queue growth.

## Test Plan

- Run E2E scenarios (search, holding creation, calendar).
- Monitor staging Cron jobs for 3 days.
- Run `npm run lint`, `npm run typecheck`, `npm run build`.
- Run existing test suite to catch regressions.

## Completion Criteria

- Search p95 < 1s.
- Home/calendar RPC p95 < 2s.
- Daily price refresh succeeds for 3 consecutive business days without timeout.
- Disclosure collection runs without unbounded queue growth.
- Admin runbooks are written and committed to `docs/ops/`.
- No regressions in existing MVP acceptance tests.

## Excluded From This Phase

- Production traffic load testing (requires real users).
- Redesign of frontend architecture.
- Migration to a separate backend server.
