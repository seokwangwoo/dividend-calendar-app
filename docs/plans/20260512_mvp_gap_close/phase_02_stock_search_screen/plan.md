# Phase 02: Stock Search Screen

## Goal

Provide users with a dedicated `/app/stocks/search` screen so they can discover any listed stock, view its basic dividend information, and reach the stock detail or portfolio-add flow without first adding a holding. Two CTA entry points are also added: one on the portfolio header and one on the notifications empty state.

## Prerequisites

- Phase 01 Completion Criteria are met.
- `searchStocksAction` in `src/features/stocks/actions.ts` and `searchStocks` in `src/features/stocks/queries.ts` are stable and return `StockRow[]` filtered to non-delisted stocks.
- `/app/stocks/[stockId]/page.tsx` and `/app/stocks/[stockId]/notification-rule/page.tsx` are functional.

## Implementation Scope

### 1. `/app/stocks/search` page

- Create `src/app/app/stocks/search/page.tsx` as a **Client Component** page (search is interactive).
- The page uses `searchStocksAction` as the search handler; reuse the same pattern used in `NewHoldingForm`.
- Search input: debounced text field with placeholder `銘柄名またはコードで検索`.
- Results list: for each `StockRow` returned, render a card with:
  - `ticker` + `name`
  - `market_segment` (e.g., TSE Prime)
  - `expected_dividend_yield` formatted as `X.XX%` if not null; otherwise show `配当データ確保中`
  - `[상세 보기]` link → `/app/stocks/${stock.id}`
  - `[보유 추加]` link → `/app/portfolio/new?stockId=${stock.id}` (pre-fill, see §4)
- `support_status = 'delisted'` stocks are already excluded by the existing query; no extra filter needed.
- `support_status = 'unsupported'` stocks show `配当データ確保中` in place of yield; both action buttons are still present.
- Empty query state: show instructional text, no results list.
- No results state: show `該当する銘柄が見つかりませんでした`.

### 2. Portfolio screen CTA

- In `src/app/app/portfolio/page.tsx` (or its client component), add a `[종목 검색]` button in the page header area, linking to `/app/stocks/search`.
- Place it alongside the existing `[+ 추가]` button that links to `/app/portfolio/new`.

### 3. Notifications empty state CTA

- In `src/app/app/notifications/page.tsx` (or its empty-state component), change the existing empty-state CTA to `[알림을 설정할 종목 찾기]` linking to `/app/stocks/search`.
- If no CTA currently exists, add one.

### 4. Portfolio/new `?stockId` pre-fill

- Update `src/app/app/portfolio/new/page.tsx` to read the `stockId` search param.
- Pass the pre-selected stock to `NewHoldingForm` via an `initialStockId` prop.
- In `NewHoldingForm`, if `initialStockId` is provided, fetch the stock with `getStockById` and pre-populate the stock selection field, skipping the search step.
- If the stock is not found or is delisted, render the form in the default empty state with no pre-fill.

### 5. Archive resolved issue

- Move `docs/issue/active/20260510-missing-stock-search-route-for-alert-entry.md` to `docs/issue/archive/`.
- Update `docs/issue/README.md`.

## Core Tasks

1. **Search page**
   - Create `src/app/app/stocks/search/page.tsx`.
   - Implement debounced search input and results list.
   - Render stock cards with yield, market segment, and two action buttons.

2. **Portfolio CTA**
   - Add `[종목 검색]` link button to the portfolio page header.

3. **Notifications empty state CTA**
   - Add or update the notifications empty state to link to `/app/stocks/search`.

4. **Portfolio/new pre-fill**
   - Read `searchParams.stockId` in `portfolio/new/page.tsx`.
   - Pass `initialStockId` to `NewHoldingForm`; fetch and pre-populate on mount.

5. **Archive issue**
   - Move issue file; update `README.md`.

## Test Plan

- Run `npm run lint` — no warnings.
- Run `npm run typecheck` — no errors.
- Run `npm run build` — succeeds.
- Run `npm run test:unit` — all tests pass.
- Manual: navigate to `/app/stocks/search`; type `KDDI`; verify card shows ticker, name, yield, market segment, and both buttons.
- Manual: click `[상세 보기]` on a result; verify navigation to `/app/stocks/:stockId`.
- Manual: click `[보유 추加]` on a result; verify navigation to `/app/portfolio/new` with the stock pre-selected.
- Manual: navigate to `/app/portfolio`; verify `[종목 검색]` button is visible in the header and navigates to `/app/stocks/search`.
- Manual: navigate to `/app/notifications` with no notifications; verify CTA `[알림을 설정할 종목 찾기]` is visible and navigates to `/app/stocks/search`.
- Manual: search for a ticker with `support_status = 'unsupported'`; verify `配当データ確保中` is displayed and both buttons are still present.

## Completion Criteria

- `src/app/app/stocks/search/page.tsx` exists and renders a functional search UI.
- Portfolio header contains a `[종목 검색]` link to `/app/stocks/search`.
- Notifications empty state contains a CTA linking to `/app/stocks/search`.
- `/app/portfolio/new?stockId=<valid-id>` pre-selects the specified stock in the form.
- `20260510-missing-stock-search-route-for-alert-entry.md` is in `docs/issue/archive/`.
- All four active issues are now archived.

## Excluded From This Phase

- Watchlist or "관심 종목" feature (Phase 2+).
- Search pagination or infinite scroll (current `searchStocks` limit is sufficient for MVP).
- Bottom-nav tab for search (policy: 5-tab layout is maintained).
- Dedicated stock comparison or analysis views.
- CSV import (Phase 03).
