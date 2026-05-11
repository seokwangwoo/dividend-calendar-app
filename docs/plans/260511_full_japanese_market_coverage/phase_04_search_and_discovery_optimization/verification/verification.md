# Phase 04 Verification Evidence

## Phase Information
- **Phase file**: `docs/plans/260511_full_japanese_market_coverage/phase_04_search_and_discovery_optimization/plan.md`
- **Verification date**: 2026-05-11
- **Environment**: Local development (worktree `../dividend-calendar-app-wt-04`)

## Test Plan Verification

### 1. Database Search Indexes
- **Migration created**: `supabase/migrations/20260511000300_phase_04_search_and_discovery_optimization.sql`
- **Changes verified**:
  - `pg_trgm` extension enabled
  - `idx_stocks_name_gin` GIN index on `stocks(name)` using `gin_trgm_ops`
  - `idx_stocks_ticker_prefix` B-tree index on `stocks(ticker)` using `text_pattern_ops`
  - `idx_stocks_search` composite index on `(support_status, ticker)`

### 2. Search Query Tuning
- **File updated**: `src/features/stocks/queries.ts`
- **Changes verified**:
  - Changed from `%keyword%` to `keyword%` prefix match for `ticker`, `name`, `name_en`
  - Added `.neq("support_status", "delisted")` to exclude delisted stocks
  - Removed `.order("support_status")` to simplify query; ordering by `ticker` only
  - Limit remains 20
  - Selects all columns for full `StockRow` type compatibility

### 3. Frontend Debouncing and Caching
- **File created**: `src/features/stocks/use-stock-search.ts`
- **Changes verified**:
  - Uses `@tanstack/react-query` `useQuery` with `queryKey: ["stockSearch", debouncedQuery]`
  - Debounce delay: 250ms (`DEBOUNCE_MS = 250`)
  - Stale time: 30 seconds
  - Returns `{ query, setQuery, results, isLoading, clearResults }`

- **File created**: `src/components/providers/react-query-provider.tsx`
- **Changes verified**:
  - `QueryClientProvider` wraps app layout with `staleTime: 30_000` and `refetchOnWindowFocus: false`

- **File updated**: `src/app/app/layout.tsx`
- **Changes verified**:
  - Includes `ReactQueryProvider` wrapper

- **File updated**: `src/features/holdings/components/new-holding-form.tsx`
- **Changes verified**:
  - Replaced manual search state with `useStockSearch` hook
  - Search triggers automatically on input change (debounced)
  - Removed manual search button and Enter key handler
  - Shows loading indicator during search

### 4. Unsupported / Delisted Stock UX
- **File updated**: `src/features/holdings/components/new-holding-form.tsx`
- **Changes verified**:
  - `delisted` stocks excluded from search results (via query filter)
  - `unsupported` stocks remain searchable and are labeled with `Badge variant="warning"`
  - Label updated from "現在MVP未対応" to "現在未対応"
  - `market_segment` displayed next to ticker for user context
  - Selection button disabled for unsupported stocks

### 4a. Notification Rules Validation
- **File updated**: `src/features/notifications/actions.ts`
- **Changes verified**:
  - `saveNotificationRule` validates that stock has `expected_annual_dividend_per_share` data
  - Throws error if stock lacks dividend data: "この銘柄には配当データがないため、通知ルールを設定できません。"

### 5. Lint / Typecheck
- **Command**: `npm run lint`
- **Result**: PASS (zero warnings)
- **Command**: `npm run typecheck`
- **Result**: PASS (no errors)

### 6. Search Response Time Verification
- **Command**: Search for common prefixes and verify < 300ms response in staging
- **Result**: SKIPPED
- **Reason**: No staging environment with 4,000+ stocks available in local development.

### 7. E2E Search Flow
- **Command**: Run Playwright/E2E search flow
- **Result**: SKIPPED
- **Reason**: E2E tests require a running dev server and browser environment not available in this sandbox.

## Summary

All Phase 04 implementation items are complete. Lint and typecheck pass. Response time and E2E verification deferred to staging.
