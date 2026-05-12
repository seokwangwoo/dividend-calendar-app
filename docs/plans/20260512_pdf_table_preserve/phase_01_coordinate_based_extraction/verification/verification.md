# Phase 01 Verification: Coordinate-Based Table Extraction

- **Phase file:** `docs/plans/20260512_pdf_table_preserve/phase_01_coordinate_based_extraction/plan.md`
- **Date:** 2026-05-12
- **Environment:** Ubuntu 22.04, Node.js (via npm), worktree `phase/pdf_table_preserve/01`

## Test Plan Items

| Item | Status | Notes |
|---|---|---|
| `npm run typecheck` | PASS | No type errors |
| `npm run lint` | PASS | Zero ESLint warnings |
| `npm run build` | PASS | Build succeeded |
| `npm run test:unit` | PASS (pre-existing failures unchanged) | 5 files / 46 tests failing on both main and worktree — identical baseline |
| Manual: exported signatures of `extractTextFromPdf` and `prepareTextForAI` unchanged | PASS | Verified via grep |
| `trimToDividendSections` not modified | PASS | Function body and `includes()` keyword matching untouched |

## Commands Run

```
cd /home/seo/OneDrive/linux/projects/dividend-calendar-app-wt-01

npm run typecheck
# Exit 0 — no output (clean)

npm run lint
# Exit 0 — no output (clean)

npm run build
# Exit 0 — Next.js build succeeded

npm run test:unit
# Test Files  5 failed | 40 passed (45)
# Tests  46 failed | 557 passed (603)
# Same counts as main branch — failures are pre-existing

grep -n "^export" supabase/functions/_shared/pdf-ai-parser.ts
# Confirmed extractTextFromPdf and prepareTextForAI signatures unchanged
```

## Pre-existing Test Failures

The 5 failing test files / 46 failing tests are identical on the `main` branch before any changes. They are not introduced by this phase. Root cause: unrelated mock setup issues in `src/features/stocks/queries.test.ts` and other files.

## Post-Audit Fixes Applied

Two MINOR issues flagged by audit were fixed before commit:
1. Removed dead variable `tableAnchors` (line 191 in original) — `detectColumnAnchors` was called twice per table block.
2. Collapsed dead if/else in `formatAsMarkdownTable` — both branches were identical; consolidated to a single assignment.

Typecheck and lint re-run after fixes: both pass.

## Completion Criteria Check

- [x] `supabase/functions/_shared/pdf-table-extractor.ts` exists and exports: `PositionedTextItem`, `isPositionedTextItem`, `Y_TOLERANCE`, `COL_ANCHOR_TOLERANCE`, `MIN_TABLE_ROWS`, `MIN_TABLE_COLS`, `groupIntoRows`, `detectColumnAnchors`, `formatAsMarkdownTable`, `extractStructuredPageText`
- [x] `extractTextWithPdfjs()` in `pdf-ai-parser.ts` uses `extractStructuredPageText()` — old inline loop removed
- [x] `extractTextFromPdf()` and `prepareTextForAI()` signatures unchanged
- [x] `trimToDividendSections()` not modified
- [x] `npm run typecheck` passes
- [x] `npm run lint` passes
- [x] `npm run build` passes
- [x] `npm run test:unit` — no regressions from baseline
