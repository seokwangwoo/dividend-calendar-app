# Full Japanese Market Coverage Plan

## Purpose

Expand the app's stock universe from the current curated set of ~35 dividend-focused stocks to the full list of Japanese exchange-listed equities (~3,800+ tickers). This makes every TSE/JPX stock searchable, trackable for price, and eligible for dividend data collection and admin review.

## Source Specifications

- `docs/dividend_app_mvp_backend_spec.md`
- `docs/dividend_app_wireframe.md`
- `docs/dividend_calendar_mvp_plan.md`

## Fixed Full-Market Stack

| Area | Decision |
|---|---|
| Frontend | Next.js App Router |
| Language | TypeScript |
| Database | Supabase PostgreSQL |
| API | Supabase Edge Functions |
| Scheduler | GitHub Actions Cron |
| Price Source | Stooq (individual ticker JSON) |
| Disclosure Source | Yanoshin TDnet list API |
| Stock Master | JPX "List of TSE-listed Issues" XLS → CSV (monthly manual upload) |

## Scope

Must include:

- Import full JPX/TSE listed stock master into `stocks`.
- Bulk price refresh pipeline for ~4,000 tickers.
- Scaled dividend disclosure collection covering all tickers.
- Search/discovery optimization for large catalog.
- Revised `support_status` policy for full-market holdings.
- Performance monitoring and admin batch-review aids.

Excluded from this plan:

- Real-time tick-by-tick price updates.
- US stocks, ETFs, or foreign markets.
- Automatic dividend approval without admin review.
- Paid data APIs (e.g., official TDnet API subscription).
- Separate search engine (Meilisearch/Elasticsearch).

## Phase Order

1. [Phase 01: Full Market Stock Master Import](./phase_01_full_market_stock_master_import/plan.md)
2. [Phase 02: Bulk Price Refresh Pipeline](./phase_02_bulk_price_refresh_pipeline/plan.md)
3. [Phase 03: Scaled Dividend Data Collection](./phase_03_scaled_dividend_data_collection/plan.md)
4. [Phase 04: Search and Discovery Optimization](./phase_04_search_and_discovery_optimization/plan.md)
5. [Phase 05: Support Policy and Notification Expansion](./phase_05_support_policy_and_notification_expansion/plan.md)
6. [Phase 06: Performance Monitoring and Validation](./phase_06_performance_monitoring_and_validation/plan.md)

## Development Rules

- Implement phases in order unless a blocker requires a narrow prerequisite task.
- Keep all user-owned data behind Supabase RLS.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
- Treat `未定` as unknown, not as zero.
- Use investment-neutral wording.
- Every stock in `stocks` must be searchable; only approved dividend data may be used for calculations.

## Common Domain Terms

| Term | Meaning |
|---|---|
| Full market | All JPX/TSE listed common stocks (~3,800+ tickers) |
| Stock master | Canonical ticker, name, exchange, market segment list |
| Batch price refresh | Daily bulk update of `current_price` for all tickers |
| Scaled collection | TDnet disclosure scanning expanded to all market tickers |

## Plan Completion Definition

The plan is complete when:

- A user can search and find any TSE-listed stock by ticker or name.
- Any found stock can be added to a portfolio.
- Daily price refresh covers all imported stocks.
- Dividend disclosure collection scans the full market.
- Search remains performant (< 1s) with 4,000+ stocks.
- Admin review UI supports higher-volume inspection.

## Document Maintenance

- If the implementation diverges from these files, update the affected phase document before continuing.
- Keep each phase document below 500 lines.
- Add follow-up work to a later plan rather than expanding current plan scope.
