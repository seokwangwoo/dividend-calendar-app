# pdftotext Pipeline Integration

## Purpose

Replace pdf.js coordinate-based text extraction in the TDnet dividend disclosure PDF parsing pipeline with `pdftotext -layout` (poppler). GitHub Actions ubuntu-latest runners have poppler pre-installed. A new extraction step between the PDF download job and the AI parse job runs `pdftotext -layout` on each newly-downloaded PDF and stores the resulting text in a new `disclosures.extracted_text` DB column. The `process-jobs` Edge Function is updated to accept a `supported_types` parameter so GitHub Actions can invoke it for download-only or parse-only passes, with the pdftotext extraction step in between.

The pdf.js path is kept as a runtime fallback for disclosures where `extracted_text` is NULL.

## Source Specifications

- `supabase/functions/process-jobs/index.ts` — main Edge Function
- `supabase/functions/_shared/pdf-ai-parser.ts` — `executeParseDisclosurePdfAi`, `DisclosureForParse`
- `.github/workflows/collect-disclosures.yml` — existing pipeline workflow
- `supabase/migrations/` — migration naming conventions

## Fixed Stack

| Area | Decision |
|---|---|
| Database | Supabase PostgreSQL |
| DB change delivery | Supabase CLI migration file |
| Edge Functions | Deno / TypeScript |
| Text extraction (new) | `pdftotext -layout` (poppler, available on ubuntu-latest) |
| Text extraction (fallback) | pdf.js + pdf-table-extractor.ts (unchanged) |
| CI/CD | GitHub Actions |
| AI | OpenAI gpt-4o / gpt-4o-mini (unchanged) |

## Scope

Must include:

- `disclosures.extracted_text TEXT` column (nullable) added via Supabase migration
- `process-jobs` Edge Function: accept `supported_types` array in request body to restrict which job types are processed
- `DisclosureForParse` type: add optional `extracted_text` field
- `fetchDisclosureForParse` query: include `extracted_text` in SELECT
- `executeParseDisclosurePdfAi`: when `disclosure.extracted_text` is non-null, use it directly via `trimToDividendSections` + `isTextUsable` instead of calling `prepareTextForAI`
- `.github/workflows/collect-disclosures.yml`: split existing `process-jobs` job into three jobs — `download`, `extract`, `parse`
  - `download` job: calls `process-jobs` with `supported_types: ["download_disclosure_pdf"]`
  - `extract` job: uses `pdftotext -layout` on each newly-downloaded PDF (fetched from Supabase Storage via signed URL), stores text in `disclosures.extracted_text`
  - `parse` job: calls `process-jobs` with `supported_types: ["parse_disclosure_pdf_ai"]`

Excluded from this plan:

- Removing pdf.js code entirely
- Modifying the AI prompt
- Changing the admin UI
- Changing how `dividend_reviews` are stored
- Modifying `pdf-table-extractor.ts` (Phase 01 of 20260512_pdf_table_preserve — already committed)
- E2E tests

## Phase Order

1. [Phase 01: DB Migration — add extracted_text column](./phase_01_db_migration/plan.md)
2. [Phase 02: Edge Function Changes — supported_types + use extracted_text](./phase_02_edge_function_changes/plan.md)
3. [Phase 03: GitHub Actions Workflow — split + pdftotext step](./phase_03_github_actions_workflow/plan.md)

## Development Rules

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.
- The pdf.js fallback path in `executeParseDisclosurePdfAi` must remain operational when `extracted_text` is NULL.
- Do not modify `pdf-table-extractor.ts` — it is owned by the `20260512_pdf_table_preserve` plan.
- The `supported_types` parameter is optional; when absent, the Edge Function processes all supported types (backwards-compatible).
- Phases must be executed in order: Phase 01 deploys the column before Phase 02 reads it; Phase 02 deploys the Edge Function before Phase 03 calls it.

## Common Domain Terms

| Term | Meaning |
|---|---|
| extracted_text | pdftotext -layout output stored in disclosures table; null means not yet extracted |
| supported_types | Optional JSON array in process-jobs request body restricting which job types are processed |
| download job | process-jobs invocation limited to `download_disclosure_pdf` job type |
| parse job | process-jobs invocation limited to `parse_disclosure_pdf_ai` job type |
| pdftotext -layout | poppler CLI tool; preserves column layout using whitespace, significantly better than pdf.js for Japanese tabular PDFs |

## Plan Completion Definition

The plan is complete when:

- `disclosures.extracted_text` column exists in the remote DB
- `process-jobs` Edge Function accepts `supported_types` and routes accordingly
- `executeParseDisclosurePdfAi` uses `disclosure.extracted_text` when non-null, skipping pdf.js entirely
- The GitHub Actions workflow has three jobs: `download`, `extract`, `parse` — with `extract` running `pdftotext -layout` and writing to `disclosures.extracted_text`
- `npm run typecheck` and `npm run lint` pass
- Existing unit tests pass

## Document Maintenance

- If implementation diverges from these files, update the affected phase document before continuing.
- Keep each phase document below 500 lines.
- Add follow-up work (e.g., backfill existing PDFs, monitoring) to a later plan.
