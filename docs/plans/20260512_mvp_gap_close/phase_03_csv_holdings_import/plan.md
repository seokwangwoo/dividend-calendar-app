# Phase 03: CSV Holdings Import

## Goal

Refine the existing partial CSV import implementation — which currently lacks duplicate detection and lives inline in the portfolio page — into a complete, robust `/app/portfolio/import` page. Users can upload a CSV, see a row-level preview with validation errors and duplicate warnings, and commit only the valid non-duplicate rows.

## Prerequisites

- Phase 02 Completion Criteria are met.
- `src/features/holdings/csv-parser.ts` (`parseCsvHoldings`, `normalizeAccountType`) is stable.
- `src/features/holdings/actions.ts` exports `previewCsvHoldings` and `commitCsvHoldings`.
- `src/features/holdings/components/csv-import-section.tsx` (`CsvImportSection`) renders the upload → preview → confirm flow inline.

## Current State

The CSV parser, preview action, commit action, and `CsvImportSection` component all exist and work end-to-end. Two gaps must be closed:

1. **No duplicate detection.** `commitCsvHoldings` inserts all valid rows without checking whether a matching non-deleted holding already exists for the same user, ticker, and account type.
2. **No dedicated page.** `CsvImportSection` is embedded inline in the portfolio page header; the upload/preview/confirm flow needs its own route.

## Implementation Scope

### 1. Duplicate detection in preview action

- In `src/features/holdings/actions.ts`, update `previewCsvHoldings` to query existing non-deleted holdings for the authenticated user.
- For each valid parsed row, check if a holding with the same `stock_id` and `account_type` already exists (`deleted_at IS NULL`).
- Add a `isDuplicate: boolean` flag to each `previewRow` in the returned `CsvPreviewResult`.
- Do not add duplicates to the `errors` list; duplicates are surfaced separately so the user can see them.

### 2. Duplicate skip in commit action

- In `commitCsvHoldings`, re-run the same duplicate check before inserting.
- Skip rows that are duplicates; do not insert them.
- Return `{ insertedCount: number, skippedCount: number }` instead of just `insertedCount`.

### 3. `/app/portfolio/import` page

- Create `src/app/app/portfolio/import/page.tsx` as a thin Server Component shell that renders a `CsvImportPage` client component.
- Create `src/features/holdings/components/csv-import-page.tsx` (or adapt `CsvImportSection`) with:
  - **Step 1 – Upload:** file picker for `.csv` files + paste text area fallback.
  - **Step 2 – Preview:** table showing valid rows (with `isDuplicate` badge for duplicates) and error rows separately. A `[インポート確定]` button is enabled only when at least one non-duplicate valid row exists.
  - **Step 3 – Result:** summary showing `insertedCount` rows added and `skippedCount` duplicates skipped. A `[포트폴리오로 戻る]` link returns to `/app/portfolio`.
- The preview table must show: row number, ticker, company name, quantity, average purchase price, account type, and status badge (`有効` / `重複スキップ` / `エラー`).

### 4. Portfolio page cleanup

- Remove the inline `<CsvImportSection />` from `src/app/app/portfolio/page.tsx`.
- Add a `[CSVインポート]` link button to the portfolio page header alongside `[종목 검색]` and `[+ 銘柄追加]`.
- The link navigates to `/app/portfolio/import`.

### 5. CSV format documentation

- Add a comment or helper text in the import page UI showing the expected CSV format:
  ```
  ticker,quantity,average_purchase_price,account_type,memo
  9433,100,4300,nisa,
  2914,50,3800,tokutei,JT特定口座分
  ```
- Supported `account_type` values: `nisa`, `tokutei`, `general` (and Japanese aliases already handled by `normalizeAccountType`).

## Core Tasks

1. **Add duplicate detection to `previewCsvHoldings`**
   - Query `holdings` where `user_id = auth.uid()` and `deleted_at IS NULL`.
   - Build a Set of `"${stock_id}:${account_type}"` keys.
   - Mark each `previewRow` with `isDuplicate`.

2. **Update `commitCsvHoldings` to skip duplicates**
   - Re-check duplicates before insert; filter them out.
   - Return `{ insertedCount, skippedCount }`.

3. **Update `CsvPreviewResult` type**
   - Add `isDuplicate: boolean` to the `previewRow` type.
   - Update `skippedCount` to `commitCsvHoldings` return type.

4. **Create `/app/portfolio/import` page and component**
   - Implement 3-step upload → preview → result flow in a dedicated page.
   - Show duplicate rows with `重複スキップ` badge in preview.
   - Show `insertedCount` + `skippedCount` in result step.

5. **Refactor portfolio page**
   - Remove inline `CsvImportSection` from `portfolio/page.tsx`.
   - Add `[CSVインポート]` link to portfolio header.

## Test Plan

- Run `npm run lint` — no warnings.
- Run `npm run typecheck` — no errors.
- Run `npm run build` — succeeds.
- Run `npm run test:unit` — all CSV parser tests pass.
- Manual: navigate to `/app/portfolio/import`; upload a CSV with valid rows; verify preview table shows rows with correct status badges.
- Manual: upload a CSV where one row has the same ticker+account_type as an existing holding; verify `重複スキップ` badge on that row; verify it is not inserted after commit.
- Manual: upload a CSV with an invalid row (bad ticker or missing field); verify the error row appears in the error section and does not block committing valid rows.
- Manual: after commit, verify `/app/portfolio` reflects the newly imported holdings.
- Manual: navigate to `/app/portfolio`; verify `CsvImportSection` is no longer inline; verify `[CSVインポート]` link is in the header.

## Completion Criteria

- `previewCsvHoldings` returns `isDuplicate: true` for rows that match an existing non-deleted holding.
- `commitCsvHoldings` skips duplicates and returns `{ insertedCount, skippedCount }`.
- `/app/portfolio/import` is accessible and shows the three-step flow.
- Duplicate rows are visible in the preview with a `重複スキップ` badge and are not inserted on commit.
- The portfolio page header no longer embeds `CsvImportSection` inline; a `[CSVインポート]` link is present instead.

## Excluded From This Phase

- Merge / overwrite mode for duplicates (always skip in this plan).
- Brokerage-specific CSV formats (SBI, Rakuten); only the generic format defined in `csv-parser.ts` is supported.
- Bulk delete or undo import.
- E2E tests for this flow (Phase 04).
