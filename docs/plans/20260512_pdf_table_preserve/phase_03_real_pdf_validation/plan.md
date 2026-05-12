# Phase 03: Real TDnet PDF Validation

## Goal

Verify that the coordinate-based table extraction produces correctly structured Markdown tables when run against real TDnet dividend disclosure PDFs stored in Supabase Storage. A lightweight validation script confirms that dividend tables (配当の状況, 1株当たり配当金) are rendered as `| ... |` rows rather than collapsed plain text, and that downstream AI parsing accuracy is not regressed.

## Prerequisites

- Phase 02 Completion Criteria are all met
- `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` is present
- At least one real TDnet PDF with a dividend table is accessible in Supabase Storage (disclosures with `parse_status = 'parsed'` and a `storage_path`)

## Implementation Scope

- New script `scripts/validate-pdf-table-extraction.mjs` that:
  1. Reads `.env.local` (same pattern as `debug-jobs.mjs`)
  2. Fetches a configurable number of recently parsed disclosures from the `disclosures` table that have a `storage_path`
  3. Downloads each PDF from Supabase Storage via the REST API
  4. Runs `extractTextFromPdf()` from `pdf-ai-parser.ts` (imported via `tsx` or compiled output) against each PDF
  5. Prints: disclosure title, extraction method, character count, whether `|` characters appear in the output (table detected), and the first 30 lines of extracted text
- No writes to the database — read-only validation
- Script accepts an optional `--limit N` CLI argument (default: 5)

## Core Tasks

1. **Create `scripts/validate-pdf-table-extraction.mjs`**
   - Load `.env.local` using the same `readFileSync` pattern as `debug-jobs.mjs`
   - Query `disclosures` table: `select=id,title,storage_path,disclosure_type` where `storage_path=not.is.null` and `parse_status=eq.parsed`, ordered by `updated_at.desc`, limit N
   - For each disclosure:
     - Download PDF bytes via `GET /storage/v1/object/authenticated/<storage_path>` with `Authorization: Bearer <SERVICE_ROLE_KEY>`
     - Import `extractTextFromPdf` from the compiled Edge Function shared module or via a thin Node.js wrapper that re-exports it using `pdfjs-dist` directly
     - Print a structured report per disclosure

2. **Handle Node.js / Deno module boundary**
   - `pdf-table-extractor.ts` is a Deno/Edge Function TypeScript module — it cannot be directly imported by a Node.js `.mjs` script
   - The script uses `pdfjs-dist/legacy/build/pdf.mjs` directly (already in `node_modules`) and inlines the core detection logic (`groupIntoRows`, `detectColumnAnchors`, `formatAsMarkdownTable`) as plain JavaScript functions
   - Constants (`Y_TOLERANCE = 4`, `COL_ANCHOR_TOLERANCE = 5`, `MIN_TABLE_ROWS = 2`, `MIN_TABLE_COLS = 2`) are copied from the TypeScript source and kept in sync manually
   - No `tsx`, `ts-node`, or Deno required — runs with `node scripts/validate-pdf-table-extraction.mjs`

3. **Validation output format**
   ```
   [1/5] 1234 - 配当予想の修正に関するお知らせ (earnings_revision)
     Method: pdfjs | Chars: 842 | Tables detected: YES (14 | chars)
     --- First 30 lines ---
     | 第2四半期末 | 前回予想 | 今回予想 | 増減 |
     | 中間配当 | 15.00 | 20.00 | +5.00 |
     ...
   ```

4. **Manual review checklist** (no automation — human eyes on output)
   - At least 3 of 5 sampled disclosures with dividend tables show `|` in extracted text
   - No disclosure that previously produced usable text now produces empty output
   - Extracted text length is comparable to or longer than before (tables add `|` chars, so length may increase slightly)

## Test Plan

- `npm run typecheck` (script is `.mjs`, not TypeScript — skip for script itself)
- `npm run lint` — script follows existing `.mjs` style in `scripts/`
- Run: `node scripts/validate-pdf-table-extraction.mjs --limit 5`
- Review printed output manually against the checklist in Core Task 4

## Completion Criteria

- `scripts/validate-pdf-table-extraction.mjs` exists and runs without error against the real Supabase project
- At least 3 of 5 sampled disclosures with dividend tables show `|` characters in extracted text
- No previously-usable disclosure now produces empty or unusably short text (character count ≥ 80% of pre-change baseline is acceptable)
- `npm run lint` passes for the new script

## Excluded From This Phase

- Automated regression CI for PDF extraction (no golden-file comparison in CI)
- A/B comparison of AI parse accuracy scores before and after (qualitative manual review only)
- Triggering re-parse jobs on the production database
