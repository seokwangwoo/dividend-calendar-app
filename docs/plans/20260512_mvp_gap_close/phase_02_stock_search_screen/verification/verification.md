# Verification: phase_02_stock_search_screen

## Automated Checks

### npm run lint
Result: PASS (exit code 0, no warnings)

### npm run typecheck
Result: PASS (exit code 0, no type errors)

### npm run build
Result: PASS — all 19 routes compiled successfully
- `/app/stocks/search` appears as a new static route (1.78 kB bundle)
- `/app/portfolio/new` updated to `ƒ` (dynamic, reads searchParams)
- No compilation errors

### npm run test:unit
Result: 46 pre-existing failures, 0 new failures introduced
- `Test Files  5 failed | 40 passed (45)` — same count as on main branch before changes
- Pre-existing failures are in `parser-fixtures.test.ts` and `stocks/queries.test.ts`, unrelated to phase 02 scope
- No new test files or test cases were regressed by the phase 02 changes

## Files Changed

### New files
- `src/app/app/stocks/search/page.tsx` — Client Component search page with debounced search via `useStockSearch` + `searchStocksAction`

### Modified files
- `src/app/app/portfolio/page.tsx` — Added `[종목 검색]` link button in header alongside existing `[+ 銘柄追加]`
- `src/app/app/notifications/page.tsx` — Added `actionHref="/app/stocks/search"` and `actionLabel="알림을 설정할 종목 찾기"` to the empty state `EmptyState` component
- `src/app/app/portfolio/new/page.tsx` — Now reads `searchParams.stockId`, fetches stock via `getStockById`, passes `initialStock` to `NewHoldingForm` (null if not found or delisted)
- `src/features/holdings/components/new-holding-form.tsx` — Added `initialStock` prop; uses it as `useState` initial value; `useEffect` on mount sets search query to `initialStock.name` when provided
- `docs/issue/archive/20260510-missing-stock-search-route-for-alert-entry.md` — Moved from active/, status updated to `resolved`, `resolved: 2026-05-12` added
- `docs/issue/README.md` — Active issues table cleared (no open issues), archive table updated to include the resolved feature issue

## Manual Verification (Static Analysis)

### `/app/stocks/search` page
- `"use client"` directive present — correct for interactive search
- `useStockSearch(searchStocksAction)` — reuses the exact pattern from `NewHoldingForm`
- Debounce: provided by `useStockSearch` hook (250ms, via `useQuery`)
- Input placeholder: `銘柄名またはコードで検索` — matches plan spec
- `formatYield()` returns `X.XX%` (2 decimal places, e.g. `(0.0312 * 100).toFixed(2) + "%"` = `"3.12%"`) or `"配当データ確保中"` when `expected_dividend_yield` is null — matches plan spec for both `supported` and `unsupported` stocks
- `market_segment` rendered as `<p>` under name/ticker when non-null
- `[상세 보기]` link → `/app/stocks/${stock.id}` — correct
- `[보유 추가]` link → `/app/portfolio/new?stockId=${stock.id}` — correct
- Empty query state: "銘柄名またはコードを入力してください" displayed when `query.trim().length === 0` and not loading
- No results state: `該当する銘柄が見つかりませんでした` displayed when non-empty query, not loading, 0 results
- Delisted stocks: excluded by `searchStocks` query (`support_status IN ('supported', 'unsupported')`) — no extra filter needed in the page

### Portfolio page header
- `[종목 검색]` link added as a child of `PageHeader` — renders in the flex `div` alongside `[+ 銘柄追加]` and `CsvImportSection`
- Links to `/app/stocks/search` — correct

### Notifications empty state
- `EmptyState` now receives `actionHref="/app/stocks/search"` and `actionLabel="알림을 설정할 종목 찾기"`
- `EmptyState` component renders a `<Link>` to the href when both props are provided — confirmed from component source

### Portfolio/new pre-fill
- `searchParams` typed as `Promise<{ stockId?: string }>` — correct Next.js 15 pattern
- `getStockById(stockId)` called server-side; result is null if not found (`PGRST116`) or if `support_status === 'delisted'`
- `initialStock` passed as prop to `NewHoldingForm`
- `NewHoldingForm` `useState<StockRow | null>(initialStock)` — pre-populates `selectedStock` on mount
- `useEffect` sets search query to `initialStock.name` on mount — so the input field shows the stock name when pre-filled
- Delisted guard: `stock.support_status !== "delisted"` check in `new/page.tsx`; `getStockById` can return delisted stocks, so this guard is important and present

### Issue archive
- File moved from `docs/issue/active/` to `docs/issue/archive/`
- Front matter updated: `status: resolved`, `resolved: 2026-05-12`
- `docs/issue/README.md` active table now shows "미해결 이슈 없음", archive table includes the resolved entry
