# PDF Table Preservation for Improved AI Parsing Accuracy

## Purpose

When extracting Japanese stock dividend information from PDFs, tables are converted to linear text, losing column and row structure, which degrades AI parsing accuracy. This plan uses PDF.js coordinate information (`transform[4]` = x, `transform[5]` = y) to group items into rows and detect column boundaries, reconstructing tables in Markdown format before sending to AI.

## Source Specifications

- `supabase/functions/_shared/pdf-ai-parser.ts` — primary implementation file (1936 lines)
- Existing plan `docs/plans/260508_pdf_ai_dividend_collection_mvp/` — PDF AI parse foundation

## Fixed Stack

| Area | Decision |
|---|---|
| PDF Library | `pdfjs-dist` v4.10.38 (unchanged) |
| Language | TypeScript / Deno (Edge Functions) |
| Tests | Vitest (unit tests in `src/`) |
| AI | OpenAI gpt-4o / gpt-4o-mini (unchanged) |

## Scope

Must include:

- New file `supabase/functions/_shared/pdf-table-extractor.ts` containing all table detection and formatting logic
- Row grouping using PDF.js `TextItem` y-coordinates (same row if within `Y_TOLERANCE = 4pt`)
- Column boundary detection (x-coordinate clustering across multiple rows)
- Markdown `| col | col |` output for detected table regions
- Plain text output for non-table regions (preserving existing behavior)
- Graceful fallback when `transform` property is absent on a TextItem (treat as x=0, y=0)
- `extractTextWithPdfjs()` in `pdf-ai-parser.ts` updated to call `extractStructuredPageText()` from the new module
- Unit tests at `src/features/disclosures/pdf-table-extractor.test.ts`

Excluded from this plan:

- Modifying the AI prompt (existing prompt already handles Markdown tables adequately)
- Table detection for `extractTextFromPdfLegacy()`
- Changes to the direct PDF fallback path (base64 submission)
- Handling merged cells (colspan / rowspan)
- Per-format tuning for EDINET / company_ir PDFs

## Phase Order

1. [Phase 01: Coordinate-Based Table Extraction](./phase_01_coordinate_based_extraction/plan.md)
2. [Phase 02: Unit Tests and Validation](./phase_02_tests_and_validation/plan.md)
3. [Phase 03: Real TDnet PDF Validation](./phase_03_real_pdf_validation/plan.md)

## Development Rules

- All new table detection logic goes in `supabase/functions/_shared/pdf-table-extractor.ts`
- `pdf-ai-parser.ts` imports from `pdf-table-extractor.ts` — no logic duplication
- Exported signatures of `extractTextFromPdf` and `prepareTextForAI` must not change
- New functions in `pdf-table-extractor.ts` are all exported (enabling direct unit testing)

## Common Domain Terms

| Term | Meaning |
|---|---|
| TextItem | A single text fragment returned by PDF.js. Has `str`, `transform`, `width`, `hasEOL` |
| transform | PDF.js affine matrix `[a,b,c,d,x,y]`. `transform[4]` = x, `transform[5]` = y |
| y-bucket | A row group formed by clustering items with nearby y-coordinates |
| col-anchor | A shared x-coordinate value that identifies a column boundary |
| markdown table | Markdown format: `\| col \| col \|` rows — no `\|---|---\|` separator (pure data rows only) |
| PositionedTextItem | Normalized item: `{ str, x, y, width, hasEOL }` |

## Plan Completion Definition

The plan is complete when:

- `extractTextWithPdfjs()` produces Markdown tables for tabular PDF content
- Non-table text is output as plain text identical in behavior to the previous implementation
- `npm run typecheck`, `npm run lint`, `npm run build` all pass
- All existing unit tests pass
- New unit tests cover all exported functions in `pdf-table-extractor.ts`
- `scripts/validate-pdf-table-extraction.mjs` confirms ≥ 3 of 5 sampled real TDnet PDFs show table structure in extracted text

## Document Maintenance

- If implementation diverges from these files, update the affected phase plan before continuing
- Keep each phase file under 500 lines
- Add follow-up improvements (e.g., EDINET-specific tuning) to a later plan rather than expanding scope here
