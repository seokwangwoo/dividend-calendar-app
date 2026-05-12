# Phase 02: Unit Tests and Validation

## Goal

Cover all exported functions in `pdf-table-extractor.ts` with unit tests and confirm that the coordinate-based extraction produces well-formed Markdown tables from realistic TDnet dividend table fixtures, while all existing tests continue to pass.

## Prerequisites

- Phase 01 Completion Criteria are all met
- `supabase/functions/_shared/pdf-table-extractor.ts` exists and all functions are exported
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:unit` pass

## Implementation Scope

- New test file `src/features/disclosures/pdf-table-extractor.test.ts`
- Fixture data: `PositionedTextItem[]` arrays simulating realistic TDnet dividend table layouts
- Full coverage of `groupIntoRows`, `detectColumnAnchors`, `formatAsMarkdownTable`, `extractStructuredPageText`
- Edge case coverage:
  - Item with no `transform` property → treated as x=0, y=0 (fallback)
  - Table with only 1 row → plain text output (below `MIN_TABLE_ROWS`)
  - Table with only 1 column → plain text output (below `MIN_TABLE_COLS`)
  - Mixed layout: table block followed by plain text, followed by another table block
  - Rows with different column counts → missing cells filled with empty string

## Core Tasks

1. **Define fixture helpers**
   - Helper `makeItem(str, x, y, width?, hasEOL?): PositionedTextItem` for concise fixture construction
   - Three fixture sets:
     - `flatTextItems`: no table structure (items scattered at random x/y positions)
     - `dividendTableItems`: 3 rows × 5 columns mimicking 配当の状況 table (前期実績/今回予想/修正予想 × 第1Q/第2Q/年計)
     - `mixedPageItems`: non-table header text + dividend table + plain text footer

2. **Tests for `groupIntoRows`**
   - Items with identical y → one group
   - Items within `Y_TOLERANCE` → one group
   - Items beyond `Y_TOLERANCE` → separate groups
   - Within each group, items are sorted by ascending x

3. **Tests for `detectColumnAnchors`**
   - `dividendTableItems`: returns 5 anchors at expected x-positions
   - Single-row input: returns empty array (below `MIN_TABLE_ROWS`)
   - All items in one column: returns 1 anchor (below `MIN_TABLE_COLS` → table not rendered, handled in `extractStructuredPageText`)

4. **Tests for `formatAsMarkdownTable`**
   - Output string contains `|` characters
   - No `|---|` separator row appears in the output
   - Each row has the correct number of cells (empty string for missing columns)
   - Cell text matches the source `str` values

5. **Tests for `extractStructuredPageText`**
   - `dividendTableItems` → output is a Markdown table (contains `|`)
   - `flatTextItems` → output is plain text (no `|`)
   - `mixedPageItems` → table section is Markdown, plain sections are plain text
   - Empty input (`[]`) → returns empty string

6. **Regression check**
   - `npm run test:unit` runs `pdf-ai-parser.test.ts` and `parser-fixtures.test.ts` without failures
   - No changes to those existing test files are required

## Test Plan

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:unit` — all tests pass, new test file included
- Confirm new test file path: `src/features/disclosures/pdf-table-extractor.test.ts`

## Completion Criteria

- `src/features/disclosures/pdf-table-extractor.test.ts` exists with tests for all 4 exported functions
- All edge cases listed in Implementation Scope have at least one test
- `npm run test:unit` passes with zero failures (existing + new tests)
- `npm run typecheck` / `npm run lint` / `npm run build` all pass

## Excluded From This Phase

- Integration tests using real TDnet PDF binary files (network-free unit tests only)
- E2E tests
- Quantitative AI accuracy evaluation (golden dataset A/B testing)
- Expanding legacy extraction test coverage
