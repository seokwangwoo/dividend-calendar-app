# Phase 01: Coordinate-Based Table Extraction

## Goal

Introduce coordinate-based table detection into `extractTextWithPdfjs()` by creating a new shared module `pdf-table-extractor.ts`. Dividend tables (e.g., 配当の状況, 1株当たり配当金) will be reconstructed as Markdown tables, so columns like 前回予想/今回予想/前期実績 are correctly aligned when sent to the AI.

## Prerequisites

- `supabase/functions/_shared/pdf-ai-parser.ts` exists with working `extractTextWithPdfjs()` and `isTextContentItem()`
- `pdfjs-dist` v4.10.38 is listed as a dependency in `package.json`
- `npm run typecheck`, `npm run lint` pass from a clean state

## Implementation Scope

- Create `supabase/functions/_shared/pdf-table-extractor.ts` with all table detection logic
- Update `extractTextWithPdfjs()` in `pdf-ai-parser.ts` to use `extractStructuredPageText()` from the new module
- Detection thresholds (defined as named constants in `pdf-table-extractor.ts`):
  - `Y_TOLERANCE = 4` — max y-coordinate difference to consider two items on the same row (points)
  - `COL_ANCHOR_TOLERANCE = 5` — max x-coordinate difference to cluster items into the same column (points)
  - `MIN_TABLE_ROWS = 2` — minimum row count for a block to be treated as a table
  - `MIN_TABLE_COLS = 2` — minimum column count for a block to be treated as a table

## Core Tasks

1. **Create `pdf-table-extractor.ts`**
   - Define and export `PositionedTextItem`: `{ str: string; x: number; y: number; width: number; hasEOL: boolean }`
   - Define and export `isPositionedTextItem(item: unknown): item is { str: string; transform?: number[]; width?: number; hasEOL?: boolean }` type guard
   - Export all detection constants: `Y_TOLERANCE`, `COL_ANCHOR_TOLERANCE`, `MIN_TABLE_ROWS`, `MIN_TABLE_COLS`

2. **Implement `groupIntoRows(items: PositionedTextItem[]): PositionedTextItem[][]`**
   - Sort items by descending y-coordinate (PDF origin is bottom-left)
   - Bucket items whose y-coordinates are within `Y_TOLERANCE` of the bucket's representative y
   - Within each bucket, sort items by ascending x-coordinate
   - Export from `pdf-table-extractor.ts`

3. **Implement `detectColumnAnchors(rows: PositionedTextItem[][]): number[]`**
   - Collect the x-coordinate of **every item** in every row (not just the first item per row)
   - Cluster x-values within `COL_ANCHOR_TOLERANCE` using representative value (mean of cluster)
   - Keep only clusters that appear in `MIN_TABLE_ROWS` or more distinct rows
   - Return sorted list of anchor x-values
   - Export from `pdf-table-extractor.ts`

4. **Implement `formatAsMarkdownTable(rows: PositionedTextItem[][], anchors: number[]): string`**
   - For each row, assign each item to the nearest anchor column (within `COL_ANCHOR_TOLERANCE`); fill missing columns with empty string
   - Join cells with ` | ` and wrap with leading/trailing `|`
   - Do **not** insert a `|---|` separator row — output is pure data rows only, letting the AI infer structure from context
   - Return the complete Markdown table string
   - Export from `pdf-table-extractor.ts`

5. **Implement `extractStructuredPageText(items: PositionedTextItem[]): string`**
   - Call `groupIntoRows()` to get all row groups for the page
   - Scan row groups top-to-bottom to identify contiguous "table candidate" blocks: a consecutive run of rows where `detectColumnAnchors()` returns `MIN_TABLE_COLS` or more anchors shared across `MIN_TABLE_ROWS` or more rows in that run
   - For each contiguous table block: call `formatAsMarkdownTable()`
   - For each non-table row (before, between, or after table blocks): output as plain space-joined text with a newline
   - Join all segments with newlines; table blocks are surrounded by blank lines for readability
   - Export from `pdf-table-extractor.ts`

6. **Update `extractTextWithPdfjs()` in `pdf-ai-parser.ts`**
   - Import `isPositionedTextItem`, `PositionedTextItem`, `extractStructuredPageText` from `./pdf-table-extractor`
   - Replace the inner `for (const item of content.items)` loop with:
     1. Map `content.items` through `isPositionedTextItem` to produce `PositionedTextItem[]`, using `x = item.transform?.[4] ?? 0`, `y = item.transform?.[5] ?? 0`, `width = item.width ?? 0`
     2. Call `extractStructuredPageText(positionedItems)` to get the page string
   - Keep existing page-skip logic (empty page check) and page join logic unchanged

## Test Plan

- `npm run typecheck` — no type errors
- `npm run lint` — zero ESLint warnings
- `npm run build` — no build errors
- `npm run test:unit` — all existing tests pass (unit tests for new code added in Phase 02)
- Manual check: confirm exported signatures of `extractTextFromPdf` and `prepareTextForAI` are unchanged

## Completion Criteria

- `supabase/functions/_shared/pdf-table-extractor.ts` exists and exports: `PositionedTextItem`, `isPositionedTextItem`, `Y_TOLERANCE`, `COL_ANCHOR_TOLERANCE`, `MIN_TABLE_ROWS`, `MIN_TABLE_COLS`, `groupIntoRows`, `detectColumnAnchors`, `formatAsMarkdownTable`, `extractStructuredPageText`
- `extractTextWithPdfjs()` in `pdf-ai-parser.ts` uses `extractStructuredPageText()` and no longer contains the inline item loop
- `extractTextFromPdf()` and `prepareTextForAI()` signatures are unchanged
- `trimToDividendSections()` is **not modified** — its line-by-line `includes()` keyword matching continues to work correctly with Markdown table output (the `|` delimiters do not interfere with keyword detection)
- `npm run typecheck` / `npm run lint` / `npm run build` all pass
- `npm run test:unit` — all existing tests pass

## Excluded From This Phase

- Unit tests for the new functions (Phase 02)
- Changes to `extractTextFromPdfLegacy()`
- AI prompt modifications
- Real TDnet PDF integration validation (Phase 02)
