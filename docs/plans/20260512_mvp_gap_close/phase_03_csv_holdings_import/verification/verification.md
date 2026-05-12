# Phase 03 Verification: CSV Holdings Import

## Date
2026-05-12

## Changed Files

- `src/features/holdings/actions.ts` — added duplicate detection to `previewCsvHoldings`, updated `commitCsvHoldings` to skip duplicates and return `{ insertedCount, skippedCount }`, added `CsvPreviewRow` type with `isDuplicate: boolean`, added `buildExistingHoldingKeys` helper
- `src/features/holdings/components/csv-import-page.tsx` — NEW: full 3-step upload → preview → result flow as dedicated client component with `重複スキップ` badge, `有効` badge, CSV format documentation, inserted/skipped counts in result
- `src/app/app/portfolio/import/page.tsx` — NEW: Server Component shell for `/app/portfolio/import` route that renders `CsvImportPage`
- `src/app/app/portfolio/page.tsx` — removed `<CsvImportSection />` inline embed, removed import; added `[CSVインポート]` link to `/app/portfolio/import`

## Checks Run

### `npm run typecheck`
```
PASS — no TypeScript errors
```

### `npm run lint`
```
PASS — no warnings, exit 0
```

### `npm run build`
```
PASS — Next.js build succeeds
Route /app/portfolio/import (Static) is listed in the build output
```

### `npm run test:unit`
```
Test Files: 5 failed | 40 passed (45)
Tests: 46 failed | 557 passed (603)

Note: 46 failures are pre-existing (same count as main branch before phase 03 changes).
No new failures introduced by this phase.
```

## Completion Criteria Verification

### 1. `previewCsvHoldings` returns `isDuplicate: true` for duplicate rows
- Implemented in `buildExistingHoldingKeys`: queries `holdings` WHERE `user_id = auth.uid()` AND `deleted_at IS NULL`, builds a Set of `"${stock_id}:${account_type}"` keys
- Each `previewRow` in `CsvPreviewResult.previewRows` is typed as `CsvPreviewRow` which includes `isDuplicate: boolean`
- Duplicate detection runs in parallel with stock map resolution for efficiency

### 2. `commitCsvHoldings` skips duplicates and returns `{ insertedCount, skippedCount }`
- Re-runs `buildExistingHoldingKeys` before inserting to get fresh data
- Filters out duplicate rows: `nonDuplicateRows = allRows.filter(row => !existingKeys.has(...))`
- Returns `{ insertedCount: nonDuplicateRows.length, skippedCount: allRows.length - nonDuplicateRows.length }`
- Does NOT throw when `errors.length > 0` check is about parse errors (unrelated to duplicates)

### 3. `/app/portfolio/import` is accessible and shows three-step flow
- `src/app/app/portfolio/import/page.tsx` renders `<CsvImportPage />`
- `CsvImportPage` implements: Step 1 (Upload with file picker + paste textarea), Step 2 (Preview table with status badges), Step 3 (Result with inserted/skipped counts)
- Build output confirms route `/app/portfolio/import` (Static)

### 4. Duplicate rows visible in preview with `重複スキップ` badge, not inserted on commit
- `StatusBadge` component in `csv-import-page.tsx`: renders `重複スキップ` (amber) when `row.isDuplicate`, `有効` (green) otherwise
- Preview table shows row number, ticker, company name, quantity, avg purchase price, account type, and status badge
- Commit button is disabled when `nonDuplicateCount === 0`
- Duplicate rows are rendered at 60% opacity (`opacity-60`) in the preview table

### 5. Portfolio page header no longer embeds `CsvImportSection` inline
- `CsvImportSection` import removed from `src/app/app/portfolio/page.tsx`
- Replaced with a `Link` to `/app/portfolio/import` with text "CSVインポート"
- Link is styled consistently with the existing `종목 검색` link

### 6. CSV format documentation shown in import page
- Import page Step 1 shows a format documentation card with example CSV:
  ```
  ticker,quantity,average_purchase_price,account_type,memo
  9433,100,4300,nisa,
  2914,50,3800,tokutei,JT特定口座分
  7203,200,2500,general,トヨタ
  ```
- Supported `account_type` values documented: `nisa`, `tokutei`, `general`

## Excluded Scope Confirmed Not Implemented
- No merge/overwrite mode for duplicates (always skip)
- No brokerage-specific CSV formats
- No bulk delete or undo import
- No E2E tests added (Phase 04 scope)
