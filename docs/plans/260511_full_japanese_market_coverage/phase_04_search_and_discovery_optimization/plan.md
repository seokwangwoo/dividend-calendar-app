# Phase 04: Search and Discovery Optimization

## Goal

Ensure frontend search remains fast and usable with 4,000+ stocks.

## Prerequisites

- Phase 03 Completion Criteria are met.
- `/app/stocks/search` route and stock search query exist.

## Implementation Scope

- Database search optimization.
- Frontend query tuning and UX.

## Core Tasks

1. **Database search indexes**
   - Enable `pg_trgm` extension.
   - Add GIN index on `stocks(name)` for prefix matching (`keyword%`).
   - Add B-tree prefix index on `stocks(ticker)` (cast numeric ticker to text for prefix search).
   - Do **not** use leading-wildcard `%keyword%` search; rely on prefix match only.

2. **Search query tuning**
   - Update the Supabase query to use `ilike 'keyword%'` with `limit` (20) and `order by ticker`.
   - Exclude `support_status = 'delisted'` from search results.
   - Return `market_segment` in search results for user context.
   - Ensure the query uses the new GIN/B-tree indexes.

3. **Frontend debouncing and caching**
   - Ensure search input debounce is in place (200–300ms).
   - Add TanStack Query cache for recent search results to reduce repeated identical queries.

4. **Unsupported / delisted stock UX**
   - `unsupported` stocks: searchable, labeled clearly (`현재 미지원`).
   - `delisted` stocks: not returned in search results at all.
   - Ensure users cannot set notification rules on stocks without `expected_annual_dividend_per_share` data.

## Test Plan

- Search for common prefixes (e.g., 'ソフト', '9433') and verify < 300ms response in staging.
- Run Playwright/E2E search flow if available.
- Run `npm run lint` and `npm run typecheck`.

## Completion Criteria

- Search returns results in < 500ms for any ticker or name query.
- All 4,000+ stocks are searchable.
- Unsupported stocks are clearly labeled.
- Search query uses new indexes.

## Excluded From This Phase

- Advanced filters (sector, market cap).
- Autocomplete API server.
- Search result ranking/relevance tuning beyond exact prefix match.
